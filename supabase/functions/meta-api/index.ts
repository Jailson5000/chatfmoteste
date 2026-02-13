import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptToken, encryptToken, isEncrypted } from "../_shared/encryption.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * meta-api
 * Sends messages via Meta Graph API (Instagram DM, Facebook Messenger, WhatsApp Cloud).
 * 
 * POST body:
 * {
 *   conversationId: string,
 *   content: string,
 *   messageType?: "text" | "image" | "audio" | "video" | "document",
 *   mediaUrl?: string,     // Public URL for media
 *   fileName?: string,     // For documents
 * }
 */

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
    const body = await req.json();

    // Handle encrypt_token action (no auth required for this internal action)
    if (body.action === "encrypt_token" && body.token) {
      try {
        const encrypted = await encryptToken(body.token);
        return new Response(JSON.stringify({ encrypted }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("[meta-api] Encryption error:", err);
        return new Response(JSON.stringify({ error: "Encryption failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Handle template management actions
    if (["list_templates", "create_template", "delete_template"].includes(body.action) && body.connectionId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const tkn = authHeader.replace("Bearer ", "");
      const { data: tplClaims, error: tplClaimsErr } = await supabaseAuth.auth.getClaims(tkn);
      if (tplClaimsErr || !tplClaims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tplUserId = tplClaims.claims.sub;

      const supabaseAdminTpl = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: tplProfile } = await supabaseAdminTpl.from("profiles").select("law_firm_id").eq("id", tplUserId).single();
      if (!tplProfile?.law_firm_id) {
        return new Response(JSON.stringify({ error: "No tenant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tplConn } = await supabaseAdminTpl.from("meta_connections")
        .select("id, access_token, waba_id, law_firm_id")
        .eq("id", body.connectionId)
        .eq("law_firm_id", tplProfile.law_firm_id)
        .single();

      if (!tplConn) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!tplConn.waba_id) {
        return new Response(JSON.stringify({ error: "WABA ID not configured for this connection. Please reconnect." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let tplAccessToken = tplConn.access_token;
      if (isEncrypted(tplAccessToken)) {
        tplAccessToken = await decryptToken(tplAccessToken);
      }

      const wabaId = tplConn.waba_id;

      if (body.action === "list_templates") {
        const url = `${GRAPH_API_BASE}/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`;
        console.log("[meta-api] list_templates:", url);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${tplAccessToken}` } });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.ok ? 200 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.action === "create_template") {
        const { name, category, language, components } = body;
        if (!name || !category || !language || !components) {
          return new Response(JSON.stringify({ error: "Missing required fields: name, category, language, components" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const url = `${GRAPH_API_BASE}/${wabaId}/message_templates`;
        console.log("[meta-api] create_template:", url);
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${tplAccessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, category, language, components }),
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.ok ? 200 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.action === "delete_template") {
        const { templateName } = body;
        if (!templateName) {
          return new Response(JSON.stringify({ error: "Missing templateName" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const url = `${GRAPH_API_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`;
        console.log("[meta-api] delete_template:", url);
        const res = await fetch(url, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${tplAccessToken}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.ok ? 200 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Handle save_test_connection action - manually save Meta credentials for testing
    if (body.action === "save_test_connection") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const tkn = authHeader.replace("Bearer ", "");
      const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(tkn);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const uid = claims.claims.sub;
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: prof } = await supabaseAdmin.from("profiles").select("law_firm_id").eq("id", uid).single();
      if (!prof?.law_firm_id) {
        return new Response(JSON.stringify({ error: "No tenant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { accessToken: rawToken, phoneNumberId, wabaId: inputWabaId } = body;
      if (!rawToken || !phoneNumberId) {
        return new Response(JSON.stringify({ error: "Missing accessToken or phoneNumberId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const encryptedToken = await encryptToken(rawToken);

      // Upsert a whatsapp_cloud connection for this tenant
      const { data: existing } = await supabaseAdmin.from("meta_connections")
        .select("id")
        .eq("law_firm_id", prof.law_firm_id)
        .eq("type", "whatsapp_cloud")
        .maybeSingle();

      let connectionId: string;
      if (existing) {
        await supabaseAdmin.from("meta_connections").update({
          access_token: encryptedToken,
          page_id: phoneNumberId,
          waba_id: inputWabaId || null,
          is_active: true,
          page_name: "Teste WhatsApp Cloud",
        }).eq("id", existing.id);
        connectionId = existing.id;
      } else {
        const { data: inserted } = await supabaseAdmin.from("meta_connections").insert({
          law_firm_id: prof.law_firm_id,
          type: "whatsapp_cloud",
          access_token: encryptedToken,
          page_id: phoneNumberId,
          waba_id: inputWabaId || null,
          is_active: true,
          page_name: "Teste WhatsApp Cloud",
        }).select("id").single();
        connectionId = inserted?.id;
      }

      console.log("[meta-api] save_test_connection success:", connectionId);
      return new Response(JSON.stringify({ success: true, connectionId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle send_test_message action - send a test WhatsApp message directly
    if (body.action === "send_test_message" && body.connectionId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const tkn = authHeader.replace("Bearer ", "");
      const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(tkn);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const uid = claims.claims.sub;
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: prof } = await supabaseAdmin.from("profiles").select("law_firm_id").eq("id", uid).single();
      if (!prof?.law_firm_id) {
        return new Response(JSON.stringify({ error: "No tenant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: conn } = await supabaseAdmin.from("meta_connections")
        .select("id, access_token, page_id, waba_id, law_firm_id")
        .eq("id", body.connectionId)
        .eq("law_firm_id", prof.law_firm_id)
        .single();

      if (!conn) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let testToken = conn.access_token;
      if (isEncrypted(testToken)) {
        testToken = await decryptToken(testToken);
      }

      const { recipientPhone, message, useTemplate, templateName, templateLang } = body;
      if (!recipientPhone) {
        return new Response(JSON.stringify({ error: "Missing recipientPhone" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let msgBody: any = {
        messaging_product: "whatsapp",
        to: recipientPhone,
      };

      if (useTemplate) {
        msgBody.type = "template";
        msgBody.template = {
          name: templateName || "hello_world",
          language: { code: templateLang || "en_US" },
        };
      } else {
        msgBody.type = "text";
        msgBody.text = { body: message || "Mensagem de teste do MiauChat" };
      }

      const phoneNumberId = conn.page_id;
      const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
      console.log("[meta-api] send_test_message:", url, JSON.stringify(msgBody));

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${testToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(msgBody),
      });
      const data = await res.json();
      console.log("[meta-api] send_test_message result:", res.status, JSON.stringify(data));

      // If send succeeded, persist client + conversation + message in database
      let conversationId: string | null = null;
      if (res.ok && data?.messages?.[0]?.id) {
        try {
          const externalMsgId = data.messages[0].id;
          const lawFirmId = prof.law_firm_id;
          // Use wa_id returned by Meta (normalized number) as remote_jid
          const rawPhone = recipientPhone.replace(/[^0-9]/g, "");
          const waId = data.contacts?.[0]?.wa_id;
          const remoteJid = waId || rawPhone;
          console.log("[meta-api] send_test_message wa_id normalization:", { rawPhone, waId, remoteJid });

          // 1. Find or create client
          let clientId: string | null = null;
          const { data: existingClient } = await supabaseAdmin.from("clients")
            .select("id")
            .eq("law_firm_id", lawFirmId)
            .eq("phone", recipientPhone)
            .limit(1)
            .maybeSingle();

          if (existingClient) {
            clientId = existingClient.id;
          } else {
            const { data: newClient } = await supabaseAdmin.from("clients")
              .insert({ law_firm_id: lawFirmId, name: recipientPhone, phone: recipientPhone })
              .select("id")
              .single();
            clientId = newClient?.id || null;
          }

          // 2. Find or create conversation - try both formats to avoid duplicates
          const possibleJids = [remoteJid];
          if (rawPhone !== remoteJid) possibleJids.push(rawPhone);
          
          const { data: existingConv } = await supabaseAdmin.from("conversations")
            .select("id, remote_jid")
            .eq("law_firm_id", lawFirmId)
            .in("remote_jid", possibleJids)
            .eq("origin", "WHATSAPP_CLOUD")
            .limit(1)
            .maybeSingle();

          if (existingConv) {
            conversationId = existingConv.id;
            // Also fix remote_jid if it was stored in wrong format
            const updateData: any = { last_message_at: new Date().toISOString(), archived_at: null };
            if (existingConv.remote_jid !== remoteJid) {
              updateData.remote_jid = remoteJid;
              updateData.contact_phone = remoteJid;
              console.log("[meta-api] send_test_message fixing remote_jid:", existingConv.remote_jid, "->", remoteJid);
            }
            await supabaseAdmin.from("conversations")
              .update(updateData)
              .eq("id", conversationId);
          } else {
            const { data: newConv } = await supabaseAdmin.from("conversations")
              .insert({
                law_firm_id: lawFirmId,
                remote_jid: remoteJid,
                contact_name: recipientPhone,
                contact_phone: remoteJid,
                origin: "WHATSAPP_CLOUD",
                origin_metadata: { phone_number_id: conn.page_id, connection_type: "whatsapp_cloud", connection_id: conn.id },
                client_id: clientId,
                status: "novo_contato",
                current_handler: "human",
                last_message_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            conversationId = newConv?.id || null;
          }

          // 3. Insert message
          if (conversationId) {
            await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              law_firm_id: lawFirmId,
              content: useTemplate
                ? `[template: ${templateName || "hello_world"}]`
                : (message || "Mensagem de teste do MiauChat"),
              sender_type: "agent",
              is_from_me: true,
              message_type: "text",
              external_id: externalMsgId,
            });
          }

          console.log("[meta-api] send_test_message persisted: conv=", conversationId, "client=", clientId);
        } catch (persistErr) {
          console.error("[meta-api] send_test_message persist error:", persistErr);
          // Don't fail the response - message was sent successfully
        }
      }

      return new Response(JSON.stringify({ ...data, conversationId }), {
        status: res.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle test_api action - proxy Graph API calls for testing
    if (body.action === "test_api" && body.connectionId && body.endpoint) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const testUserId = claimsData.claims.sub;

      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: testProfile } = await supabaseAdmin.from("profiles").select("law_firm_id").eq("id", testUserId).single();
      if (!testProfile?.law_firm_id) {
        return new Response(JSON.stringify({ error: "No tenant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the connection and verify tenant
      const { data: testConn } = await supabaseAdmin.from("meta_connections")
        .select("id, access_token, law_firm_id")
        .eq("id", body.connectionId)
        .eq("law_firm_id", testProfile.law_firm_id)
        .single();

      if (!testConn) {
        return new Response(JSON.stringify({ error: "Connection not found or access denied" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let testAccessToken = testConn.access_token;
      if (isEncrypted(testAccessToken)) {
        testAccessToken = await decryptToken(testAccessToken);
      }

      // Call Graph API
      const graphUrl = `${GRAPH_API_BASE}${body.endpoint}`;
      console.log("[meta-api] test_api calling:", graphUrl);
      const graphRes = await fetch(graphUrl, {
        headers: { Authorization: `Bearer ${testAccessToken}` },
      });
      const graphData = await graphRes.json();

      return new Response(JSON.stringify(graphData), {
        status: 200, // Always 200 so frontend can display the actual Meta error details
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Get user's law_firm_id
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
    const { conversationId, content, messageType = "text", mediaUrl, fileName } = body;

    if (!conversationId || !content) {
      return new Response(JSON.stringify({ error: "Missing conversationId or content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get conversation to find origin and remote_jid
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, remote_jid, origin, origin_metadata, law_firm_id")
      .eq("id", conversationId)
      .eq("law_firm_id", lawFirmId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = conversation.origin?.toUpperCase();
    if (!["INSTAGRAM", "FACEBOOK", "WHATSAPP_CLOUD"].includes(origin)) {
      return new Response(JSON.stringify({ error: "Conversation is not a Meta channel" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map origin to connection type
    const typeMap: Record<string, string> = {
      INSTAGRAM: "instagram",
      FACEBOOK: "facebook",
      WHATSAPP_CLOUD: "whatsapp_cloud",
    };
    const connectionType = typeMap[origin];

    // Find the active connection
    // First try connection_id from origin_metadata (most reliable for WHATSAPP_CLOUD)
    let connection: any = null;
    const originConnectionId = conversation.origin_metadata?.connection_id;
    
    if (originConnectionId) {
      const { data: specificConn } = await supabaseAdmin
        .from("meta_connections")
        .select("id, access_token, page_id")
        .eq("id", originConnectionId)
        .eq("law_firm_id", lawFirmId)
        .eq("is_active", true)
        .maybeSingle();
      connection = specificConn;
    }
    
    // Fallback: find by type
    if (!connection) {
      const { data: fallbackConn } = await supabaseAdmin
        .from("meta_connections")
        .select("id, access_token, page_id")
        .eq("law_firm_id", lawFirmId)
        .eq("type", connectionType)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      connection = fallbackConn;
    }

    if (!connection) {
      return new Response(JSON.stringify({ error: `No active ${connectionType} connection` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decrypt access token
    let accessToken = connection.access_token;
    if (isEncrypted(accessToken)) {
      accessToken = await decryptToken(accessToken);
    }

    let recipientId = conversation.remote_jid;
    
    // WhatsApp Cloud API needs just the phone number, strip @s.whatsapp.net suffix
    if (origin === "WHATSAPP_CLOUD" && recipientId?.includes("@")) {
      recipientId = recipientId.split("@")[0];
    }
    
    let graphResponse: Response;

    if (origin === "WHATSAPP_CLOUD") {
      // WhatsApp Cloud API uses different endpoint and format
      graphResponse = await sendWhatsAppCloudMessage(accessToken, connection.page_id, recipientId, content, messageType, mediaUrl);
    } else {
      // Instagram and Facebook Messenger use Send API
      graphResponse = await sendMessagingMessage(accessToken, recipientId, content, messageType, mediaUrl);
    }

    const graphResult = await graphResponse.json();

    if (!graphResponse.ok) {
      console.error("[meta-api] Graph API error:", graphResult);
      return new Response(JSON.stringify({ error: "Failed to send message", details: graphResult }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize remote_jid using wa_id returned by Meta (fixes Brazilian number format issues)
    const returnedWaId = graphResult.contacts?.[0]?.wa_id;
    if (origin === "WHATSAPP_CLOUD" && returnedWaId && returnedWaId !== recipientId) {
      console.log("[meta-api] Normalizing remote_jid:", recipientId, "->", returnedWaId);
      await supabaseAdmin
        .from("conversations")
        .update({ remote_jid: returnedWaId, contact_phone: returnedWaId })
        .eq("id", conversationId);
    }

    // Save outgoing message to database
    const { data: savedMsg, error: msgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        law_firm_id: lawFirmId,
        content: content,
        sender_type: "agent",
        is_from_me: true,
        message_type: messageType,
        media_url: mediaUrl || null,
        external_id: graphResult.message_id || graphResult.messages?.[0]?.id || null,
      })
      .select("id, created_at")
      .single();

    if (msgErr) {
      console.error("[meta-api] Error saving message:", msgErr);
    }

    // Update conversation last_message_at
    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    console.log("[meta-api] Message sent:", {
      conversationId: conversationId.slice(0, 8),
      origin,
      messageType,
      graphMessageId: graphResult.message_id || graphResult.messages?.[0]?.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: savedMsg?.id,
        externalId: graphResult.message_id || graphResult.messages?.[0]?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[meta-api] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Send message via Instagram / Facebook Messenger Send API.
 */
async function sendMessagingMessage(
  accessToken: string,
  recipientId: string,
  content: string,
  messageType: string,
  mediaUrl?: string
): Promise<Response> {
  let messagePayload: any;

  if (messageType === "text" || !mediaUrl) {
    messagePayload = { text: content };
  } else {
    const attachmentType = messageType === "document" ? "file" : messageType;
    messagePayload = {
      attachment: {
        type: attachmentType,
        payload: { url: mediaUrl, is_reusable: true },
      },
    };
  }

  return fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: messagePayload,
    }),
  });
}

/**
 * Send message via WhatsApp Cloud API.
 */
async function sendWhatsAppCloudMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientPhone: string,
  content: string,
  messageType: string,
  mediaUrl?: string
): Promise<Response> {
  let bodyPayload: any = {
    messaging_product: "whatsapp",
    to: recipientPhone,
  };

  if (messageType === "text" || !mediaUrl) {
    bodyPayload.type = "text";
    bodyPayload.text = { body: content };
  } else if (messageType === "image") {
    bodyPayload.type = "image";
    bodyPayload.image = { link: mediaUrl, caption: content !== "[image]" ? content : undefined };
  } else if (messageType === "audio") {
    bodyPayload.type = "audio";
    bodyPayload.audio = { link: mediaUrl };
  } else if (messageType === "video") {
    bodyPayload.type = "video";
    bodyPayload.video = { link: mediaUrl, caption: content !== "[video]" ? content : undefined };
  } else if (messageType === "document") {
    bodyPayload.type = "document";
    bodyPayload.document = { link: mediaUrl, caption: content };
  }

  return fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });
}
