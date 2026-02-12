import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
        status: graphRes.ok ? 200 : 502,
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
    const { data: connection, error: connError } = await supabaseAdmin
      .from("meta_connections")
      .select("id, access_token, page_id")
      .eq("law_firm_id", lawFirmId)
      .eq("type", connectionType)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

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

    const recipientId = conversation.remote_jid;
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
