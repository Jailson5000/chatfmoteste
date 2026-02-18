import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/encryption.ts";
import { corsHeaders } from "../_shared/cors.ts";

const GRAPH_API_VERSION = "v22.0";
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

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error("[meta-oauth] Auth error:", authError?.message || "No user");
      return new Response(JSON.stringify({ error: "Unauthorized", message: authError?.message || "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

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
    const { code, redirectUri, type, pageId, phoneNumberId, wabaId, step, encryptedPageToken } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy Instagram save step removed - Instagram now uses instagram_login flow only
    if (type === "instagram" && step === "save") {
      return new Response(JSON.stringify({ 
        error: "Fluxo legado descontinuado. Por favor, desconecte e reconecte o Instagram usando o botão Conectar.", 
        message: "Este fluxo foi substituído pelo Instagram Business Login nativo." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Instagram Business Login flow (native Instagram OAuth) ───
    if (type === "instagram" && body.flow === "instagram_login" && code) {
      const IG_APP_ID = Deno.env.get("META_INSTAGRAM_APP_ID");
      const IG_APP_SECRET = Deno.env.get("META_INSTAGRAM_APP_SECRET");

      if (!IG_APP_ID || !IG_APP_SECRET) {
        return new Response(JSON.stringify({ error: "Instagram app not configured (META_INSTAGRAM_APP_ID / META_INSTAGRAM_APP_SECRET)" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const igRedirectUri = body.redirectUri || "https://miauchat.com.br/auth/meta-callback";
      console.log("[meta-oauth] Instagram Business Login: exchanging code...");

      // 1. Exchange code for short-lived token via api.instagram.com
      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: IG_APP_ID,
          client_secret: IG_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: igRedirectUri,
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      console.log("[meta-oauth] IG token exchange result:", { hasToken: !!tokenData.access_token, userId: tokenData.user_id, error: tokenData.error_message });

      if (!tokenData.access_token) {
        return new Response(JSON.stringify({
          error: "Instagram token exchange failed",
          message: tokenData.error_message || tokenData.error_type || "Failed to get token",
          details: tokenData,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const shortToken = tokenData.access_token;
      const igUserId = String(tokenData.user_id);

      // 2. Exchange for long-lived token (60 days)
      console.log("[meta-oauth] IG: getting long-lived token...");
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortToken}`
      );
      const longData = await longRes.json();
      console.log("[meta-oauth] IG long-lived token result:", { hasToken: !!longData.access_token, expiresIn: longData.expires_in });

      const longToken = longData.access_token || shortToken;
      const expiresIn = longData.expires_in || 5184000;

      // 3. Get account info
      console.log("[meta-oauth] IG: fetching account info...");
      const meRes = await fetch(
        `https://graph.instagram.com/me?fields=user_id,username,name,profile_picture_url&access_token=${longToken}`
      );
      const me = await meRes.json();
      console.log("[meta-oauth] IG account info:", { userId: me.user_id, username: me.username, name: me.name });

      const igUsername = me.username || igUserId;
      const igName = me.name || igUsername;
      const igProfilePic = me.profile_picture_url || null;

      // 4. Subscribe to webhooks via graph.instagram.com
      console.log("[meta-oauth] IG: subscribing to webhooks...");
      let webhookResult: any = null;
      try {
        const subRes = await fetch(
          `https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages",
              access_token: longToken,
            }),
          }
        );
        webhookResult = await subRes.json();
        console.log("[meta-oauth] IG webhook subscription result:", JSON.stringify(webhookResult));
      } catch (subErr) {
        console.error("[meta-oauth] IG webhook subscription error:", subErr);
        webhookResult = { error: String(subErr) };
      }

      // 5. Encrypt token and save connection
      const encryptedIgToken = await encryptToken(longToken);
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const displayName = `${igName} (@${igUsername})`;

      const { data: savedIg, error: saveIgError } = await supabaseAdmin
        .from("meta_connections")
        .upsert(
          {
            law_firm_id: lawFirmId,
            type: "instagram",
            page_id: igUserId, // IG user ID as page_id for compatibility
            page_name: displayName,
            ig_account_id: igUserId,
            access_token: encryptedIgToken,
            token_expires_at: tokenExpiresAt,
            is_active: true,
            source: "oauth",
          },
          { onConflict: "law_firm_id,type,page_id" }
        )
        .select("id")
        .single();

      if (saveIgError) {
        console.error("[meta-oauth] Error saving Instagram Business Login connection:", saveIgError);
        return new Response(JSON.stringify({ error: "Failed to save connection" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[meta-oauth] Instagram Business Login connection saved:", { id: savedIg.id, username: igUsername });
      return new Response(JSON.stringify({
        success: true,
        connectionId: savedIg.id,
        pageName: displayName,
        type: "instagram",
        igAccountId: igUserId,
        igUsername,
        expiresAt: tokenExpiresAt,
        webhookSubscription: webhookResult,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
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

    // Step 1: Exchange code for token (Facebook flow - used for Facebook, Instagram, and WhatsApp)
    console.log("[meta-oauth] Exchanging code for token...");
    const tokenParams: Record<string, string> = {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      code,
    };
    if (redirectUri) {
      tokenParams.redirect_uri = redirectUri;
    }
    const tokenRes = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?` + new URLSearchParams(tokenParams)
    );

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("[meta-oauth] Token exchange failed:", tokenData.error);
      return new Response(JSON.stringify({ 
        error: "OAuth token exchange failed", 
        message: tokenData.error?.message || tokenData.error?.error_user_msg || "Token exchange failed",
        details: tokenData.error 
      }), {
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

    // --- WhatsApp Cloud via Embedded Signup (phoneNumberId + wabaId from frontend) ---
    // Must be checked BEFORE me/accounts, because Embedded Signup tokens don't have Pages
    if (type === "whatsapp_cloud" && phoneNumberId && wabaId) {
      console.log("[meta-oauth] WhatsApp Cloud Embedded Signup detected, skipping page fetch");
      return await handleWhatsAppCloudEmbedded(phoneNumberId, wabaId, userLongLivedToken, expiresIn, lawFirmId, supabaseAdmin);
    }

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

    // --- WhatsApp Cloud via legacy OAuth flow (auto-detect from pages) ---
    if (type === "whatsapp_cloud") {
      return await handleWhatsAppCloud(pagesData.data, userLongLivedToken, expiresIn, lawFirmId, supabaseAdmin);
    }

    // --- Instagram: reject legacy Facebook-based flow, require instagram_login ---
    if (type === "instagram") {
      return new Response(JSON.stringify({ 
        error: "Fluxo legado descontinuado. Por favor, desconecte e reconecte o Instagram usando o botão Conectar.",
        message: "Instagram agora usa Instagram Business Login nativo. Reconecte para obter o token correto."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Facebook flow ---
    let selectedPage: any;
    if (pageId) {
      selectedPage = pagesData.data.find((p: any) => p.id === pageId);
    } else {
      selectedPage = pagesData.data[0];
    }

    if (!selectedPage) {
      return new Response(JSON.stringify({ error: "No suitable page found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("[meta-oauth] Auto-selected page:", selectedPage.name, selectedPage.id);

    const pageAccessToken = selectedPage.access_token;
    const pageName = selectedPage.name;
    const igAccountId = selectedPage.instagram_business_account?.id || null;

    // Step 5: Encrypt and save
    const encryptedToken = await encryptToken(pageAccessToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("meta_connections")
      .upsert(
        {
          law_firm_id: lawFirmId,
          type,
          page_id: selectedPage.id,
          page_name: pageName,
          ig_account_id: igAccountId,
          access_token: encryptedToken,
          token_expires_at: tokenExpiresAt,
          is_active: true,
          source: "oauth",
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

    // Subscribe page to webhooks (required for receiving messages)
    try {
      const subscribeFields = type === "instagram"
        ? "messages,messaging_postbacks,messaging_optins"
        : "messages,messaging_postbacks,messaging_optins";

      console.log("[meta-oauth] Subscribing page to webhooks:", selectedPage.id);
      const subRes = await fetch(
        `${GRAPH_API_BASE}/${selectedPage.id}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscribed_fields: subscribeFields,
            access_token: pageAccessToken,
          }),
        }
      );
      const subData = await subRes.json();
      console.log("[meta-oauth] Subscribe result:", subData);
    } catch (subErr) {
      console.error("[meta-oauth] Failed to subscribe page (non-blocking):", subErr);
    }

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
          waba_id: wabaId,
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

/**
 * Handle WhatsApp Cloud via Embedded Signup: phoneNumberId and wabaId come directly from frontend
 */
async function handleWhatsAppCloudEmbedded(
  phoneNumberId: string,
  wabaId: string,
  userToken: string,
  expiresIn: number,
  lawFirmId: string,
  supabaseAdmin: any
) {
  try {
    // Fetch phone number details from Graph API for display name
    console.log(`[meta-oauth] Embedded Signup: fetching phone ${phoneNumberId} details...`);
    const phoneRes = await fetch(
      `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating&access_token=${userToken}`
    );
    const phoneData = await phoneRes.json();

    const displayName = phoneData.verified_name || phoneData.display_phone_number || phoneNumberId;
    const displayPhone = phoneData.display_phone_number || "";

    const encryptedToken = await encryptToken(userToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("meta_connections")
      .upsert(
        {
          law_firm_id: lawFirmId,
          type: "whatsapp_cloud",
          page_id: phoneNumberId,
          page_name: `${displayName} (${displayPhone})`.trim(),
          access_token: encryptedToken,
          token_expires_at: tokenExpiresAt,
          is_active: true,
          waba_id: wabaId,
        },
        { onConflict: "law_firm_id,type,page_id" }
      )
      .select("id")
      .single();

    if (saveError) {
      console.error("[meta-oauth] Error saving Embedded Signup connection:", saveError);
      return new Response(JSON.stringify({ error: "Failed to save connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[meta-oauth] Embedded Signup connection saved:", { id: saved.id, phoneNumberId, wabaId, displayName });

    return new Response(
      JSON.stringify({
        success: true,
        type: "whatsapp_cloud",
        connectionId: saved.id,
        pageName: `${displayName} (${displayPhone})`.trim(),
        phoneNumberId,
        wabaId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[meta-oauth] Embedded Signup error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// Legacy handleInstagramBusiness removed - Instagram now uses Facebook OAuth flow with page picker
