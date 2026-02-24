import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * uazapi Webhook Handler
 * 
 * Receives webhook events from uazapi and normalizes them to the internal
 * message format used by the system. This reuses the same database tables
 * and business logic as the Evolution webhook, just with different payload parsing.
 * 
 * uazapi payload structure (confirmed from production logs):
 * body = {
 *   EventType: "messages",
 *   chat: { phone: "+55 63 ...", name: "...", imagePreview: "https://pps.whatsapp.net/..." },
 *   message: {
 *     type: "DocumentMessage" (PascalCase!),
 *     content: { URL: "...", mimetype: "...", fileName: "...", text: "...", base64: "..." },
 *     fromMe: false,
 *     id: "3EB0...",
 *     timestamp: 1771936645,
 *     pushName: "..."
 *   }
 * }
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
    if (body?.BaseUrl) {
      console.log("[UAZAPI_WEBHOOK] Token missing but BaseUrl present, allowing through for BaseUrl matching");
      return null;
    }
    console.warn("[UAZAPI_WEBHOOK] ❌ Invalid or missing token");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return null;
}

/**
 * Normalize uazapi phone number to remoteJid format.
 */
function toRemoteJid(number: string): string {
  if (!number) return "";
  const clean = number.replace(/\D/g, "");
  if (clean.includes("@")) return clean;
  return `${clean}@s.whatsapp.net`;
}

function extractPhone(value: string): string {
  if (!value) return "";
  return value.split("@")[0].replace(/\D/g, "");
}

/**
 * Detect message type from uazapi payload.
 * uazapi sends PascalCase types OR generic "media" type.
 * When type is "media", infer real type from mimeType or chat.wa_lastMessageType.
 */
function detectMessageType(msg: any, chat?: any): string {
  let t = (msg.type || "").toLowerCase();

  // uazapi often sends generic "media" type — use wa_lastMessageType as fallback
  if (t === "media" && chat?.wa_lastMessageType) {
    t = chat.wa_lastMessageType.toLowerCase();
  }

  // If still "media", infer from mimeType
  if (t === "media") {
    const mime = (extractMimeType(msg) || "").toLowerCase();
    if (mime.startsWith("image/webp")) return "sticker";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document"; // PDFs, DOCX, etc.
  }

  if (t === "image" || t === "imagemessage" || msg.imageMessage) return "image";
  if (t === "video" || t === "videomessage" || msg.videoMessage) return "video";
  if (t === "audio" || t === "audiomessage" || t === "ptt" || t === "pttmessage" || t === "myaudio" || msg.audioMessage) return "audio";
  if (t === "document" || t === "documentmessage" || msg.documentMessage) return "document";
  if (t === "sticker" || t === "stickermessage" || msg.stickerMessage) return "sticker";
  if (t === "location" || t === "locationmessage" || msg.locationMessage) return "location";
  if (t === "contact" || t === "contactmessage" || t === "contactcardmessage" || msg.contactMessage || msg.contactsArrayMessage) return "contact";
  if (t === "extendedtextmessage") return "text";
  return "text";
}

/**
 * Extract text content from uazapi message.
 * uazapi nests data inside msg.content (object).
 */
function extractContent(msg: any): string {
  // Direct text at msg level
  if (msg.text) return msg.text;
  if (msg.body) return msg.body;
  if (msg.conversation) return msg.conversation;

  // uazapi: content is an object with the actual data
  const c = msg.content;
  if (c && typeof c === "object") {
    if (c.text) return c.text;
    if (c.caption) return c.caption;
    if (c.conversation) return c.conversation;
    if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
  }

  // Fallback: content as string
  if (typeof msg.content === "string") return msg.content;

  // Extended text at msg level
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

  // Media captions at msg level (Evolution format)
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  if (msg.caption) return msg.caption;

  return "";
}

/**
 * Extract media URL from uazapi message.
 * uazapi puts URL inside msg.content.URL (uppercase).
 */
function extractMediaUrl(msg: any): string | null {
  // uazapi: media URL inside msg.content
  const c = msg.content;
  if (c && typeof c === "object") {
    if (c.URL) return c.URL;
    if (c.url) return c.url;
    if (c.mediaUrl) return c.mediaUrl;
  }

  // Direct URL fields
  if (msg.mediaUrl) return msg.mediaUrl;
  if (msg.url) return msg.url;
  if (msg.file && typeof msg.file === "string" && msg.file.startsWith("http")) return msg.file;

  // Nested in type-specific messages (Evolution format)
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
  // uazapi: nested in content
  const c = msg.content;
  if (c && typeof c === "object" && c.mimetype) return c.mimetype;

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
  const c = msg.content;
  if (c && typeof c === "object" && c.fileName) return c.fileName;

  if (msg.fileName) return msg.fileName;
  if (msg.documentMessage?.fileName) return msg.documentMessage.fileName;
  return null;
}

/**
 * Persist profile picture from chat.imagePreview to Storage.
 * Runs as fire-and-forget (non-blocking).
 */
async function persistProfilePicture(
  supabaseClient: any,
  clientId: string,
  lawFirmId: string,
  imageUrl: string,
): Promise<void> {
  try {
    // Check if client already has avatar
    const { data: client } = await supabaseClient
      .from("clients")
      .select("avatar_url")
      .eq("id", clientId)
      .single();
    if (client?.avatar_url) return;

    // Download profile picture
    const response = await fetch(imageUrl);
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 100) return; // Too small, probably not a valid image

    const storagePath = `${lawFirmId}/avatars/${clientId}.jpg`;

    const { error: uploadError } = await supabaseClient.storage
      .from("chat-media")
      .upload(storagePath, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.warn("[UAZAPI_WEBHOOK] Avatar upload failed:", uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from("chat-media")
      .getPublicUrl(storagePath);

    if (publicUrlData?.publicUrl) {
      await supabaseClient
        .from("clients")
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq("id", clientId);
      console.log(`[UAZAPI_WEBHOOK] Profile picture persisted for client ${clientId}`);
    }
  } catch (err) {
    console.warn("[UAZAPI_WEBHOOK] Profile picture persistence error:", err);
  }
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
    const rawEvent = body.event || body.type || body.EventType || "unknown";
    const event = rawEvent.toLowerCase();
    
    console.log(`[UAZAPI_WEBHOOK] Event: ${event}`, JSON.stringify(body).slice(0, 2000));

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Find the instance by token or API URL
    const instanceToken = body.token || body.instanceToken || null;
    const instancePhone = body.instance?.phone || body.phone || null;
    
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

          let phone = body.phone || body.number || body.ownerJid?.split("@")[0] || null;

          // Auto-fetch phone from uazapi /instance/status when not in payload and not yet stored
          if (!phone && !instance.phone_number && instance.api_url && instance.api_key) {
            try {
              const baseUrl = (instance.api_url as string).replace(/\/+$/, "");
              const statusRes = await fetch(`${baseUrl}/instance/status`, {
                method: "GET",
                headers: { token: instance.api_key as string, "Content-Type": "application/json" },
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                phone = statusData?.phone || statusData?.number || statusData?.ownerJid?.split("@")[0] || null;
                console.log("[UAZAPI_WEBHOOK] Auto-fetched phone from status:", phone);
              }
            } catch (e) {
              console.warn("[UAZAPI_WEBHOOK] Failed to auto-fetch phone:", e);
            }
          }

          if (phone) {
            updatePayload.phone_number = extractPhone(phone);
          }
        } else if (dbStatus === "disconnected") {
          if (!instance.disconnected_since) {
            updatePayload.disconnected_since = new Date().toISOString();
          }
        }

        if (dbStatus === "connecting" && instance.status === "connected") {
          console.log("[UAZAPI_WEBHOOK] Skipping downgrade from connected to connecting");
          break;
        }

        await supabaseClient
          .from("whatsapp_instances")
          .update(updatePayload)
          .eq("id", instance.id);

        // Reassociate orphan conversations/clients when instance connects
        // (same logic as evolution-webhook)
        if (dbStatus === "connected") {
          try {
            const { data: reassocResult } = await supabaseClient
              .rpc('reassociate_orphan_records', { _instance_id: instance.id });
            console.log("[UAZAPI_WEBHOOK] Reassociate orphan records result:", JSON.stringify(reassocResult));
          } catch (reassocErr) {
            console.warn("[UAZAPI_WEBHOOK] Failed to reassociate orphan records:", reassocErr);
          }
        }

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
        // uazapi uses body.msg or body.message — prioritize body.msg
        const msg = body.msg || body.data || body.message || body;
        
        // uazapi sends chat info at root level
        const chat = body.chat || {};

        // Auto-populate instance phone_number from chat.owner if missing
        const chatOwner = (chat as any).owner || (chat as any).wa_owner || "";
        if (chatOwner && !instance.phone_number) {
          const ownerPhone = extractPhone(chatOwner);
          if (ownerPhone && ownerPhone.length >= 10) {
            console.log("[UAZAPI_WEBHOOK] Auto-populating phone from chat.owner:", ownerPhone);
            await supabaseClient
              .from("whatsapp_instances")
              .update({ phone_number: ownerPhone, updated_at: new Date().toISOString() })
              .eq("id", instance.id);
            (instance as any).phone_number = ownerPhone;
          }
        }

        // Skip group messages
        const chatPhoneClean = chat.phone ? chat.phone.replace(/\D/g, "") : "";
        const remoteJidRaw = msg.from || msg.remoteJid || msg.key?.remoteJid 
          || (chatPhoneClean.length >= 10 ? chatPhoneClean : null)
          || chat.id || "";
        if (remoteJidRaw.includes("@g.us")) {
          console.log("[UAZAPI_WEBHOOK] Skipping group message");
          break;
        }

        if (remoteJidRaw === "status@broadcast") {
          break;
        }

        const isFromMe = msg.fromMe === true || msg.key?.fromMe === true;
        
        if (isFromMe && (msg.wasSentByApi || body.wasSentByApi)) {
          console.log("[UAZAPI_WEBHOOK] Skipping message sent by API (anti-loop)");
          break;
        }

        const remoteJid = toRemoteJid(remoteJidRaw);
        const phoneNumber = extractPhone(remoteJidRaw);
        const messageType = detectMessageType(msg, chat);
        const content = extractContent(msg);
        const mediaUrl = extractMediaUrl(msg);
        const mimeType = extractMimeType(msg);
        const fileName = extractFileName(msg);
        
        // Extract message ID — uazapi puts id directly on msg
        const whatsappMessageId = msg.id || msg.key?.id || msg.messageId || crypto.randomUUID();
        
        // Extract contact name
        const contactName = msg.pushName || msg.notifyName || msg.senderName || chat.name || chat.lead_name || phoneNumber;
        
        // Extract timestamp — uazapi uses msg.timestamp (not msg.messageTimestamp)
        const rawTs = Number(msg.timestamp || msg.messageTimestamp);
        let timestamp: string;
        if (!rawTs || isNaN(rawTs) || rawTs <= 0) {
          timestamp = new Date().toISOString();
        } else if (rawTs > 1e12) {
          timestamp = new Date(rawTs).toISOString();
        } else {
          timestamp = new Date(rawTs * 1000).toISOString();
        }

        // Debug phone resolution
        console.log(`[UAZAPI_WEBHOOK] Phone resolution:`, {
          "chat.phone": chat.phone,
          "chatPhoneClean": chatPhoneClean,
          "remoteJidRaw": remoteJidRaw,
          "extractedPhone": phoneNumber,
          "remoteJid": remoteJid,
        });

        // Extract base64 — check msg.content.base64 first (uazapi), then direct fields
        const msgContent = msg.content;
        const contentBase64 = (msgContent && typeof msgContent === "object") ? msgContent.base64 : null;
        const hasAnyBase64 = !!(contentBase64 || msg.base64 || body.base64 
          || (msg.file && typeof msg.file === "string" && !msg.file.startsWith("http"))
          || msg.imageMessage?.base64 || msg.videoMessage?.base64 
          || msg.audioMessage?.base64 || msg.documentMessage?.base64 
          || msg.stickerMessage?.base64);

        console.log(`[UAZAPI_WEBHOOK] Message: ${messageType} from ${phoneNumber} (fromMe: ${isFromMe})`, {
          contentPreview: content?.slice(0, 50),
          hasMedia: !!mediaUrl,
          hasBase64: hasAnyBase64,
          mimeType: mimeType || null,
          fileName: fileName || null,
          msgType: msg.type || null,
        });

        // Skip empty messages
        if (!content && !mediaUrl && !hasAnyBase64 && messageType === "text") {
          console.log("[UAZAPI_WEBHOOK] Skipping empty text message");
          break;
        }

        // ---- FIND OR CREATE CONVERSATION ----
        let conversationId: string | null = null;

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
          // FALLBACK: Search for orphan conversation from same contact (any instance)
          const { data: orphanConv } = await supabaseClient
            .from("conversations")
            .select("id, whatsapp_instance_id, client_id")
            .eq("law_firm_id", lawFirmId)
            .eq("remote_jid", remoteJid)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (orphanConv) {
            // Reassign orphan conversation to current instance
            conversationId = orphanConv.id;
            console.log(`[UAZAPI_WEBHOOK] Found orphan conversation ${orphanConv.id}, reassigning from instance ${orphanConv.whatsapp_instance_id} to ${instance.id}`);
            
            await supabaseClient
              .from("conversations")
              .update({
                whatsapp_instance_id: instance.id,
                last_whatsapp_instance_id: orphanConv.whatsapp_instance_id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", orphanConv.id);

            // Reassign client to current instance as well
            if (orphanConv.client_id) {
              await supabaseClient
                .from("clients")
                .update({
                  whatsapp_instance_id: instance.id,
                  last_whatsapp_instance_id: orphanConv.whatsapp_instance_id,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", orphanConv.client_id);
            }
          } else {
            // No existing conversation found — create new one
            const { data: newConv, error: convError } = await supabaseClient
              .from("conversations")
              .insert({
                law_firm_id: lawFirmId,
                remote_jid: remoteJid,
                contact_name: contactName,
                contact_phone: phoneNumber,
                whatsapp_instance_id: instance.id,
                status: "novo_contato",
                current_handler: "ai",
                last_message_at: timestamp,
                origin: "WHATSAPP",
                department_id: instance.default_department_id || null,
                assigned_to: instance.default_assigned_to || null,
                current_automation_id: instance.default_automation_id || null,
              })
              .select("id")
              .single();

            if (convError) {
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
        }

        if (!conversationId) {
          console.error("[UAZAPI_WEBHOOK] Could not resolve conversation");
          break;
        }

        // ---- FIND OR CREATE CLIENT ----
        let resolvedClientId: string | null = null;
        if (!isFromMe) {
          const normalizedPhone = phoneNumber.replace(/\D/g, "");
          const { data: existingClient } = await supabaseClient
            .from("clients")
            .select("id, avatar_url")
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
              resolvedClientId = newClient.id;
              await supabaseClient
                .from("conversations")
                .update({ client_id: newClient.id })
                .eq("id", conversationId);
            }
          } else {
            resolvedClientId = existingClient.id;
            // Ensure conversation has client linked
            await supabaseClient
              .from("conversations")
              .update({ client_id: existingClient.id })
              .eq("id", conversationId)
              .is("client_id", null);
          }

          // ---- PERSIST PROFILE PICTURE ----
          if (resolvedClientId && chat.imagePreview && typeof chat.imagePreview === "string" && chat.imagePreview.startsWith("http")) {
            persistProfilePicture(supabaseClient, resolvedClientId, lawFirmId, chat.imagePreview).catch(() => {});
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
        let finalContent = content;
        if (!finalContent && messageType !== "text") {
          if (fileName) finalContent = `[${fileName}]`;
          else finalContent = `[${messageType}]`;
        }

        const messagePayload: Record<string, unknown> = {
          conversation_id: conversationId,
          whatsapp_message_id: whatsappMessageId,
          content: finalContent || null,
          message_type: messageType,
          is_from_me: isFromMe,
          sender_type: isFromMe ? "human" : "client",
          ai_generated: false,
          created_at: timestamp,
          media_url: mediaUrl || null,
          media_mime_type: mimeType || null,
          law_firm_id: lawFirmId,
        };

        // Handle base64 media — prioritize msg.content.base64 (uazapi), then fallbacks
        const rawBase64 = contentBase64
          || msg.base64 || body.base64 
          || (msg.file && typeof msg.file === "string" && !msg.file.startsWith("http") ? msg.file : null)
          || msg.imageMessage?.base64 || msg.videoMessage?.base64 
          || msg.audioMessage?.base64 || msg.documentMessage?.base64 
          || msg.stickerMessage?.base64 || null;

        // Shared extension map for both base64 and CDN download paths
        const extMap: Record<string, string> = {
          "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
          "image/webp": ".webp", "audio/ogg": ".ogg", "audio/mpeg": ".mp3",
          "audio/mp4": ".m4a", "audio/ogg;codecs=opus": ".ogg", "audio/ogg; codecs=opus": ".ogg",
          "video/mp4": ".mp4", "application/pdf": ".pdf",
          "application/msword": ".doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
          "application/vnd.ms-excel": ".xls",
        };
        const baseMime = (mimeType || "").split(";")[0].trim().toLowerCase();

        // Path 1: Persist base64 media (when available)
        if (rawBase64 && !mediaUrl) {
          try {
            const binaryStr = atob(rawBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }

            const ext = extMap[baseMime] || extMap[mimeType || ""] || ".bin";
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
                console.log("[UAZAPI_WEBHOOK] Media persisted to storage (base64):", storagePath);
              }
            } else {
              console.warn("[UAZAPI_WEBHOOK] Media upload failed:", uploadError.message);
            }
          } catch (mediaErr) {
            console.warn("[UAZAPI_WEBHOOK] Error persisting base64 media:", mediaErr);
          }
        }

        // Path 2: Use uazapi /message/download endpoint for media
        // CDN URLs (mmg.whatsapp.net, web.whatsapp.net) are encrypted/expired — use uazapi's download API
        const currentMediaUrl = messagePayload.media_url as string | null;
        const isAlreadyPersisted = currentMediaUrl && (currentMediaUrl.includes("supabase") || currentMediaUrl.includes("/storage/v1/"));
        if (!isAlreadyPersisted && messageType !== "text" && messageType !== "location" && messageType !== "contact") {
          try {
            const apiUrl = (instance.api_url || "").replace(/\/+$/, "");
            const apiKey = instance.api_key || "";
            
            if (apiUrl && apiKey) {
              console.log("[UAZAPI_WEBHOOK] Downloading media via /message/download for:", whatsappMessageId);
              
              const isAudio = messageType === "audio";
              const downloadBody = {
                id: whatsappMessageId,
                return_link: true,
                return_base64: false,
                generate_mp3: isAudio, // Convert audio to mp3 for browser compatibility
              };
              
              const dlResponse = await fetch(`${apiUrl}/message/download`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "token": apiKey,
                },
                body: JSON.stringify(downloadBody),
              });
              
              if (dlResponse.ok) {
                const dlData = await dlResponse.json();
                const fileURL = dlData.fileURL || dlData.file_url || dlData.url;
                const dlMime = dlData.mimetype || dlData.mimeType || mimeType || "";
                const dlBaseMime = dlMime.split(";")[0].trim().toLowerCase();
                
                // Update mimeType if uazapi returned a better one (e.g. audio/mpeg after mp3 conversion)
                if (dlBaseMime) {
                  messagePayload.media_mime_type = dlMime;
                }
                
                if (fileURL && typeof fileURL === "string" && fileURL.startsWith("http")) {
                  // Download the file from uazapi's temporary URL and persist to our storage
                  try {
                    const fileResponse = await fetch(fileURL);
                    if (fileResponse.ok) {
                      const bytes = new Uint8Array(await fileResponse.arrayBuffer());
                      if (bytes.length > 100) {
                        const finalMime = dlBaseMime || baseMime;
                        const ext = extMap[finalMime] || extMap[dlMime] || ".bin";
                        const storagePath = `${lawFirmId}/${conversationId}/${whatsappMessageId}${ext}`;
                        
                        const { error: uploadError } = await supabaseClient.storage
                          .from("chat-media")
                          .upload(storagePath, bytes, {
                            contentType: finalMime || "application/octet-stream",
                            upsert: true,
                          });
                        
                        if (!uploadError) {
                          const { data: publicUrlData } = supabaseClient.storage
                            .from("chat-media")
                            .getPublicUrl(storagePath);
                          if (publicUrlData?.publicUrl) {
                            messagePayload.media_url = publicUrlData.publicUrl;
                            console.log("[UAZAPI_WEBHOOK] Media persisted via /message/download:", storagePath);
                          }
                        } else {
                          console.warn("[UAZAPI_WEBHOOK] Storage upload failed:", uploadError.message);
                        }
                      } else {
                        console.warn("[UAZAPI_WEBHOOK] Downloaded file too small:", bytes.length, "bytes");
                      }
                    } else {
                      console.warn("[UAZAPI_WEBHOOK] File download HTTP error:", fileResponse.status);
                    }
                  } catch (fileErr) {
                    console.warn("[UAZAPI_WEBHOOK] File download from uazapi failed:", fileErr);
                  }
                } else if (dlData.base64Data || dlData.base64) {
                  // Fallback: if uazapi returned base64 instead of link
                  try {
                    const b64 = dlData.base64Data || dlData.base64;
                    const binaryStr = atob(b64);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                      bytes[i] = binaryStr.charCodeAt(i);
                    }
                    const finalMime = dlBaseMime || baseMime;
                    const ext = extMap[finalMime] || ".bin";
                    const storagePath = `${lawFirmId}/${conversationId}/${whatsappMessageId}${ext}`;
                    
                    const { error: uploadError } = await supabaseClient.storage
                      .from("chat-media")
                      .upload(storagePath, bytes, {
                        contentType: finalMime || "application/octet-stream",
                        upsert: true,
                      });
                    
                    if (!uploadError) {
                      const { data: publicUrlData } = supabaseClient.storage
                        .from("chat-media")
                        .getPublicUrl(storagePath);
                      if (publicUrlData?.publicUrl) {
                        messagePayload.media_url = publicUrlData.publicUrl;
                        console.log("[UAZAPI_WEBHOOK] Media persisted via base64 fallback:", storagePath);
                      }
                    }
                  } catch (b64Err) {
                    console.warn("[UAZAPI_WEBHOOK] Base64 fallback failed:", b64Err);
                  }
                } else {
                  console.warn("[UAZAPI_WEBHOOK] /message/download returned no fileURL or base64:", JSON.stringify(dlData).slice(0, 300));
                }
              } else {
                const errText = await dlResponse.text().catch(() => "");
                console.warn("[UAZAPI_WEBHOOK] /message/download failed:", dlResponse.status, errText.slice(0, 200));
              }
            }
          } catch (dlErr) {
            console.warn("[UAZAPI_WEBHOOK] Media download failed:", dlErr);
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
        if (!isFromMe && content) {
          const { data: conv } = await supabaseClient
            .from("conversations")
            .select("current_handler, current_automation_id")
            .eq("id", conversationId)
            .single();

          if (conv?.current_handler === "ai" && conv?.current_automation_id) {
            console.log("[UAZAPI_WEBHOOK] Triggering AI processing for conversation:", conversationId, "message:", content?.substring(0, 50));
            
            try {
              const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
              
              const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  conversationId,
                  message: content,
                  automationId: conv.current_automation_id,
                  source: "whatsapp",
                  context: {
                    clientName: contactName,
                    clientPhone: phoneNumber,
                    lawFirmId,
                    clientId: resolvedClientId,
                    skipSaveUserMessage: true,
                    skipSaveAIResponse: true,
                  },
                }),
              });

              if (aiResponse.ok) {
                const result = await aiResponse.json();
                const aiText = result.response;
                console.log("[UAZAPI_WEBHOOK] AI response received:", aiText?.substring(0, 80));

                if (aiText && instance.api_url && instance.api_key) {
                  // Send AI response to WhatsApp via uazapi
                  const apiUrl = instance.api_url.replace(/\/+$/, "");
                  const targetNumber = remoteJid.replace("@s.whatsapp.net", "");
                  
                  const sendRes = await fetch(`${apiUrl}/send/text`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      token: instance.api_key,
                    },
                    body: JSON.stringify({ number: targetNumber, text: aiText }),
                  });

                  const sendData = await sendRes.json().catch(() => ({}));
                  const aiMsgId = sendData?.key?.id || sendData?.id || crypto.randomUUID();
                  console.log("[UAZAPI_WEBHOOK] AI message sent to WhatsApp, id:", aiMsgId);

                  // Save AI message to database
                  await supabaseClient.from("messages").insert({
                    conversation_id: conversationId,
                    whatsapp_message_id: aiMsgId,
                    content: aiText,
                    message_type: "text",
                    is_from_me: true,
                    sender_type: "ai",
                    ai_generated: true,
                    law_firm_id: lawFirmId,
                  });

                  // Update conversation timestamp
                  await supabaseClient
                    .from("conversations")
                    .update({ last_message_at: new Date().toISOString() })
                    .eq("id", conversationId);
                }
              } else {
                const errText = await aiResponse.text().catch(() => "");
                console.warn("[UAZAPI_WEBHOOK] AI chat returned error:", aiResponse.status, errText?.substring(0, 200));
              }
            } catch (aiErr) {
              console.warn("[UAZAPI_WEBHOOK] AI processing error:", aiErr);
            }
          }
        }

        break;
      }

      // ============================================================
      // MESSAGE STATUS UPDATE
      // ============================================================
      case "messages_update":
      case "message_update":
      case "MESSAGES_UPDATE": {
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
