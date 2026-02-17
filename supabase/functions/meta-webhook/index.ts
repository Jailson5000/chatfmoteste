import { createClient } from "npm:@supabase/supabase-js@2";
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

/**
 * Normalize a timestamp to milliseconds.
 * Instagram sends timestamps in milliseconds, WhatsApp/Facebook in seconds.
 * If ts > 10_000_000_000 it's already in ms; otherwise multiply by 1000.
 */
function normalizeTimestamp(ts: number): number {
  return ts > 10_000_000_000 ? ts : ts * 1000;
}

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

// MIME type to file extension mapping
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/ogg; codecs=opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/amr": "amr",
  "audio/aac": "aac",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/octet-stream": "bin",
  "image/webp": "webp",
};

function getExtFromMime(mime: string): string {
  return MIME_TO_EXT[mime] || mime.split("/").pop()?.split(";")[0] || "bin";
}

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

    console.log("[meta-webhook] Verification request:", { 
      mode, 
      tokenMatch: token === verifyToken,
      tokenReceived: token ? token.slice(0, 4) + "***" : "null",
      tokenExpected: verifyToken ? verifyToken.slice(0, 4) + "***" : "null",
    });

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

    console.log("[meta-webhook] Received event:", { 
      object: objectType, 
      entries: body.entry?.length || 0,
      rawKeys: Object.keys(body),
      fullPayload: JSON.stringify(body).slice(0, 2000),
    });

    if (!objectType || !OBJECT_TO_ORIGIN[objectType]) {
      console.warn("[meta-webhook] Unknown object type:", objectType, "Full body keys:", Object.keys(body));
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const origin = OBJECT_TO_ORIGIN[objectType];
    const connectionType = OBJECT_TO_TYPE[objectType];
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    for (const entry of body.entry || []) {
      if (objectType === "whatsapp_business_account") {
        await processWhatsAppCloudEntry(supabase, entry, origin, connectionType, supabaseUrl);
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
 * Download media from WhatsApp Cloud API and upload to Supabase Storage.
 * Returns the public URL of the uploaded file or null on failure.
 */
async function downloadAndStoreMedia(
  supabase: any,
  mediaId: string,
  accessToken: string,
  lawFirmId: string,
  conversationId: string,
  messageId: string,
  mimeType: string,
  supabaseUrl: string
): Promise<string | null> {
  try {
    // Step 1: Get temporary download URL from Graph API
    console.log("[meta-webhook] Fetching media URL for:", mediaId);
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      console.error("[meta-webhook] Graph API error:", metaRes.status, await metaRes.text());
      return null;
    }

    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;

    if (!downloadUrl) {
      console.error("[meta-webhook] No download URL in response");
      return null;
    }

    // Step 2: Download the binary file
    console.log("[meta-webhook] Downloading media from:", downloadUrl.slice(0, 60) + "...");
    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!fileRes.ok) {
      console.error("[meta-webhook] Download error:", fileRes.status);
      return null;
    }

    const fileBuffer = await fileRes.arrayBuffer();
    const ext = getExtFromMime(mimeType);
    const storagePath = `${lawFirmId}/${conversationId}/${messageId}.${ext}`;

    // Step 3: Upload to Supabase Storage
    console.log("[meta-webhook] Uploading to storage:", storagePath, "size:", fileBuffer.byteLength);
    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[meta-webhook] Storage upload error:", uploadError);
      return null;
    }

    // Step 4: Get public URL
    const { data: publicData } = supabase.storage
      .from("chat-media")
      .getPublicUrl(storagePath);

    console.log("[meta-webhook] Media stored successfully:", publicData.publicUrl?.slice(0, 80));
    return publicData.publicUrl;
  } catch (err) {
    console.error("[meta-webhook] Media download/upload error:", err);
    return null;
  }
}

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
    const selectFields = "id, law_firm_id, access_token, default_department_id, default_status_id, default_automation_id, default_handler_type, default_human_agent_id";
    let connection: any = null;

    if (connectionType === "instagram") {
      // Instagram sends IG account ID as recipient — try ig_account_id first
      const { data } = await supabase
        .from("meta_connections")
        .select(selectFields)
        .eq("ig_account_id", recipientId)
        .eq("type", connectionType)
        .eq("is_active", true)
        .maybeSingle();
      connection = data;

      // Fallback: try page_id (older connections may have ig account id stored there)
      if (!connection) {
        const { data: fallback } = await supabase
          .from("meta_connections")
          .select(selectFields)
          .eq("page_id", recipientId)
          .eq("type", connectionType)
          .eq("is_active", true)
          .maybeSingle();
        connection = fallback;
        if (fallback) {
          console.log("[meta-webhook] Instagram connection found via page_id fallback");
        }
      }

      // Fallback 2: try using entry.id (page ID from the entry)
      if (!connection && pageId) {
        const { data: fallback2 } = await supabase
          .from("meta_connections")
          .select(selectFields)
          .eq("page_id", pageId)
          .eq("type", connectionType)
          .eq("is_active", true)
          .maybeSingle();
        connection = fallback2;
        if (fallback2) {
          console.log("[meta-webhook] Instagram connection found via entry.id fallback");
        }
      }
    } else {
      // Facebook sends page ID as recipient
      const { data } = await supabase
        .from("meta_connections")
        .select(selectFields)
        .eq("page_id", recipientId)
        .eq("type", connectionType)
        .eq("is_active", true)
        .maybeSingle();
      connection = data;
    }

    if (!connection) {
      console.warn("[meta-webhook] No active connection for", connectionType, "recipient:", recipientId?.slice(0, 12), "pageId:", pageId?.slice(0, 12));
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
      } else if (att.type === "story_mention") {
        messageType = "image";
        mediaMimeType = "image/jpeg";
        if (!content) content = "📢 Mencionou você em um story";
      } else if (att.type === "story_reply") {
        messageType = "image";
        mediaMimeType = "image/jpeg";
        if (!content) content = "💬 Respondeu ao seu story";
      }
      if (!content) content = `[${messageType}]`;
    }

    // Handle story reply metadata (reply_to.story)
    if (message.reply_to?.story) {
      const storyUrl = message.reply_to.story.url;
      if (storyUrl && !mediaUrl) {
        mediaUrl = storyUrl;
        mediaMimeType = mediaMimeType || "image/jpeg";
      }
      if (!content || content === "[text]") {
        content = message.text || "💬 Respondeu ao seu story";
      }
    }

    // Find or create client by remote_jid (sender's scoped ID)
    const remoteJid = senderId;
    let clientId: string | null = null;
    let clientNeedsNameUpdate = false;

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id, name")
      .eq("law_firm_id", lawFirmId)
      .eq("phone", remoteJid)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
      // Check if name is still generic (e.g. "INSTAGRAM 5644", "FACEBOOK 2589")
      const genericPattern = /^(INSTAGRAM|FACEBOOK|WHATSAPP_CLOUD)\s+\w{2,6}$/i;
      if (genericPattern.test(existingClient.name?.trim() || "")) {
        clientNeedsNameUpdate = true;
      }
    } else {
      clientNeedsNameUpdate = true; // New client, will try to fetch name
      // Create new client with generic name first
      const genericName = `${origin} ${remoteJid.slice(-4)}`;
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          law_firm_id: lawFirmId,
          name: genericName,
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

    // Fetch real profile name and photo from Graph API (for new clients or those with generic names)
    let resolvedName: string | null = null;
    if (clientNeedsNameUpdate && connection.access_token) {
      try {
        const token = await decryptToken(connection.access_token);
        const fields = "name,profile_pic";
        const profileRes = await fetch(
          `https://graph.facebook.com/v22.0/${senderId}?fields=${fields}&access_token=${token}`
        );
        let profile: any = null;
        if (profileRes.ok) {
          profile = await profileRes.json();
        } else {
          // Fallback: try with only "name" in case profile_pic is not supported
          console.warn("[meta-webhook] Profile fetch failed with fields:", fields, "- retrying with name only");
          const fallbackRes = await fetch(
            `https://graph.facebook.com/v22.0/${senderId}?fields=name&access_token=${token}`
          );
          if (fallbackRes.ok) {
            profile = await fallbackRes.json();
          } else {
            const errBody = await fallbackRes.text();
            console.warn("[meta-webhook] Profile fallback also failed:", fallbackRes.status, errBody.slice(0, 200));
          }
        }
        if (profile) {
          resolvedName = profile.name || null;
          const avatarUrl = profile.profile_pic || null;
          if (resolvedName || avatarUrl) {
            const updateData: Record<string, any> = {};
            if (resolvedName) updateData.name = resolvedName;
            if (avatarUrl) updateData.avatar_url = avatarUrl;
            await supabase.from("clients").update(updateData).eq("id", clientId);
            console.log("[meta-webhook] Profile resolved:", { name: resolvedName, hasAvatar: !!avatarUrl });
          }
        }
      } catch (profileErr) {
        console.warn("[meta-webhook] Could not fetch profile:", profileErr);
      }
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
        last_message_at: new Date(normalizeTimestamp(timestamp)).toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Update contact_name if we resolved a real name
      if (resolvedName) {
        updatePayload.contact_name = resolvedName;
      }
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
      // Use resolved name or fetch from client record
      let contactDisplayName = resolvedName || `${origin} ${remoteJid.slice(-4)}`;
      if (!resolvedName && clientId) {
        const { data: clientData } = await supabase.from("clients").select("name").eq("id", clientId).single();
        if (clientData?.name) contactDisplayName = clientData.name;
      }

      // Create new conversation
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          law_firm_id: lawFirmId,
          remote_jid: remoteJid,
          contact_name: contactDisplayName,
          contact_phone: remoteJid,
          origin: origin,
          origin_metadata: { page_id: recipientId, connection_type: connectionType },
          client_id: clientId,
          department_id: connection.default_department_id || null,
          current_automation_id: connection.default_handler_type === "ai" ? connection.default_automation_id : null,
          current_handler: connection.default_handler_type === "ai" ? "ai" : "human",
          assigned_to: connection.default_handler_type === "human" ? connection.default_human_agent_id : null,
          status: "novo_contato",
          last_message_at: new Date(normalizeTimestamp(timestamp)).toISOString(),
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
  connectionType: string,
  supabaseUrl: string
) {
  for (const change of entry.changes || []) {
    if (change.field !== "messages") continue;

    const value = change.value;
    const phoneNumberId = value.metadata?.phone_number_id;
    
    // Process delivery statuses (delivered, read, failed) even if no messages
    if (value.statuses?.length) {
      // Find connection for status updates
      const { data: statusConn } = await supabase
        .from("meta_connections")
        .select("id, law_firm_id")
        .eq("page_id", phoneNumberId)
        .eq("type", connectionType)
        .eq("is_active", true)
        .maybeSingle();

      if (statusConn) {
        for (const status of value.statuses) {
          const { id: wamid, status: deliveryStatus, errors, timestamp: statusTs } = status;
          console.log(`[meta-webhook] Delivery status: ${deliveryStatus} for wamid=${wamid?.slice(0, 20)}...`);

          if (deliveryStatus === "failed" && errors?.length) {
            console.error("[meta-webhook] Delivery FAILED:", JSON.stringify(errors));
          }

          // Update message delivery status in database if we have the external_id
          if (wamid && (deliveryStatus === "delivered" || deliveryStatus === "read" || deliveryStatus === "failed")) {
            const updateData: Record<string, any> = {
              delivery_status: deliveryStatus,
            };
            if (deliveryStatus === "failed" && errors?.length) {
              updateData.delivery_error = JSON.stringify(errors);
            }
            const { error: updateErr } = await supabase
              .from("messages")
              .update(updateData)
              .eq("external_id", wamid)
              .eq("law_firm_id", statusConn.law_firm_id);
            
            if (updateErr) {
              console.warn("[meta-webhook] Could not update delivery status:", updateErr.message);
            } else {
              console.log(`[meta-webhook] Updated delivery status to '${deliveryStatus}' for ${wamid?.slice(0, 20)}`);
            }
          }
        }
      }
    }

    if (!value.messages?.length) continue;

    // Find connection by phone_number_id (stored as page_id for WABA)
    const { data: connection } = await supabase
      .from("meta_connections")
      .select("id, law_firm_id, access_token, default_department_id, default_status_id, default_automation_id, default_handler_type, default_human_agent_id")
      .eq("page_id", phoneNumberId)
      .eq("type", connectionType)
      .eq("is_active", true)
      .maybeSingle();

    if (!connection) {
      console.warn("[meta-webhook] No WABA connection for phone_number_id:", phoneNumberId);
      continue;
    }

    const lawFirmId = connection.law_firm_id;

    // Decrypt access token for media downloads
    let accessToken: string | null = null;
    if (connection.access_token) {
      try {
        accessToken = await decryptToken(connection.access_token);
      } catch (err) {
        console.error("[meta-webhook] Failed to decrypt access token:", err);
      }
    }

    for (const msg of value.messages) {
      const senderPhone = msg.from; // E.164 format without +
      const remoteJid = senderPhone;

      // Determine content and extract media_id
      let content = "";
      let messageType = "text";
      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;
      let mediaId: string | null = null;

      if (msg.type === "text") {
        content = msg.text?.body || "";
      } else if (msg.type === "image") {
        messageType = "image";
        content = msg.image?.caption || "[imagem]";
        mediaMimeType = msg.image?.mime_type || "image/jpeg";
        mediaId = msg.image?.id || null;
      } else if (msg.type === "audio") {
        messageType = "audio";
        content = "[áudio]";
        mediaMimeType = msg.audio?.mime_type || "audio/ogg";
        mediaId = msg.audio?.id || null;
      } else if (msg.type === "video") {
        messageType = "video";
        content = msg.video?.caption || "[vídeo]";
        mediaMimeType = msg.video?.mime_type || "video/mp4";
        mediaId = msg.video?.id || null;
      } else if (msg.type === "document") {
        messageType = "document";
        content = msg.document?.filename || "[documento]";
        mediaMimeType = msg.document?.mime_type || "application/octet-stream";
        mediaId = msg.document?.id || null;
      } else if (msg.type === "sticker") {
        messageType = "sticker";
        content = "[figurinha]";
        mediaMimeType = msg.sticker?.mime_type || "image/webp";
        mediaId = msg.sticker?.id || null;
      } else if (msg.type === "reaction") {
        // Skip reactions for now
        continue;
      } else if (msg.type === "button") {
        // User replied to a template button
        content = msg.button?.text || msg.button?.payload || "[Resposta de botão]";
      } else if (msg.type === "interactive") {
        // Interactive message response (button_reply, list_reply, etc.)
        const interactive = msg.interactive;
        if (interactive?.type === "button_reply") {
          content = interactive.button_reply?.title || "[Resposta interativa]";
        } else if (interactive?.type === "list_reply") {
          content = interactive.list_reply?.title || "[Seleção de lista]";
        } else {
          content = `[Mensagem interativa: ${interactive?.type || 'desconhecido'}]`;
        }
      } else {
        content = `[${msg.type}]`;
      }

      // Fallback: if content is still empty after all type checks
      if (!content && !mediaId) {
        console.warn("[meta-webhook] Empty content for message type:", msg.type, 
          "Raw keys:", Object.keys(msg).join(','),
          "Raw preview:", JSON.stringify(msg).slice(0, 300));
        content = `[${msg.type || 'mensagem'}]`;
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
            origin_metadata: { phone_number_id: phoneNumberId, connection_type: connectionType, connection_id: connection.id },
            client_id: clientId,
            department_id: connection.default_department_id || null,
            current_automation_id: connection.default_handler_type === "ai" ? connection.default_automation_id : null,
            current_handler: connection.default_handler_type === "ai" ? "ai" : "human",
            assigned_to: connection.default_handler_type === "human" ? connection.default_human_agent_id : null,
            status: "novo_contato",
            last_message_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
          })
          .select("id")
          .single();
        conversationId = newConv?.id || null;
      }

      if (!conversationId) continue;

      // Download media if applicable
      if (mediaId && accessToken && conversationId) {
        const storedUrl = await downloadAndStoreMedia(
          supabase,
          mediaId,
          accessToken,
          lawFirmId,
          conversationId,
          msg.id || mediaId,
          mediaMimeType || "application/octet-stream",
          supabaseUrl
        );
        if (storedUrl) {
          mediaUrl = storedUrl;
        }
      }

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
        hasMedia: !!mediaUrl,
      });
    }
  }
}
