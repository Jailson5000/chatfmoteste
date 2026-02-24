import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * uazapi Webhook Handler
 * 
 * Receives webhook events from uazapi and normalizes them to the internal
 * message format used by the system. This reuses the same database tables
 * and business logic as the Evolution webhook, just with different payload parsing.
 * 
 * uazapi events:
 * - messages       -> equivalent to Evolution MESSAGES_UPSERT
 * - connection     -> equivalent to Evolution CONNECTION_UPDATE
 * - messages_update -> equivalent to Evolution MESSAGES_UPDATE
 * - qrcode         -> equivalent to Evolution QRCODE_UPDATED
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, token",
};

// Webhook token for security validation — uses the same secret as evolution-api webhook URL builder
const UAZAPI_WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN");

function validateWebhookToken(req: Request, body?: any): Response | null {
  if (!UAZAPI_WEBHOOK_TOKEN) {
    console.error("[UAZAPI_WEBHOOK] ❌ EVOLUTION_WEBHOOK_TOKEN not configured");
    return new Response(
      JSON.stringify({ error: "Webhook authentication not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  const headerToken = req.headers.get("token") || req.headers.get("x-webhook-token");
  const queryToken = url.searchParams.get("token");
  const providedToken = headerToken ?? queryToken;

  if (!providedToken || providedToken !== UAZAPI_WEBHOOK_TOKEN) {
    // Allow through if body has BaseUrl (uazapi sends duplicate calls, some without token)
    // Instance will be identified by BaseUrl instead
    if (body?.BaseUrl) {
      console.log("[UAZAPI_WEBHOOK] Token missing but BaseUrl present, allowing through for BaseUrl matching");
      return null; // Allow through
    }
    console.warn("[UAZAPI_WEBHOOK] ❌ Invalid or missing token");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return null; // Valid
}

/**
 * Normalize uazapi phone number to remoteJid format.
 * uazapi sends: "5511999999999"
 * Internal format: "5511999999999@s.whatsapp.net"
 */
function toRemoteJid(number: string): string {
  if (!number) return "";
  const clean = number.replace(/\D/g, "");
  if (clean.includes("@")) return clean;
  return `${clean}@s.whatsapp.net`;
}

/**
 * Extract phone number from remoteJid or raw number.
 */
function extractPhone(value: string): string {
  if (!value) return "";
  return value.split("@")[0].replace(/\D/g, "");
}

/**
 * Detect message type from uazapi payload.
 */
function detectMessageType(msg: any): string {
  if (msg.type === "image" || msg.imageMessage) return "image";
  if (msg.type === "video" || msg.videoMessage) return "video";
  if (msg.type === "audio" || msg.audioMessage) return "audio";
  if (msg.type === "document" || msg.documentMessage) return "document";
  if (msg.type === "sticker" || msg.stickerMessage) return "sticker";
  if (msg.type === "location" || msg.locationMessage) return "location";
  if (msg.type === "contact" || msg.contactMessage || msg.contactsArrayMessage) return "contact";
  return "text";
}

/**
 * Extract text content from uazapi message.
 */
function extractContent(msg: any): string {
  // Direct text
  if (msg.text) return msg.text;
  if (msg.body) return msg.body;
  if (msg.conversation) return msg.conversation;
  
  // Extended text (forwarded, etc.)
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  
  // Media captions
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  
  // Caption field on root
  if (msg.caption) return msg.caption;
  
  return "";
}

/**
 * Extract media URL from uazapi message.
 * uazapi may provide base64 directly or a URL.
 */
function extractMediaUrl(msg: any): string | null {
  // Direct URL fields
  if (msg.mediaUrl) return msg.mediaUrl;
  if (msg.url) return msg.url;
  
  // Nested in type-specific messages
  if (msg.imageMessage?.url) return msg.imageMessage.url;
  if (msg.videoMessage?.url) return msg.videoMessage.url;
  if (msg.audioMessage?.url) return msg.audioMessage.url;
  if (msg.documentMessage?.url) return msg.documentMessage.url;
  if (msg.stickerMessage?.url) return msg.stickerMessage.url;
  
  return null;
}

/**
 * Extract MIME type from uazapi message.
 */
function extractMimeType(msg: any): string | null {
  if (msg.mimetype) return msg.mimetype;
  if (msg.imageMessage?.mimetype) return msg.imageMessage.mimetype;
  if (msg.videoMessage?.mimetype) return msg.videoMessage.mimetype;
  if (msg.audioMessage?.mimetype) return msg.audioMessage.mimetype;
  if (msg.documentMessage?.mimetype) return msg.documentMessage.mimetype;
  if (msg.stickerMessage?.mimetype) return msg.stickerMessage.mimetype;
  return null;
}

/**
 * Extract file name from uazapi message.
 */
function extractFileName(msg: any): string | null {
  if (msg.fileName) return msg.fileName;
  if (msg.documentMessage?.fileName) return msg.documentMessage.fileName;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Validate webhook token (pass body for BaseUrl fallback)
    const tokenError = validateWebhookToken(req, body);
    if (tokenError) return tokenError;
    
    // Detect event type from uazapi payload
    // uazapi sends EventType (PascalCase), normalize to lowercase
    const rawEvent = body.event || body.type || body.EventType || "unknown";
    const event = rawEvent.toLowerCase();
    
    console.log(`[UAZAPI_WEBHOOK] Event: ${event}`, JSON.stringify(body).slice(0, 500));

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Find the instance by token or API URL
    // uazapi webhooks include instance info in the payload
    const instanceToken = body.token || body.instanceToken || null;
    const instancePhone = body.instance?.phone || body.phone || null;
    
    // Try to find the instance by matching api_key (token) or phone number
    let instance: any = null;
    
    if (instanceToken) {
      const { data } = await supabaseClient
        .from("whatsapp_instances")
        .select("*")
        .eq("api_provider", "uazapi")
        .eq("api_key", instanceToken)
        .limit(1)
        .maybeSingle();
      instance = data;
    }
    
    if (!instance && instancePhone) {
      const phone = extractPhone(instancePhone);
      const { data } = await supabaseClient
        .from("whatsapp_instances")
        .select("*")
        .eq("api_provider", "uazapi")
        .eq("phone_number", phone)
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    // If instance not found, try to match by BaseUrl from uazapi payload
    if (!instance && body.BaseUrl) {
      try {
        const baseHostname = new URL(body.BaseUrl).hostname;
        const { data } = await supabaseClient
          .from("whatsapp_instances")
          .select("*")
          .eq("api_provider", "uazapi")
          .ilike("api_url", `%${baseHostname}%`)
          .limit(1)
          .maybeSingle();
        instance = data;
        if (instance) {
          console.log(`[UAZAPI_WEBHOOK] Instance found via BaseUrl: ${baseHostname}`);
        }
      } catch (urlErr) {
        console.warn("[UAZAPI_WEBHOOK] Failed to parse BaseUrl:", body.BaseUrl);
      }
    }

    if (!instance) {
      console.warn("[UAZAPI_WEBHOOK] Could not identify instance from payload", {
        hasToken: !!instanceToken,
        hasPhone: !!instancePhone,
        hasBaseUrl: !!body.BaseUrl,
        event,
      });
      
      return new Response(
        JSON.stringify({ status: "ok", message: "Instance not found, event ignored" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lawFirmId = instance.law_firm_id;
    console.log(`[UAZAPI_WEBHOOK] Instance found: ${instance.instance_name} (${instance.id}), tenant: ${lawFirmId}`);

    // Update last webhook timestamp
    await supabaseClient
      .from("whatsapp_instances")
      .update({
        last_webhook_event: event,
        last_webhook_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", instance.id);

    switch (event) {
      // ============================================================
      // CONNECTION UPDATE
      // ============================================================
      case "connection":
      case "connection_update":
      case "CONNECTION_UPDATE": {
        const state = body.state || body.status || body.connection || "unknown";
        console.log(`[UAZAPI_WEBHOOK] Connection update: ${state}`);

        let dbStatus = "disconnected";
        if (state === "connected" || state === "open") {
          dbStatus = "connected";
        } else if (state === "connecting" || state === "qr") {
          dbStatus = "connecting";
        }

        const updatePayload: Record<string, unknown> = {
          status: dbStatus,
          updated_at: new Date().toISOString(),
        };

        if (dbStatus === "connected") {
          updatePayload.disconnected_since = null;
          updatePayload.awaiting_qr = false;
          updatePayload.reconnect_attempts_count = 0;
          updatePayload.manual_disconnect = false;

          // Try to get phone number from payload
          const phone = body.phone || body.number || body.ownerJid?.split("@")[0] || null;
          if (phone) {
            updatePayload.phone_number = extractPhone(phone);
          }
        } else if (dbStatus === "disconnected") {
          if (!instance.disconnected_since) {
            updatePayload.disconnected_since = new Date().toISOString();
          }
        }

        // Protection: don't downgrade from connected to connecting
        if (dbStatus === "connecting" && instance.status === "connected") {
          console.log("[UAZAPI_WEBHOOK] Skipping downgrade from connected to connecting");
          break;
        }

        await supabaseClient
          .from("whatsapp_instances")
          .update(updatePayload)
          .eq("id", instance.id);

        break;
      }

      // ============================================================
      // QR CODE
      // ============================================================
      case "qrcode":
      case "QRCODE_UPDATED": {
        console.log("[UAZAPI_WEBHOOK] QR code event (handled by polling, ignoring)");
        break;
      }

      // ============================================================
      // INCOMING MESSAGE
      // ============================================================
      case "messages":
      case "message":
      case "MESSAGES_UPSERT": {
        const msg = body.data || body.message || body;
        
        // uazapi sends chat info at root level
        const chat = body.chat || {};
        
        // Skip group messages
        const remoteJidRaw = msg.from || msg.remoteJid || msg.key?.remoteJid || chat.id || "";
        if (remoteJidRaw.includes("@g.us")) {
          console.log("[UAZAPI_WEBHOOK] Skipping group message");
          break;
        }

        // Skip status broadcasts
        if (remoteJidRaw === "status@broadcast") {
          break;
        }

        const isFromMe = msg.fromMe === true || msg.key?.fromMe === true;
        
        // uazapi with excludeMessages: ["wasSentByApi"] should filter these,
        // but double-check as a safety measure
        if (isFromMe && (msg.wasSentByApi || body.wasSentByApi)) {
          console.log("[UAZAPI_WEBHOOK] Skipping message sent by API (anti-loop)");
          break;
        }

        const remoteJid = toRemoteJid(remoteJidRaw);
        const phoneNumber = extractPhone(remoteJidRaw);
        const messageType = detectMessageType(msg);
        const content = extractContent(msg);
        const mediaUrl = extractMediaUrl(msg);
        const mimeType = extractMimeType(msg);
        const fileName = extractFileName(msg);
        const whatsappMessageId = msg.key?.id || msg.id || msg.messageId || crypto.randomUUID();
        const contactName = msg.pushName || msg.notifyName || msg.senderName || chat.name || chat.lead_name || phoneNumber;
        const timestamp = msg.messageTimestamp 
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        console.log(`[UAZAPI_WEBHOOK] Message: ${messageType} from ${phoneNumber} (fromMe: ${isFromMe})`, {
          contentPreview: content?.slice(0, 50),
          hasMedia: !!mediaUrl,
        });

        // Skip empty messages
        if (!content && !mediaUrl && messageType === "text") {
          console.log("[UAZAPI_WEBHOOK] Skipping empty text message");
          break;
        }

        // ---- FIND OR CREATE CONVERSATION ----
        let conversationId: string | null = null;

        // Look for existing conversation
        const { data: existingConv } = await supabaseClient
          .from("conversations")
          .select("id")
          .eq("law_firm_id", lawFirmId)
          .eq("remote_jid", remoteJid)
          .eq("whatsapp_instance_id", instance.id)
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          // Create new conversation
          const { data: newConv, error: convError } = await supabaseClient
            .from("conversations")
            .insert({
              law_firm_id: lawFirmId,
              remote_jid: remoteJid,
              contact_name: contactName,
              contact_phone: phoneNumber,
              whatsapp_instance_id: instance.id,
              status: "open",
              current_handler: "ai",
              last_message_at: timestamp,
              origin: "WHATSAPP",
              // Apply instance defaults
              department_id: instance.default_department_id || null,
              assigned_to: instance.default_assigned_to || null,
              current_automation_id: instance.default_automation_id || null,
            })
            .select("id")
            .single();

          if (convError) {
            // If unique constraint violation, find existing
            if (convError.code === "23505") {
              const { data: existingConv2 } = await supabaseClient
                .from("conversations")
                .select("id")
                .eq("law_firm_id", lawFirmId)
                .eq("remote_jid", remoteJid)
                .eq("whatsapp_instance_id", instance.id)
                .limit(1)
                .maybeSingle();
              conversationId = existingConv2?.id || null;
            } else {
              console.error("[UAZAPI_WEBHOOK] Failed to create conversation:", convError);
              break;
            }
          } else {
            conversationId = newConv?.id || null;
          }
        }

        if (!conversationId) {
          console.error("[UAZAPI_WEBHOOK] Could not resolve conversation");
          break;
        }

        // ---- FIND OR CREATE CLIENT ----
        if (!isFromMe) {
          const normalizedPhone = phoneNumber.replace(/\D/g, "");
          const { data: existingClient } = await supabaseClient
            .from("clients")
            .select("id")
            .eq("law_firm_id", lawFirmId)
            .or(`phone.eq.${normalizedPhone},phone.eq.+${normalizedPhone}`)
            .limit(1)
            .maybeSingle();

          if (!existingClient) {
            const { data: newClient } = await supabaseClient
              .from("clients")
              .insert({
                law_firm_id: lawFirmId,
                name: contactName || phoneNumber,
                phone: normalizedPhone,
                whatsapp_instance_id: instance.id,
              })
              .select("id")
              .maybeSingle();

            if (newClient) {
              await supabaseClient
                .from("conversations")
                .update({ client_id: newClient.id })
                .eq("id", conversationId);
            }
          } else {
            // Ensure conversation has client linked
            await supabaseClient
              .from("conversations")
              .update({ client_id: existingClient.id })
              .eq("id", conversationId)
              .is("client_id", null);
          }
        }

        // ---- CHECK FOR DUPLICATE MESSAGE ----
        const { data: existingMsg } = await supabaseClient
          .from("messages")
          .select("id")
          .eq("whatsapp_message_id", whatsappMessageId)
          .eq("conversation_id", conversationId)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          console.log("[UAZAPI_WEBHOOK] Duplicate message, skipping:", whatsappMessageId);
          break;
        }

        // ---- SAVE MESSAGE ----
        const messagePayload: Record<string, unknown> = {
          conversation_id: conversationId,
          whatsapp_message_id: whatsappMessageId,
          content: content || null,
          message_type: messageType,
          is_from_me: isFromMe,
          sender_type: isFromMe ? "human" : "client",
          ai_generated: false,
          created_at: timestamp,
          media_url: mediaUrl || null,
          mime_type: mimeType || null,
          file_name: fileName || null,
          law_firm_id: lawFirmId,
        };

        // Handle base64 media from uazapi
        if (msg.base64 && !mediaUrl) {
          // Store base64 media to Supabase Storage
          try {
            const base64Data = msg.base64;
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }

            const extMap: Record<string, string> = {
              "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
              "image/webp": ".webp", "audio/ogg": ".ogg", "audio/mpeg": ".mp3",
              "audio/mp4": ".m4a", "video/mp4": ".mp4", "application/pdf": ".pdf",
            };
            const baseMime = (mimeType || "").split(";")[0].trim().toLowerCase();
            const ext = extMap[baseMime] || ".bin";
            const storagePath = `${lawFirmId}/${conversationId}/${whatsappMessageId}${ext}`;

            const { error: uploadError } = await supabaseClient.storage
              .from("chat-media")
              .upload(storagePath, bytes, {
                contentType: baseMime || "application/octet-stream",
                upsert: true,
              });

            if (!uploadError) {
              const { data: publicUrlData } = supabaseClient.storage
                .from("chat-media")
                .getPublicUrl(storagePath);
              if (publicUrlData?.publicUrl) {
                messagePayload.media_url = publicUrlData.publicUrl;
                console.log("[UAZAPI_WEBHOOK] Media persisted to storage:", storagePath);
              }
            } else {
              console.warn("[UAZAPI_WEBHOOK] Media upload failed:", uploadError.message);
            }
          } catch (mediaErr) {
            console.warn("[UAZAPI_WEBHOOK] Error persisting media:", mediaErr);
          }
        }

        const { error: msgInsertError } = await supabaseClient
          .from("messages")
          .insert(messagePayload);

        if (msgInsertError) {
          console.error("[UAZAPI_WEBHOOK] Failed to insert message:", msgInsertError);
          break;
        }

        // Update conversation contact info and last_message_at
        const convUpdate: Record<string, unknown> = {
          last_message_at: timestamp,
          updated_at: new Date().toISOString(),
        };
        if (!isFromMe && contactName) {
          convUpdate.contact_name = contactName;
        }
        
        await supabaseClient
          .from("conversations")
          .update(convUpdate)
          .eq("id", conversationId);

        console.log(`[UAZAPI_WEBHOOK] Message saved: ${whatsappMessageId} -> conversation ${conversationId}`);

        // ---- TRIGGER AI PROCESSING ----
        // If message is from client and conversation is handled by AI, trigger AI response
        if (!isFromMe) {
          const { data: conv } = await supabaseClient
            .from("conversations")
            .select("current_handler, current_automation_id")
            .eq("id", conversationId)
            .single();

          if (conv?.current_handler === "ai" && conv?.current_automation_id) {
            console.log("[UAZAPI_WEBHOOK] Triggering AI processing for conversation:", conversationId);
            
            // Invoke ai-chat edge function in background
            try {
              const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
              
              fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  conversationId,
                  lawFirmId,
                  messageId: whatsappMessageId,
                  source: "uazapi_webhook",
                }),
              }).catch(err => {
                console.warn("[UAZAPI_WEBHOOK] AI trigger failed (non-blocking):", err);
              });
            } catch (aiErr) {
              console.warn("[UAZAPI_WEBHOOK] AI trigger error:", aiErr);
            }
          }
        }

        break;
      }

      // ============================================================
      // MESSAGE STATUS UPDATE (delivered, read, etc.)
      // ============================================================
      case "messages_update":
      case "message_update":
      case "MESSAGES_UPDATE": {
        // Currently not processing status updates (same as Evolution optimization)
        console.log("[UAZAPI_WEBHOOK] Message update event (ignored for optimization)");
        break;
      }

      default: {
        console.log(`[UAZAPI_WEBHOOK] Unhandled event: ${event}`);
        break;
      }
    }

    return new Response(
      JSON.stringify({ status: "ok" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[UAZAPI_WEBHOOK] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
