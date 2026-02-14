import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const { code, redirectUri, type, pageId, phoneNumberId, wabaId } = body;

    if (!code || !type) {
      return new Response(JSON.stringify({ error: "Missing code or type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
    const META_INSTAGRAM_APP_ID = Deno.env.get("META_INSTAGRAM_APP_ID") || "1447135433693990";
    const rawIgSecret = Deno.env.get("META_INSTAGRAM_APP_SECRET");
    const META_INSTAGRAM_APP_SECRET = rawIgSecret || META_APP_SECRET;
    console.log("[meta-oauth] Instagram secret config:", {
      hasOwnSecret: !!rawIgSecret,
      usingFallback: !rawIgSecret,
      secretPrefix: META_INSTAGRAM_APP_SECRET?.substring(0, 4) + "...",
      fbSecretPrefix: META_APP_SECRET?.substring(0, 4) + "...",
    });

    if (!META_APP_ID || !META_APP_SECRET) {
      return new Response(JSON.stringify({ error: "Meta app not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instagram Business Login uses separate endpoints (api.instagram.com)
    // Must be handled before the Facebook token exchange
    if (type === "instagram") {
      // Force consistent redirect_uri - must match exactly what frontend used in OAuth dialog
      const INSTAGRAM_FIXED_REDIRECT = "https://miauchat.com.br/auth/meta-callback";
      const igRedirectUri = redirectUri || INSTAGRAM_FIXED_REDIRECT;
      console.log("[meta-oauth] Instagram Business Login detected", {
        receivedRedirectUri: redirectUri,
        usingRedirectUri: igRedirectUri,
        appId: META_INSTAGRAM_APP_ID,
        codePrefix: code?.substring(0, 20) + "...",
      });
      return await handleInstagramBusiness(code, igRedirectUri, META_INSTAGRAM_APP_ID, META_INSTAGRAM_APP_SECRET!, lawFirmId, supabaseAdmin);
    }

    // Step 1: Exchange code for token (Facebook flow - used for Facebook and WhatsApp only)
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

    // --- Facebook flow ---
    // --- Facebook flow ---
    // Auto-select page: use pageId if provided, otherwise pick the first suitable page
    let selectedPage: any;
    if (pageId) {
      selectedPage = pagesData.data.find((p: any) => p.id === pageId);
    } else if (type === "instagram") {
      // Pick first page that has an Instagram business account
      selectedPage = pagesData.data.find((p: any) => !!p.instagram_business_account?.id) || pagesData.data[0];
    } else {
      // Facebook: pick first page
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

/**
 * Handle Instagram Business API OAuth flow.
 * Uses different endpoints than Facebook for token exchange.
 */
async function handleInstagramBusiness(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
  lawFirmId: string,
  supabaseAdmin: any
) {
  try {
    // Step 1: Exchange code for short-lived Instagram token
    console.log("[meta-oauth] Instagram: exchanging code for short-lived token...", {
      redirectUri,
      appId,
      codeLength: code?.length,
      codePrefix: code?.substring(0, 15),
    });
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    const tokenRawText = await tokenRes.text();
    console.log("[meta-oauth] Instagram token response", {
      status: tokenRes.status,
      body: tokenRawText.substring(0, 500),
    });

    let tokenData: any;
    try { tokenData = JSON.parse(tokenRawText); } catch { tokenData = { error_message: tokenRawText }; }

    if (tokenData.error_type || tokenData.error_message || tokenData.error) {
      console.error("[meta-oauth] Instagram token exchange failed:", tokenData);
      return new Response(JSON.stringify({ 
        error: "Instagram token exchange failed", 
        message: tokenData.error_message || tokenData.error?.message || tokenData.error_type || "Unknown Instagram error",
        details: tokenData.error_message || tokenData.error_type 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id;
    console.log("[meta-oauth] Instagram: got short-lived token for user", igUserId);

    // Step 2: Exchange for long-lived token (60 days)
    console.log("[meta-oauth] Instagram: exchanging for long-lived token...");
    const longLivedRes = await fetch(
      `https://graph.instagram.com/access_token?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: shortLivedToken,
        })
    );

    const longLivedData = await longLivedRes.json();
    if (longLivedData.error) {
      console.error("[meta-oauth] Instagram long-lived token failed:", longLivedData.error);
      // Fall back to short-lived token
      console.log("[meta-oauth] Instagram: falling back to short-lived token");
    }

    const finalToken = longLivedData.access_token || shortLivedToken;
    const expiresIn = longLivedData.expires_in || 3600;

    // Step 3: Get user profile info
    console.log("[meta-oauth] Instagram: fetching user profile...");
    const profileRes = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/me?fields=user_id,username,name,profile_picture_url&access_token=${finalToken}`
    );
    const profileData = await profileRes.json();
    
    const username = profileData.username || `ig_${igUserId}`;
    const displayName = profileData.name || username;
    console.log("[meta-oauth] Instagram: profile fetched:", { username, displayName });

    // Step 4: Encrypt and save
    const encryptedToken = await encryptToken(finalToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("meta_connections")
      .upsert(
        {
          law_firm_id: lawFirmId,
          type: "instagram",
          page_id: String(igUserId),
          page_name: `${displayName} (@${username})`,
          ig_account_id: String(igUserId),
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
      console.error("[meta-oauth] Error saving Instagram connection:", saveError);
      return new Response(JSON.stringify({ error: "Failed to save connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[meta-oauth] Instagram connection saved:", { id: saved.id, username });

    return new Response(
      JSON.stringify({
        success: true,
        connectionId: saved.id,
        pageName: `${displayName} (@${username})`,
        type: "instagram",
        igAccountId: String(igUserId),
        expiresAt: tokenExpiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[meta-oauth] Instagram Business error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Instagram auth failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

