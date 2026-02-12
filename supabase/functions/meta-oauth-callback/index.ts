import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/encryption.ts";
import { corsHeaders } from "../_shared/cors.ts";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("law_firm_id")
      .eq("id", userId)
      .single();

    if (!profile?.law_firm_id) {
      return new Response(JSON.stringify({ error: "User has no tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lawFirmId = profile.law_firm_id;
    const body = await req.json();
    const { code, redirectUri, type, pageId } = body;

    if (!code || !redirectUri || !type) {
      return new Response(JSON.stringify({ error: "Missing code, redirectUri, or type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

    if (!META_APP_ID || !META_APP_SECRET) {
      return new Response(JSON.stringify({ error: "Meta app not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Exchange code for short-lived user token
    console.log("[meta-oauth] Exchanging code for token...");
    const tokenRes = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?` +
        new URLSearchParams({
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: redirectUri,
          code,
        })
    );

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("[meta-oauth] Token exchange failed:", tokenData.error);
      return new Response(JSON.stringify({ error: "OAuth token exchange failed", details: tokenData.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token (60 days)
    console.log("[meta-oauth] Getting long-lived token...");
    const longLivedRes = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          fb_exchange_token: shortLivedToken,
        })
    );

    const longLivedData = await longLivedRes.json();
    if (longLivedData.error) {
      console.error("[meta-oauth] Long-lived token failed:", longLivedData.error);
      return new Response(JSON.stringify({ error: "Failed to get long-lived token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userLongLivedToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000;

    // Step 3: Get pages managed by user
    console.log("[meta-oauth] Fetching managed pages...");
    const pagesRes = await fetch(
      `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userLongLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data?.length) {
      return new Response(JSON.stringify({ error: "No Facebook Pages found. Ensure your account manages at least one Page." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- WhatsApp Cloud: auto-detect WABA and phone numbers ---
    if (type === "whatsapp_cloud") {
      return await handleWhatsAppCloud(pagesData.data, userLongLivedToken, expiresIn, lawFirmId, supabaseAdmin);
    }

    // --- Instagram / Facebook flow (existing) ---
    // If no pageId specified, return available pages for user selection
    if (!pageId) {
      const pages = pagesData.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        hasInstagram: !!p.instagram_business_account?.id,
        igAccountId: p.instagram_business_account?.id || null,
      }));

      return new Response(
        JSON.stringify({ action: "select_page", pages }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Get the selected page's access token
    const selectedPage = pagesData.data.find((p: any) => p.id === pageId);
    if (!selectedPage) {
      return new Response(JSON.stringify({ error: "Selected page not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pageAccessToken = selectedPage.access_token;
    const pageName = selectedPage.name;
    const igAccountId = selectedPage.instagram_business_account?.id || null;

    if (type === "instagram" && !igAccountId) {
      return new Response(JSON.stringify({ 
        error: "This Page has no linked Instagram Professional account." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 5: Encrypt and save
    const encryptedToken = await encryptToken(pageAccessToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("meta_connections")
      .upsert(
        {
          law_firm_id: lawFirmId,
          type,
          page_id: pageId,
          page_name: pageName,
          ig_account_id: igAccountId,
          access_token: encryptedToken,
          token_expires_at: tokenExpiresAt,
          is_active: true,
        },
        { onConflict: "law_firm_id,type,page_id" }
      )
      .select("id")
      .single();

    if (saveError) {
      console.error("[meta-oauth] Error saving connection:", saveError);
      return new Response(JSON.stringify({ error: "Failed to save connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[meta-oauth] Connection saved:", { id: saved.id, type, pageName, hasIG: !!igAccountId });

    return new Response(
      JSON.stringify({
        success: true,
        connectionId: saved.id,
        pageName,
        type,
        igAccountId,
        expiresAt: tokenExpiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[meta-oauth] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Handle WhatsApp Cloud OAuth: detect WABA + phone numbers from pages
 */
async function handleWhatsAppCloud(
  pages: any[],
  userToken: string,
  expiresIn: number,
  lawFirmId: string,
  supabaseAdmin: any
) {
  const savedConnections: any[] = [];
  const errors: string[] = [];

  for (const page of pages) {
    try {
      // Get WABA linked to this page
      console.log(`[meta-oauth] Checking WABA for page ${page.name} (${page.id})...`);
      const wabaRes = await fetch(
        `${GRAPH_API_BASE}/${page.id}?fields=whatsapp_business_account&access_token=${userToken}`
      );
      const wabaData = await wabaRes.json();

      const wabaId = wabaData.whatsapp_business_account?.id;
      if (!wabaId) {
        console.log(`[meta-oauth] Page ${page.name} has no WABA linked, skipping`);
        continue;
      }

      // Get phone numbers from WABA
      console.log(`[meta-oauth] Fetching phone numbers for WABA ${wabaId}...`);
      const phonesRes = await fetch(
        `${GRAPH_API_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${userToken}`
      );
      const phonesData = await phonesRes.json();

      if (!phonesData.data?.length) {
        console.log(`[meta-oauth] WABA ${wabaId} has no phone numbers`);
        errors.push(`Página "${page.name}" tem WABA mas sem números de telefone`);
        continue;
      }

      // Save each phone number as a separate connection
      for (const phone of phonesData.data) {
        const phoneNumberId = phone.id;
        const displayName = phone.verified_name || phone.display_phone_number || page.name;

        // Use page access token (long-lived) for API calls
        const encryptedToken = await encryptToken(page.access_token);
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { data: saved, error: saveError } = await supabaseAdmin
          .from("meta_connections")
          .upsert(
            {
              law_firm_id: lawFirmId,
              type: "whatsapp_cloud",
              page_id: phoneNumberId, // phone_number_id for webhook matching
              page_name: `${displayName} (${phone.display_phone_number || ""})`.trim(),
              access_token: encryptedToken,
              token_expires_at: tokenExpiresAt,
              is_active: true,
            },
            { onConflict: "law_firm_id,type,page_id" }
          )
          .select("id")
          .single();

        if (saveError) {
          console.error(`[meta-oauth] Error saving WhatsApp Cloud connection:`, saveError);
          errors.push(`Erro ao salvar número ${phone.display_phone_number}`);
        } else {
          console.log(`[meta-oauth] WhatsApp Cloud connection saved:`, {
            id: saved.id,
            phoneNumberId,
            displayName,
          });
          savedConnections.push({
            id: saved.id,
            phoneNumberId,
            displayName,
            displayPhoneNumber: phone.display_phone_number,
          });
        }
      }
    } catch (err) {
      console.error(`[meta-oauth] Error processing page ${page.name}:`, err);
      errors.push(`Erro ao processar página "${page.name}"`);
    }
  }

  if (savedConnections.length === 0) {
    return new Response(
      JSON.stringify({
        error: "Nenhum número WhatsApp Business encontrado nas suas páginas do Facebook.",
        details: errors,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      type: "whatsapp_cloud",
      connections: savedConnections,
      connectionId: savedConnections[0].id,
      pageName: savedConnections[0].displayName,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
