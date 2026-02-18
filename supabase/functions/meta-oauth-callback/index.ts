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
    const { code, redirectUri, type, pageId, phoneNumberId, wabaId, step, encryptedPageToken } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instagram save step: use encrypted token directly, skip OAuth code exchange
    if (type === "instagram" && step === "save" && encryptedPageToken && pageId) {
      console.log("[meta-oauth] Instagram save step: using encrypted token directly");
      const { decryptToken } = await import("../_shared/encryption.ts");
      const pageAccessToken = await decryptToken(encryptedPageToken);
      
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      // Use frontend-provided data as primary source (avoids Graph API re-fetch failures)
      const { igAccountId: frontendIgAccountId, igName: frontendIgName, 
              igUsername: frontendIgUsername, pageName: frontendPageName } = body;
      
      // Only fetch from Graph API if frontend didn't provide the data
      let igBizId = frontendIgAccountId || null;
      let igUsername: string | null = frontendIgUsername || null;
      let igName: string | null = frontendIgName || null;
      let apiPageName: string | null = frontendPageName || null;
      
      if (!igBizId) {
        console.log("[meta-oauth] No frontend IG data, falling back to Graph API lookup");
        const GRAPH_API_BASE_LOCAL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
        try {
          const pageInfoRes = await fetch(
            `${GRAPH_API_BASE_LOCAL}/${pageId}?fields=name,instagram_business_account&access_token=${pageAccessToken}`
          );
          const pageInfo = await pageInfoRes.json();
          igBizId = pageInfo.instagram_business_account?.id || null;
          apiPageName = apiPageName || pageInfo.name || null;
          
          if (igBizId) {
            try {
              const igRes = await fetch(
                `${GRAPH_API_BASE_LOCAL}/${igBizId}?fields=username,name&access_token=${pageAccessToken}`
              );
              const igData = await igRes.json();
              igUsername = igUsername || igData.username || null;
              igName = igName || igData.name || null;
            } catch {}
          }
        } catch (err) {
          console.warn("[meta-oauth] Graph API fallback failed:", err);
        }
      }

      const encryptedToken = await encryptToken(pageAccessToken);
      const tokenExpiresAt = new Date(Date.now() + 5184000 * 1000).toISOString();
      const displayName = igName || apiPageName || pageId;
      const displayUsername = igUsername || igBizId || "";

      const { data: saved, error: saveError } = await supabaseAdmin
        .from("meta_connections")
        .upsert(
          {
            law_firm_id: lawFirmId,
            type: "instagram",
            page_id: pageId,
            page_name: `${displayName} (@${displayUsername})`,
            ig_account_id: igBizId || null,
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

      // Subscribe page to webhooks for Instagram messaging with verification
      try {
        const subRes = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscribed_fields: "messages,messaging_postbacks,messaging_optins",
            access_token: pageAccessToken,
          }),
        });
        const subData = await subRes.json();
        console.log("[meta-oauth] Instagram webhook subscription result:", JSON.stringify(subData));

        // Verify subscription was actually registered
        const verifyRes = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps?access_token=${pageAccessToken}`);
        const verifyData = await verifyRes.json();
        console.log("[meta-oauth] Instagram subscription verification:", JSON.stringify(verifyData));

        // If verification shows no subscription, retry after a short delay
        const hasSubscription = verifyData.data?.length > 0;
        if (!hasSubscription && subData.success) {
          console.log("[meta-oauth] Subscription not confirmed, retrying after 2s...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          const retryRes = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks,messaging_optins",
              access_token: pageAccessToken,
            }),
          });
          const retryData = await retryRes.json();
          console.log("[meta-oauth] Instagram retry subscription result:", JSON.stringify(retryData));
          
          // Final verification
          const finalVerifyRes = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps?access_token=${pageAccessToken}`);
          const finalVerifyData = await finalVerifyRes.json();
          console.log("[meta-oauth] Instagram final verification:", JSON.stringify(finalVerifyData));
        }
      } catch (subErr) {
        console.error("[meta-oauth] Instagram webhook subscription error:", subErr);
      }

      console.log("[meta-oauth] Instagram connection saved via encrypted token:", { id: saved.id, igUsername: displayUsername });
      return new Response(JSON.stringify({
        success: true,
        connectionId: saved.id,
        pageName: `${displayName} (@${displayUsername})`,
        type: "instagram",
        igAccountId: igBizId || null,
        expiresAt: tokenExpiresAt,
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

    // --- Instagram flow: list pages with IG accounts or save selected one ---
    if (type === "instagram") {
      // Enrich pages with Instagram account details
      const pagesWithIg: any[] = [];
      for (const page of pagesData.data) {
        const igBiz = page.instagram_business_account;
        if (igBiz?.id) {
          // Fetch IG username & profile picture
          try {
            const igRes = await fetch(
              `${GRAPH_API_BASE}/${igBiz.id}?fields=username,name,profile_picture_url&access_token=${page.access_token}`
            );
            const igData = await igRes.json();
            pagesWithIg.push({
              pageId: page.id,
              pageName: page.name,
              pageAccessToken: page.access_token,
              igAccountId: igBiz.id,
              igUsername: igData.username || null,
              igName: igData.name || null,
              igProfilePicture: igData.profile_picture_url || null,
            });
          } catch {
            pagesWithIg.push({
              pageId: page.id,
              pageName: page.name,
              pageAccessToken: page.access_token,
              igAccountId: igBiz.id,
              igUsername: null,
              igName: null,
              igProfilePicture: null,
            });
          }
        }
      }

      if (pagesWithIg.length === 0) {
        return new Response(JSON.stringify({ 
          error: "Nenhuma página com conta Instagram Profissional vinculada foi encontrada." 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If step is "list_pages" or no pageId, return the list for selection
      if (step === "list_pages" || !pageId) {
        console.log("[meta-oauth] Instagram: returning page list for selection", pagesWithIg.length);
        
        // Encrypt page tokens so frontend can send them back in step 2 (save)
        const pagesWithEncryptedTokens = await Promise.all(
          pagesWithIg.map(async (p: any) => ({
            pageId: p.pageId,
            pageName: p.pageName,
            igAccountId: p.igAccountId,
            igUsername: p.igUsername,
            igName: p.igName,
            igProfilePicture: p.igProfilePicture,
            encryptedToken: await encryptToken(p.pageAccessToken),
          }))
        );
        
        return new Response(JSON.stringify({
          success: true,
          step: "list_pages",
          pages: pagesWithEncryptedTokens,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // step === "save" or pageId provided: save specific page
      const selectedIg = pagesWithIg.find(p => p.pageId === pageId);
      if (!selectedIg) {
        return new Response(JSON.stringify({ error: "Página selecionada não encontrada ou sem Instagram vinculado." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const encryptedIgToken = await encryptToken(selectedIg.pageAccessToken);
      const igTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const igDisplayName = selectedIg.igName || selectedIg.pageName;
      const igUsername = selectedIg.igUsername || selectedIg.igAccountId;

      const { data: savedIg, error: saveIgError } = await supabaseAdmin
        .from("meta_connections")
        .upsert(
          {
            law_firm_id: lawFirmId,
            type: "instagram",
            page_id: selectedIg.pageId,
            page_name: `${igDisplayName} (@${igUsername})`,
            ig_account_id: selectedIg.igAccountId,
            access_token: encryptedIgToken,
            token_expires_at: igTokenExpiresAt,
            is_active: true,
            source: "oauth",
          },
          { onConflict: "law_firm_id,type,page_id" }
        )
        .select("id")
        .single();

      if (saveIgError) {
        console.error("[meta-oauth] Error saving Instagram connection:", saveIgError);
        return new Response(JSON.stringify({ error: "Failed to save connection" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Subscribe page to webhooks for Instagram messaging with verification
      try {
        console.log("[meta-oauth] Subscribing page to webhooks for Instagram:", selectedIg.pageId);
        const subRes = await fetch(
          `${GRAPH_API_BASE}/${selectedIg.pageId}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks,messaging_optins",
              access_token: selectedIg.pageAccessToken,
            }),
          }
        );
        const subData = await subRes.json();
        console.log("[meta-oauth] Instagram subscribe result:", JSON.stringify(subData));

        // Verify subscription
        const verifyRes = await fetch(`${GRAPH_API_BASE}/${selectedIg.pageId}/subscribed_apps?access_token=${selectedIg.pageAccessToken}`);
        const verifyData = await verifyRes.json();
        console.log("[meta-oauth] Instagram subscription verification:", JSON.stringify(verifyData));

        // Retry if not confirmed
        const hasSubscription = verifyData.data?.length > 0;
        if (!hasSubscription && subData.success) {
          console.log("[meta-oauth] Subscription not confirmed, retrying after 2s...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          await fetch(`${GRAPH_API_BASE}/${selectedIg.pageId}/subscribed_apps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks,messaging_optins",
              access_token: selectedIg.pageAccessToken,
            }),
          });
          const finalVerifyRes = await fetch(`${GRAPH_API_BASE}/${selectedIg.pageId}/subscribed_apps?access_token=${selectedIg.pageAccessToken}`);
          const finalVerifyData = await finalVerifyRes.json();
          console.log("[meta-oauth] Instagram final verification:", JSON.stringify(finalVerifyData));
        }
      } catch (subErr) {
        console.error("[meta-oauth] Failed to subscribe page for Instagram (non-blocking):", subErr);
      }

      console.log("[meta-oauth] Instagram connection saved:", { id: savedIg.id, igUsername });
      return new Response(JSON.stringify({
        success: true,
        connectionId: savedIg.id,
        pageName: `${igDisplayName} (@${igUsername})`,
        type: "instagram",
        igAccountId: selectedIg.igAccountId,
        expiresAt: igTokenExpiresAt,
      }), {
        status: 200,
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
