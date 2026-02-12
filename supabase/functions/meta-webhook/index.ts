import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken, decryptToken } from "../_shared/encryption.ts";

/**
 * meta-webhook
 * Unified webhook receiver for Instagram DM, Facebook Messenger, and WhatsApp Cloud API.
 * 
 * GET  → Webhook verification (Meta challenge)
 * POST → Incoming messages from Meta platforms
 * 
 * Routes by `object` field:
 *   - "instagram"                  → Instagram DM
 *   - "page"                       → Facebook Messenger
 *   - "whatsapp_business_account"  → WhatsApp Cloud API
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

// Map Meta object types to our origin values
const OBJECT_TO_ORIGIN: Record<string, string> = {
  instagram: "INSTAGRAM",
  page: "FACEBOOK",
  whatsapp_business_account: "WHATSAPP_CLOUD",
};

// Map Meta object types to meta_connections type
const OBJECT_TO_TYPE: Record<string, string> = {
  instagram: "instagram",
  page: "facebook",
  whatsapp_business_account: "whatsapp_cloud",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

  // ─── GET: Webhook Verification ───
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[meta-webhook] Verification request:", { mode, tokenMatch: token === verifyToken });

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // ─── POST: Incoming Messages ───
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const objectType = body.object;

    console.log("[meta-webhook] Received event:", { object: objectType, entries: body.entry?.length || 0 });

    if (!objectType || !OBJECT_TO_ORIGIN[objectType]) {
      console.warn("[meta-webhook] Unknown object type:", objectType);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const origin = OBJECT_TO_ORIGIN[objectType];
    const connectionType = OBJECT_TO_TYPE[objectType];
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    for (const entry of body.entry || []) {
      if (objectType === "whatsapp_business_account") {
        await processWhatsAppCloudEntry(supabase, entry, origin, connectionType);
      } else {
        await processMessagingEntry(supabase, entry, origin, connectionType);
      }
    }

    // Always return 200 to Meta (avoid retries)
    return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[meta-webhook] Error:", err);
    // Still return 200 to avoid Meta retrying
    return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
  }
});

/**
 * Process Instagram DM / Facebook Messenger entries.
 * Payload structure: entry[].messaging[].{sender, recipient, message, timestamp}
 */
async function processMessagingEntry(
  supabase: any,
  entry: any,
  origin: string,
  connectionType: string
) {
  const pageId = entry.id; // Page ID or IG Account ID
  
  for (const event of entry.messaging || []) {
    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;
    const message = event.message;
    const timestamp = event.timestamp;

    // Skip echoes (messages sent by us)
    if (message?.is_echo) {
      console.log("[meta-webhook] Skipping echo message");
      continue;
    }

    // Skip if no message content
    if (!message) {
      console.log("[meta-webhook] Non-message event (delivery, read, etc) - skipping");
      continue;
    }

    console.log("[meta-webhook] Processing message:", {
      origin,
      senderId: senderId?.slice(0, 8) + "...",
      hasText: !!message.text,
      hasAttachments: !!message.attachments?.length,
    });

    // Find the meta_connection for this page/account
    const { data: connection, error: connError } = await supabase
      .from("meta_connections")
      .select("id, law_firm_id, default_department_id, default_status_id, default_automation_id, default_handler_type, default_human_agent_id")
      .eq("page_id", recipientId)
      .eq("type", connectionType)
      .eq("is_active", true)
      .maybeSingle();

    if (connError || !connection) {
      console.warn("[meta-webhook] No active connection for page:", recipientId?.slice(0, 8));
      continue;
    }

    const lawFirmId = connection.law_firm_id;

    // Determine message content and type
    let content = message.text || "";
    let messageType = "text";
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;

    if (message.attachments?.length > 0) {
      const att = message.attachments[0];
      mediaUrl = att.payload?.url || null;
      if (att.type === "image") {
        messageType = "image";
        mediaMimeType = "image/jpeg";
      } else if (att.type === "video") {
        messageType = "video";
        mediaMimeType = "video/mp4";
      } else if (att.type === "audio") {
        messageType = "audio";
        mediaMimeType = "audio/mpeg";
      } else if (att.type === "file") {
        messageType = "document";
        mediaMimeType = "application/octet-stream";
      }
      if (!content) content = `[${messageType}]`;
    }

    // Find or create client by remote_jid (sender's scoped ID)
    const remoteJid = senderId;
    let clientId: string | null = null;

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("law_firm_id", lawFirmId)
      .eq("phone", remoteJid)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      // Create new client
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          law_firm_id: lawFirmId,
          name: `${origin} ${remoteJid.slice(-4)}`,
          phone: remoteJid,
          custom_status_id: connection.default_status_id || null,
        })
        .select("id")
        .single();

      if (clientErr) {
        console.error("[meta-webhook] Error creating client:", clientErr);
        continue;
      }
      clientId = newClient.id;
    }

    // Find or create conversation
    let conversationId: string | null = null;

    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id, archived_at")
      .eq("law_firm_id", lawFirmId)
      .eq("remote_jid", remoteJid)
      .eq("origin", origin)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;

      // Unarchive if archived
      const updatePayload: Record<string, any> = {
        last_message_at: new Date(timestamp * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existingConv.archived_at) {
        updatePayload.archived_at = null;
        updatePayload.archived_reason = null;
        updatePayload.archived_by = null;
      }

      await supabase
        .from("conversations")
        .update(updatePayload)
        .eq("id", conversationId);
    } else {
      // Create new conversation
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          law_firm_id: lawFirmId,
          remote_jid: remoteJid,
          contact_name: `${origin} ${remoteJid.slice(-4)}`,
          contact_phone: remoteJid,
          origin: origin,
          origin_metadata: { page_id: recipientId, connection_type: connectionType },
          client_id: clientId,
          department_id: connection.default_department_id || null,
          current_automation_id: connection.default_handler_type === "ai" ? connection.default_automation_id : null,
          current_handler: connection.default_handler_type === "ai" ? "ai" : "human",
          assigned_to: connection.default_handler_type === "human" ? connection.default_human_agent_id : null,
          status: "active",
          last_message_at: new Date(timestamp * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (convErr) {
        console.error("[meta-webhook] Error creating conversation:", convErr);
        continue;
      }
      conversationId = newConv.id;
    }

    // Insert message
    const { error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        law_firm_id: lawFirmId,
        content: content,
        sender_type: "client",
        is_from_me: false,
        message_type: messageType,
        media_url: mediaUrl,
        media_mime_type: mediaMimeType,
        external_id: message.mid || null,
      });

    if (msgErr) {
      console.error("[meta-webhook] Error inserting message:", msgErr);
    } else {
      console.log("[meta-webhook] Message saved:", {
        conversationId: conversationId?.slice(0, 8),
        origin,
        messageType,
      });
    }
  }
}

/**
 * Process WhatsApp Cloud API entries.
 * Payload structure: entry[].changes[].value.messages[].{from, text, timestamp, type, ...}
 */
async function processWhatsAppCloudEntry(
  supabase: any,
  entry: any,
  origin: string,
  connectionType: string
) {
  for (const change of entry.changes || []) {
    if (change.field !== "messages") continue;

    const value = change.value;
    const phoneNumberId = value.metadata?.phone_number_id;
    
    if (!value.messages?.length) continue;

    // Find connection by phone_number_id (stored as page_id for WABA)
    const { data: connection } = await supabase
      .from("meta_connections")
      .select("id, law_firm_id, default_department_id, default_status_id, default_automation_id, default_handler_type, default_human_agent_id")
      .eq("page_id", phoneNumberId)
      .eq("type", connectionType)
      .eq("is_active", true)
      .maybeSingle();

    if (!connection) {
      console.warn("[meta-webhook] No WABA connection for phone_number_id:", phoneNumberId);
      continue;
    }

    const lawFirmId = connection.law_firm_id;

    for (const msg of value.messages) {
      const senderPhone = msg.from; // E.164 format without +
      const remoteJid = senderPhone;

      // Determine content
      let content = "";
      let messageType = "text";
      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;

      if (msg.type === "text") {
        content = msg.text?.body || "";
      } else if (msg.type === "image") {
        messageType = "image";
        content = msg.image?.caption || "[imagem]";
        // Media needs to be downloaded via Graph API using msg.image.id
        mediaMimeType = msg.image?.mime_type || "image/jpeg";
      } else if (msg.type === "audio") {
        messageType = "audio";
        content = "[áudio]";
        mediaMimeType = msg.audio?.mime_type || "audio/ogg";
      } else if (msg.type === "video") {
        messageType = "video";
        content = msg.video?.caption || "[vídeo]";
        mediaMimeType = msg.video?.mime_type || "video/mp4";
      } else if (msg.type === "document") {
        messageType = "document";
        content = msg.document?.filename || "[documento]";
        mediaMimeType = msg.document?.mime_type || "application/octet-stream";
      } else if (msg.type === "sticker") {
        messageType = "sticker";
        content = "[figurinha]";
      } else if (msg.type === "reaction") {
        // Skip reactions for now
        continue;
      } else {
        content = `[${msg.type}]`;
      }

      // Get contact name from contacts array
      const contactName = value.contacts?.find((c: any) => c.wa_id === senderPhone)?.profile?.name || senderPhone;

      // Find or create client
      let clientId: string | null = null;
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("law_firm_id", lawFirmId)
        .eq("phone", remoteJid)
        .maybeSingle();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient } = await supabase
          .from("clients")
          .insert({
            law_firm_id: lawFirmId,
            name: contactName,
            phone: remoteJid,
            custom_status_id: connection.default_status_id || null,
          })
          .select("id")
          .single();
        clientId = newClient?.id || null;
      }

      // Find or create conversation
      let conversationId: string | null = null;
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, archived_at")
        .eq("law_firm_id", lawFirmId)
        .eq("remote_jid", remoteJid)
        .eq("origin", origin)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
        const updatePayload: Record<string, any> = {
          last_message_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
          contact_name: contactName,
        };
        if (existingConv.archived_at) {
          updatePayload.archived_at = null;
          updatePayload.archived_reason = null;
          updatePayload.archived_by = null;
        }
        await supabase.from("conversations").update(updatePayload).eq("id", conversationId);
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            law_firm_id: lawFirmId,
            remote_jid: remoteJid,
            contact_name: contactName,
            contact_phone: remoteJid,
            origin,
            origin_metadata: { phone_number_id: phoneNumberId, connection_type: connectionType },
            client_id: clientId,
            department_id: connection.default_department_id || null,
            current_automation_id: connection.default_handler_type === "ai" ? connection.default_automation_id : null,
            current_handler: connection.default_handler_type === "ai" ? "ai" : "human",
            assigned_to: connection.default_handler_type === "human" ? connection.default_human_agent_id : null,
            status: "active",
            last_message_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
          })
          .select("id")
          .single();
        conversationId = newConv?.id || null;
      }

      if (!conversationId) continue;

      // Insert message
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        law_firm_id: lawFirmId,
        content,
        sender_type: "client",
        is_from_me: false,
        message_type: messageType,
        media_url: mediaUrl,
        media_mime_type: mediaMimeType,
        external_id: msg.id || null,
      });

      console.log("[meta-webhook] WABA message saved:", {
        conversationId: conversationId?.slice(0, 8),
        from: senderPhone.slice(-4),
        type: messageType,
      });
    }
  }
}
