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

  // Interactive / Template message types — treat as text with structured content
  if (t === "buttonsresponsemessage" || t === "buttons_response" || msg.buttonsResponseMessage) return "text";
  if (t === "listresponsemessage" || t === "list_response" || msg.listResponseMessage) return "text";
  if (t === "templatebuttonreplymessage" || t === "template_button_reply" || msg.templateButtonReplyMessage) return "text";
  if (t === "interactiveresponsemessage" || t === "interactive_response" || msg.interactiveResponseMessage) return "text";
  if (t === "templatemessage" || t === "template" || msg.templateMessage) {
    // templateMessage can contain media — detect it
    const tmpl = msg.templateMessage || msg.content?.templateMessage;
    const hydrated = tmpl?.hydratedTemplate || tmpl?.hydratedFourRowTemplate;
    if (hydrated?.imageMessage) return "image";
    if (hydrated?.videoMessage) return "video";
    if (hydrated?.documentMessage) return "document";
    return "text";
  }

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

  // ============ Interactive / Template message extraction ============

  // buttonsResponseMessage — user clicked a quick-reply button
  const buttonsResp = msg.buttonsResponseMessage || c?.buttonsResponseMessage;
  if (buttonsResp) {
    return buttonsResp.selectedDisplayText || buttonsResp.selectedButtonId || "";
  }

  // listResponseMessage — user selected an item from a list
  const listResp = msg.listResponseMessage || c?.listResponseMessage;
  if (listResp) {
    return listResp.title || listResp.description || listResp.singleSelectReply?.selectedRowId || "";
  }

  // templateButtonReplyMessage — user clicked a template button
  const templateBtnReply = msg.templateButtonReplyMessage || c?.templateButtonReplyMessage;
  if (templateBtnReply) {
    return templateBtnReply.selectedDisplayText || templateBtnReply.selectedId || "";
  }

  // interactiveResponseMessage — generic interactive response (nfm, flows, etc.)
  const interactiveResp = msg.interactiveResponseMessage || c?.interactiveResponseMessage;
  if (interactiveResp) {
    const body = interactiveResp.body || interactiveResp.nativeFlowResponseMessage;
    if (body?.text) return body.text;
    if (typeof body === "string") return body;
    // Try extracting from params
    if (body?.paramsJson) {
      try {
        const params = JSON.parse(body.paramsJson);
        return params.response_text || params.text || body.paramsJson;
      } catch { /* ignore */ }
    }
    return interactiveResp.selectedDisplayText || "";
  }

  // templateMessage — marketing/utility template with optional media and buttons
  const tmpl = msg.templateMessage || c?.templateMessage;
  if (tmpl) {
    const hydrated = tmpl.hydratedTemplate || tmpl.hydratedFourRowTemplate;
    if (hydrated) {
      let text = hydrated.hydratedContentText || "";
      
      // Collect buttons
      const buttons: string[] = [];
      if (hydrated.hydratedButtons && Array.isArray(hydrated.hydratedButtons)) {
        for (const btn of hydrated.hydratedButtons) {
          const label = btn.quickReplyButton?.displayText || 
                        btn.urlButton?.displayText || 
                        btn.callButton?.displayText || "";
          if (label) buttons.push(label);
        }
      }
      
      if (buttons.length > 0) {
        text += `\n[Opções: ${buttons.join(" | ")}]`;
      }
      
      return text.trim();
    }
  }

  // ============ End interactive / template extraction ============

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

  // templateMessage with media
  const tmpl = msg.templateMessage || c?.templateMessage;
  if (tmpl) {
    const hydrated = tmpl.hydratedTemplate || tmpl.hydratedFourRowTemplate;
    if (hydrated?.imageMessage?.url) return hydrated.imageMessage.url;
    if (hydrated?.videoMessage?.url) return hydrated.videoMessage.url;
    if (hydrated?.documentMessage?.url) return hydrated.documentMessage.url;
  }

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
    const rawEvent = body.EventType || body.type || (typeof body.event === "string" ? body.event : null) || "unknown";
    const event = String(rawEvent).toLowerCase();
    
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
        let remoteJidRaw = msg.from || msg.remoteJid || msg.key?.remoteJid 
          || (chatPhoneClean.length >= 10 ? chatPhoneClean : null)
          || chat.id || "";

        // ============================================================
        // LID RESOLUTION: Convert @lid to real JID
        // uazapi sometimes sends LID (Linked ID) instead of phone-based JID.
        // We must resolve to real phone JID to match existing conversations.
        // ============================================================
        if (String(remoteJidRaw).includes("@lid")) {
          console.log(`[UAZAPI_WEBHOOK] 🔄 LID detected: ${remoteJidRaw}, attempting resolution...`);
          let resolvedFromLid = false;

          // Try 1: chat.wa_chatid (e.g. "557196084344@s.whatsapp.net")
          if (!resolvedFromLid && chat.wa_chatid && String(chat.wa_chatid).includes("@s.whatsapp.net")) {
            remoteJidRaw = chat.wa_chatid;
            resolvedFromLid = true;
            console.log(`[UAZAPI_WEBHOOK] ✅ LID resolved via wa_chatid: ${remoteJidRaw}`);
          }

          // Try 2: chat.wa_fastid (format "owner:realphone") — extract part after ":"
          if (!resolvedFromLid && chat.wa_fastid && String(chat.wa_fastid).includes(":")) {
            const fastIdParts = String(chat.wa_fastid).split(":");
            const realPhone = fastIdParts[fastIdParts.length - 1]?.replace(/\D/g, "");
            if (realPhone && realPhone.length >= 10) {
              remoteJidRaw = `${realPhone}@s.whatsapp.net`;
              resolvedFromLid = true;
              console.log(`[UAZAPI_WEBHOOK] ✅ LID resolved via wa_fastid: ${remoteJidRaw}`);
            }
          }

          // Try 3: chat.phone if it's a real phone number (not LID)
          if (!resolvedFromLid && chat.phone) {
            const cleanChatPhone = String(chat.phone).replace(/\D/g, "");
            if (cleanChatPhone.length >= 10 && !String(chat.phone).includes("@lid")) {
              remoteJidRaw = `${cleanChatPhone}@s.whatsapp.net`;
              resolvedFromLid = true;
              console.log(`[UAZAPI_WEBHOOK] ✅ LID resolved via chat.phone: ${remoteJidRaw}`);
            }
          }

          // Try 4: msg.participant or msg.key.participant (for individual chats, this is the real JID)
          if (!resolvedFromLid) {
            const participant = msg.participant || msg.key?.participant || "";
            if (participant && String(participant).includes("@s.whatsapp.net")) {
              remoteJidRaw = participant;
              resolvedFromLid = true;
              console.log(`[UAZAPI_WEBHOOK] ✅ LID resolved via participant: ${remoteJidRaw}`);
            }
          }

          // If still unresolved, log and SKIP (like evolution-webhook does)
          if (!resolvedFromLid) {
            console.warn(`[UAZAPI_WEBHOOK] ⚠️ BLOCK LID: Could not resolve ${remoteJidRaw} to real JID. Skipping message.`, {
              "chat.wa_chatid": chat.wa_chatid,
              "chat.wa_fastid": chat.wa_fastid,
              "chat.phone": chat.phone,
              "msg.participant": msg.participant,
            });
            break;
          }
        }

        // Robust group filtering: multiple checks
        const isGroup = String(remoteJidRaw).includes("@g.us") 
          || chat.isGroup === true 
          || (chat as any).isGroup === true
          || (body as any).isGroup === true;
        if (isGroup) {
          console.log("[UAZAPI_WEBHOOK] Skipping group message (robust check)");
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
        let conversationFoundVia = "";

        // Step 1: Exact match by remote_jid + instance
        const { data: existingConv } = await supabaseClient
          .from("conversations")
          .select("id, remote_jid")
          .eq("law_firm_id", lawFirmId)
          .eq("remote_jid", remoteJid)
          .eq("whatsapp_instance_id", instance.id)
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
          conversationFoundVia = "exact_jid_instance";
        }

        // Step 2: Fallback — search by contact_phone + instance
        if (!conversationId && phoneNumber && phoneNumber.length >= 10) {
          const { data: phoneConv } = await supabaseClient
            .from("conversations")
            .select("id, remote_jid, whatsapp_instance_id, client_id")
            .eq("law_firm_id", lawFirmId)
            .eq("contact_phone", phoneNumber)
            .eq("whatsapp_instance_id", instance.id)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (phoneConv) {
            conversationId = phoneConv.id;
            conversationFoundVia = "phone_instance";
            console.log(`[UAZAPI_WEBHOOK] 📱 Found conversation via phone+instance: ${phoneConv.id} (old jid: ${phoneConv.remote_jid}, new: ${remoteJid})`);
            
            // Sync remote_jid if different
            if (phoneConv.remote_jid !== remoteJid) {
              await supabaseClient
                .from("conversations")
                .update({ remote_jid: remoteJid, updated_at: new Date().toISOString() })
                .eq("id", phoneConv.id);
              console.log(`[UAZAPI_WEBHOOK] 🔄 Updated remote_jid: ${phoneConv.remote_jid} → ${remoteJid}`);
            }
          }
        }

        // Step 3: Orphan by remote_jid (ONLY truly orphan conversations with NO instance)
        if (!conversationId) {
          const { data: orphanConv } = await supabaseClient
            .from("conversations")
            .select("id, whatsapp_instance_id, client_id, remote_jid")
            .eq("law_firm_id", lawFirmId)
            .eq("remote_jid", remoteJid)
            .is("whatsapp_instance_id", null)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (orphanConv) {
            conversationId = orphanConv.id;
            conversationFoundVia = "orphan_jid";
            console.log(`[UAZAPI_WEBHOOK] Found truly orphan conversation ${orphanConv.id} (no instance), assigning to ${instance.id}`);
            
            await supabaseClient
              .from("conversations")
              .update({
                whatsapp_instance_id: instance.id,
                last_whatsapp_instance_id: orphanConv.whatsapp_instance_id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", orphanConv.id);
          }
        }

        // Step 4: Orphan by contact_phone (ONLY truly orphan conversations with NO instance)
        if (!conversationId && phoneNumber && phoneNumber.length >= 10) {
          const { data: phoneOrphan } = await supabaseClient
            .from("conversations")
            .select("id, whatsapp_instance_id, client_id, remote_jid")
            .eq("law_firm_id", lawFirmId)
            .eq("contact_phone", phoneNumber)
            .is("whatsapp_instance_id", null)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (phoneOrphan) {
            conversationId = phoneOrphan.id;
            conversationFoundVia = "orphan_phone";
            console.log(`[UAZAPI_WEBHOOK] 📱 Found truly orphan via phone ${phoneNumber}: ${phoneOrphan.id} (no instance), assigning to ${instance.id}`);
            
            await supabaseClient
              .from("conversations")
              .update({
                whatsapp_instance_id: instance.id,
                last_whatsapp_instance_id: phoneOrphan.whatsapp_instance_id,
                remote_jid: remoteJid,
                updated_at: new Date().toISOString(),
              })
              .eq("id", phoneOrphan.id);
          }
        }

        // Step 5: Create new conversation
        if (!conversationId) {
          conversationFoundVia = "created_new";
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
              origin: "WHATSAPP", // may be overridden to whatsapp_ctwa after ad detection
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

        // ---- CTWA AD DETECTION (externalAdReply) ----
        const externalAdReply =
          msg.contextInfo?.externalAdReply ||
          msg.message?.extendedTextMessage?.contextInfo?.externalAdReply ||
          msg.message?.imageMessage?.contextInfo?.externalAdReply ||
          msg.message?.videoMessage?.contextInfo?.externalAdReply ||
          msg.message?.buttonsResponseMessage?.contextInfo?.externalAdReply ||
          msg.content?.contextInfo?.externalAdReply ||
          null;

        const isCtwaAd = !!externalAdReply && !isFromMe;
        if (isCtwaAd) {
          console.log(`[UAZAPI_WEBHOOK] 📢 CTWA ad detected for ${remoteJid}:`, JSON.stringify(externalAdReply).slice(0, 300));
        }

        console.log(`[UAZAPI_WEBHOOK] Conversation resolved: ${conversationId} (via: ${conversationFoundVia})`);

        if (!conversationId) {
          console.error("[UAZAPI_WEBHOOK] Could not resolve conversation");
          break;
        }

        // ---- FIND OR CREATE CLIENT ----
        let resolvedClientId: string | null = null;
        if (!isFromMe) {
          const normalizedPhone = phoneNumber.replace(/\D/g, "");
          // FIXED: Filter by whatsapp_instance_id to prevent cross-instance client sharing
          const { data: existingClient } = await supabaseClient
            .from("clients")
            .select("id, avatar_url")
            .eq("law_firm_id", lawFirmId)
            .eq("whatsapp_instance_id", instance.id)
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
          if (resolvedClientId) {
            const clientHasAvatar = existingClient?.avatar_url;
            if (!clientHasAvatar) {
              if (chat.imagePreview && typeof chat.imagePreview === "string" && chat.imagePreview.startsWith("http")) {
                // Use imagePreview from payload
                persistProfilePicture(supabaseClient, resolvedClientId, lawFirmId, chat.imagePreview).catch(() => {});
              } else if (instance.api_url && instance.api_key) {
                // Fallback: fetch profile picture via uazapi API
                (async () => {
                  try {
                    const apiUrl = (instance.api_url as string).replace(/\/+$/, "");
                    const jid = `${phoneNumber}@s.whatsapp.net`;
                    
                    // Try POST /profile/image
                    let picRes = await fetch(`${apiUrl}/profile/image`, {
                      method: "POST",
                      headers: { token: instance.api_key as string, "Content-Type": "application/json" },
                      body: JSON.stringify({ jid }),
                    });
                    
                    // Fallback: try with number param
                    if (!picRes.ok) {
                      picRes = await fetch(`${apiUrl}/profile/image`, {
                        method: "POST",
                        headers: { token: instance.api_key as string, "Content-Type": "application/json" },
                        body: JSON.stringify({ number: phoneNumber }),
                      });
                    }
                    
                    if (picRes.ok) {
                      const picData = await picRes.json().catch(() => ({}));
                      const picUrl = picData?.profilePictureUrl || picData?.picture || picData?.url || picData?.imgUrl || picData?.image || null;
                      if (typeof picUrl === "string" && picUrl.startsWith("http")) {
                        await persistProfilePicture(supabaseClient, resolvedClientId!, lawFirmId, picUrl);
                      }
                    }
                  } catch (e) {
                    console.warn("[UAZAPI_WEBHOOK] Auto-fetch profile picture failed:", e);
                  }
                })();
              }
            }
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

        // ---- AUTO-UNARCHIVE if conversation is archived and message is incoming ----
        if (!isFromMe) {
          const { data: convState } = await supabaseClient
            .from("conversations")
            .select("archived_at, archived_reason, archived_next_responsible_type, archived_next_responsible_id, current_handler, current_automation_id, assigned_to")
            .eq("id", conversationId)
            .single();

          if (convState?.archived_at) {
            console.log(`[UAZAPI_WEBHOOK] 📦 Unarchiving conversation ${conversationId}`);
            convUpdate.archived_at = null;
            convUpdate.archived_reason = null;

            // Restore handler based on archived_next_responsible
            if (convState.archived_next_responsible_type === 'ai' && convState.archived_next_responsible_id) {
              convUpdate.current_handler = 'ai';
              convUpdate.current_automation_id = convState.archived_next_responsible_id;
              convUpdate.assigned_to = null;
            } else if (convState.archived_next_responsible_type === 'human' && convState.archived_next_responsible_id) {
              convUpdate.current_handler = 'human';
              convUpdate.assigned_to = convState.archived_next_responsible_id;
              convUpdate.current_automation_id = null;
            } else {
              // Use instance defaults
              if (instance.default_automation_id) {
                convUpdate.current_handler = 'ai';
                convUpdate.current_automation_id = instance.default_automation_id;
                convUpdate.assigned_to = null;
              } else if (instance.default_assigned_to) {
                convUpdate.current_handler = 'human';
                convUpdate.assigned_to = instance.default_assigned_to;
                convUpdate.current_automation_id = null;
              } else {
                convUpdate.current_handler = 'human';
                convUpdate.assigned_to = null;
                convUpdate.current_automation_id = null;
              }
            }

            // Clear archived metadata
            convUpdate.archived_next_responsible_type = null;
            convUpdate.archived_next_responsible_id = null;
            convUpdate.archived_by = null;
          }
        }
        
        // ---- CTWA AD: set origin on conversation (new or existing) ----
        if (isCtwaAd) {
          convUpdate.origin = "whatsapp_ctwa";
          convUpdate.origin_metadata = {
            ad_title: externalAdReply.title || null,
            ad_body: externalAdReply.body || null,
            ad_thumbnail: externalAdReply.thumbnailUrl || externalAdReply.thumbnail || null,
            ad_media_url: externalAdReply.mediaUrl || null,
            ad_source_id: externalAdReply.sourceId || null,
            ad_source_url: externalAdReply.sourceUrl || null,
            ad_source_type: externalAdReply.sourceType || null,
            detected_at: new Date().toISOString(),
          };
        }

        await supabaseClient
          .from("conversations")
          .update(convUpdate)
          .eq("id", conversationId);

        console.log(`[UAZAPI_WEBHOOK] Message saved: ${whatsappMessageId} -> conversation ${conversationId}`);

        // ---- TRANSCRIBE AUDIO MESSAGES ----
        // If the incoming message is audio, transcribe it before AI processing
        let contentForAI = finalContent || "";
        if (messageType === "audio" && !isFromMe) {
          try {
            // Get the persisted media URL
            const persistedMediaUrl = messagePayload.media_url as string | null;
            if (persistedMediaUrl && (persistedMediaUrl.includes("supabase") || persistedMediaUrl.includes("/storage/v1/"))) {
              console.log("[UAZAPI_WEBHOOK] 🎤 Transcribing audio message...");
              
              // Download audio from our storage to get base64
              const audioResponse = await fetch(persistedMediaUrl);
              if (audioResponse.ok) {
                const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
                // Convert to base64
                let binary = "";
                for (let i = 0; i < audioBytes.byteLength; i++) {
                  binary += String.fromCharCode(audioBytes[i]);
                }
                const audioBase64 = btoa(binary);
                
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                const transcribeResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceKey}`,
                  },
                  body: JSON.stringify({
                    audioBase64: audioBase64,
                    mimeType: (messagePayload.media_mime_type as string) || "audio/ogg",
                  }),
                });
                
                if (transcribeResponse.ok) {
                  const transcribeResult = await transcribeResponse.json();
                  if (transcribeResult.transcription) {
                    contentForAI = `[Áudio transcrito]: ${transcribeResult.transcription}`;
                    console.log(`[UAZAPI_WEBHOOK] ✅ Audio transcribed: ${transcribeResult.transcription.length} chars`);
                    
                    // Update the message content in DB with the transcription
                    await supabaseClient
                      .from("messages")
                      .update({ content: contentForAI })
                      .eq("whatsapp_message_id", whatsappMessageId)
                      .eq("conversation_id", conversationId);
                  }
                } else {
                  console.warn("[UAZAPI_WEBHOOK] Transcription failed:", transcribeResponse.status);
                }
              }
            } else if (!persistedMediaUrl) {
              // Try downloading audio via uazapi /message/download to get base64
              console.log("[UAZAPI_WEBHOOK] 🎤 No persisted URL, trying /message/download for transcription...");
              const apiUrl = (instance.api_url || "").replace(/\/+$/, "");
              const apiKey = instance.api_key || "";
              if (apiUrl && apiKey) {
                const dlRes = await fetch(`${apiUrl}/message/download`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", token: apiKey },
                  body: JSON.stringify({ id: whatsappMessageId, return_base64: true }),
                });
                if (dlRes.ok) {
                  const dlData = await dlRes.json();
                  const dlBase64 = dlData.base64Data || dlData.base64;
                  if (dlBase64) {
                    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                    const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                      body: JSON.stringify({ audioBase64: dlBase64, mimeType: mimeType || "audio/ogg" }),
                    });
                    if (transcribeRes.ok) {
                      const tResult = await transcribeRes.json();
                      if (tResult.transcription) {
                        contentForAI = `[Áudio transcrito]: ${tResult.transcription}`;
                        console.log(`[UAZAPI_WEBHOOK] ✅ Audio transcribed (fallback): ${tResult.transcription.length} chars`);
                        await supabaseClient
                          .from("messages")
                          .update({ content: contentForAI })
                          .eq("whatsapp_message_id", whatsappMessageId)
                          .eq("conversation_id", conversationId);
                      }
                    }
                  }
                }
              }
            }
          } catch (transcribeErr) {
            console.warn("[UAZAPI_WEBHOOK] Audio transcription error (non-blocking):", transcribeErr);
          }
        }

        // ---- AUDIO MODE STATE MACHINE (ported from evolution-webhook) ----
        function isAudioRequestedFromText(userText: string): boolean {
          if (!userText) return false;
          const t = userText.toLowerCase();
          const explicitAudioPatterns: RegExp[] = [
            /(manda|envia|responde|responda|responder).{0,40}(áudio|audio|mensagem de voz|voz)/i,
            /(áudio|audio|mensagem de voz|voz).{0,40}(manda|envia|responde|responda|responder)/i,
            /por\s+(áudio|audio)/i,
            /em\s+(áudio|audio)/i,
            /em\s+voz/i,
            /pode\s+(falar|responder|mandar).{0,20}(áudio|audio|voz)/i,
            /prefiro\s+(áudio|audio|voz)/i,
          ];
          const readingDifficultyPatterns: RegExp[] = [
            /n[aã]o\s+(sei|consigo)\s+ler/i,
            /dificuldade\s+(de|para|em)\s+ler/i,
            /n[aã]o\s+leio\s+bem/i,
            /problema\s+(de|para|com)\s+(leitura|ler)/i,
            /n[aã]o\s+enxergo\s+bem/i,
            /tenho\s+dificuldade\s+(visual|de\s+vis[aã]o)/i,
          ];
          return explicitAudioPatterns.some((p) => p.test(t)) || readingDifficultyPatterns.some((p) => p.test(t));
        }

        function isAudioDeactivationRequest(userText: string): boolean {
          if (!userText) return false;
          const deactivationPatterns: RegExp[] = [
            /n[aã]o\s+(manda|envia|responde).{0,20}(áudio|audio|voz)/i,
            /sem\s+(áudio|audio|voz)/i,
            /(pode|responde|responda|responder)\s+(por|em|com)?\s*texto/i,
            /prefiro\s+texto/i,
            /para\s+(com|de)\s+(áudio|audio|voz)/i,
            /volta\s+(pro|para\s+o?)?\s*texto/i,
            /só\s+texto/i,
            /desativa\s+(o)?\s*(áudio|audio|voz)/i,
            /n[aã]o\s+precis[ao]\s+(de)?\s*(áudio|audio|voz)/i,
          ];
          return deactivationPatterns.some((p) => p.test(userText.toLowerCase()));
        }

        async function updateAudioModeState(
          client: any, convId: string, enabled: boolean,
          reason: 'user_request' | 'text_message_received' | 'manual_toggle' | 'accessibility_need'
        ): Promise<boolean> {
          try {
            const now = new Date().toISOString();
            const updateData: any = { ai_audio_enabled: enabled, ai_audio_enabled_by: reason };
            if (enabled) { updateData.ai_audio_last_enabled_at = now; } else { updateData.ai_audio_last_disabled_at = now; }
            const { error } = await client.from('conversations').update(updateData).eq('id', convId);
            if (error) { console.warn("[UAZAPI_WEBHOOK] Failed to update audio state:", error); return false; }
            console.log(`[UAZAPI_WEBHOOK] 🔊 Audio state updated: enabled=${enabled}, reason=${reason}, conv=${convId}`);
            return true;
          } catch (e) { console.warn("[UAZAPI_WEBHOOK] Error updating audio state:", e); return false; }
        }

        async function shouldRespondWithAudio(
          client: any, convId: string, currentMessageText: string, currentMsgType: string
        ): Promise<boolean> {
          try {
            const { data: conversation, error: convError } = await client
              .from('conversations').select('ai_audio_enabled, ai_audio_enabled_by').eq('id', convId).single();
            if (convError) { console.warn("[UAZAPI_WEBHOOK] Error loading audio state:", convError); return false; }
            const currentAudioEnabled = conversation?.ai_audio_enabled === true;
            console.log(`[UAZAPI_WEBHOOK] 🔊 Audio state from DB: enabled=${currentAudioEnabled}, by=${conversation?.ai_audio_enabled_by}`);

            if (isAudioDeactivationRequest(currentMessageText)) {
              console.log("[UAZAPI_WEBHOOK] 🔊 Client requested to DISABLE audio");
              await updateAudioModeState(client, convId, false, 'user_request');
              return false;
            }
            if (isAudioRequestedFromText(currentMessageText)) {
              console.log("[UAZAPI_WEBHOOK] 🔊 Client requested to ENABLE audio");
              await updateAudioModeState(client, convId, true, 'user_request');
              return true;
            }
            if (currentAudioEnabled && currentMsgType === 'text') {
              console.log("[UAZAPI_WEBHOOK] 🔊 Audio was enabled but client sent TEXT - auto-disabling");
              await updateAudioModeState(client, convId, false, 'text_message_received');
              return false;
            }
            if (currentAudioEnabled && currentMsgType === 'audio') {
              console.log("[UAZAPI_WEBHOOK] 🔊 Audio mode active, client sent audio - keeping");
              return true;
            }
            return currentAudioEnabled;
          } catch (e) { console.warn("[UAZAPI_WEBHOOK] Error in shouldRespondWithAudio:", e); return false; }
        }

        // ---- TRIGGER AI PROCESSING ----
        // Use contentForAI (which has transcription for audio) instead of raw content
        if (!isFromMe && (contentForAI || (messageType === "audio"))) {
          const { data: conv } = await supabaseClient
            .from("conversations")
            .select("current_handler, current_automation_id, ai_audio_enabled")
            .eq("id", conversationId)
            .single();

          if (conv?.current_handler === "ai" && conv?.current_automation_id) {
            console.log("[UAZAPI_WEBHOOK] Triggering AI processing for conversation:", conversationId, "message:", contentForAI?.substring(0, 50));
            
            // Fetch automation name for ai_agent_name
            let automationName: string | null = null;
            try {
              const { data: automation } = await supabaseClient
                .from("automations")
                .select("name")
                .eq("id", conv.current_automation_id)
                .single();
              automationName = automation?.name || null;
            } catch (e) {
              console.warn("[UAZAPI_WEBHOOK] Failed to fetch automation name:", e);
            }
            
            // ---- PRE-DETECT AUDIO MODE (before AI call so context is passed) ----
            const audioRequestedForThisMessage = await shouldRespondWithAudio(
              supabaseClient, conversationId, contentForAI || '', messageType
            );
            if (audioRequestedForThisMessage) {
              console.log("[UAZAPI_WEBHOOK] 🔊 Audio mode pre-detected, will pass audioRequested=true to ai-chat");
            }

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
                  message: contentForAI,
                  automationId: conv.current_automation_id,
                  source: "whatsapp",
                  context: {
                    clientName: contactName,
                    clientPhone: phoneNumber,
                    lawFirmId,
                    clientId: resolvedClientId,
                    skipSaveUserMessage: true,
                    skipSaveAIResponse: true,
                    audioRequested: audioRequestedForThisMessage,
                  },
                }),
              });

              if (aiResponse.ok) {
                const result = await aiResponse.json();
                let aiText = result.response;
                console.log("[UAZAPI_WEBHOOK] AI response received:", aiText?.substring(0, 80));

                // ---- Process AI audio commands (@Ativar áudio / @Desativar áudio) ----
                if (aiText) {
                  let shouldEnableAudio = false;
                  let shouldDisableAudio = false;

                  const enablePattern = /@[Aa]tivar\s*[aáAÁ]udio/g;
                  if (enablePattern.test(aiText)) {
                    shouldEnableAudio = true;
                    aiText = aiText.replace(/@[Aa]tivar\s*[aáAÁ]udio/gi, '');
                    console.log("[UAZAPI_WEBHOOK] 🔊 Detected @Ativar áudio command in AI response");
                  }

                  const disablePattern = /@[Dd]esativar\s*[aáAÁ]udio/g;
                  if (disablePattern.test(aiText)) {
                    shouldDisableAudio = true;
                    aiText = aiText.replace(/@[Dd]esativar\s*[aáAÁ]udio/gi, '');
                    console.log("[UAZAPI_WEBHOOK] 🔊 Detected @Desativar áudio command in AI response");
                  }

                  aiText = aiText.replace(/\n{3,}/g, '\n\n').trim();

                  if (shouldEnableAudio) {
                    await updateAudioModeState(supabaseClient, conversationId, true, 'user_request');
                  }
                  if (shouldDisableAudio) {
                    await updateAudioModeState(supabaseClient, conversationId, false, 'user_request');
                  }
                }

                if (aiText && instance.api_url && instance.api_key) {
                  const apiUrl = instance.api_url.replace(/\/+$/, "");
                  const targetNumber = remoteJid.replace("@s.whatsapp.net", "");

                  // ---- CHECK IF AUDIO RESPONSE IS ENABLED (already pre-computed) ----
                  const audioEnabled = audioRequestedForThisMessage;
                  let sentAsAudio = false;

                  if (audioEnabled) {
                    try {
                      console.log("[UAZAPI_WEBHOOK] 🔊 Audio mode enabled, generating TTS...");
                      
                      // Resolve voice config: agent → company → default
                      let voiceId = "el_laura"; // default
                      let voiceSource = "default";
                      
                      // Check agent-level voice config
                      const { data: automation } = await supabaseClient
                        .from("automations")
                        .select("ai_voice_id")
                        .eq("id", conv.current_automation_id)
                        .single();
                      
                      if (automation?.ai_voice_id) {
                        voiceId = automation.ai_voice_id;
                        voiceSource = "agent";
                      } else {
                        // Check company-level voice config
                        const { data: settings } = await supabaseClient
                          .from("law_firm_settings")
                          .select("ai_voice_id, ai_voice_enabled")
                          .eq("law_firm_id", lawFirmId)
                          .maybeSingle();
                        
                        if (settings?.ai_voice_id) {
                          voiceId = settings.ai_voice_id;
                          voiceSource = "company";
                        }
                      }
                      
                      // Generate TTS audio via ai-text-to-speech
                      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                      
                      // Split text into chunks for TTS (max 3500 chars)
                      const ttsChunks: string[] = [];
                      const fullText = aiText.trim();
                      if (fullText.length <= 3500) {
                        ttsChunks.push(fullText);
                      } else {
                        // Split by paragraphs, merge into chunks ≤3500
                        const paragraphs = fullText.split(/\n\n+/).filter((p: string) => p.trim());
                        let current = "";
                        for (const p of paragraphs) {
                          if (current && current.length + p.length > 3500) {
                            ttsChunks.push(current.trim());
                            current = p;
                          } else {
                            current = current ? `${current}\n\n${p}` : p;
                          }
                        }
                        if (current.trim()) ttsChunks.push(current.trim());
                      }
                      
                      const CHARS_PER_SECOND = 12.5;
                      const billingPeriod = (() => {
                        const now = new Date();
                        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                      })();
                      
                      for (let ci = 0; ci < ttsChunks.length; ci++) {
                        const chunkText = ttsChunks[ci];
                        
                        // Delay between chunks
                        if (ci > 0) {
                          await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
                        }
                        
                        const ttsResponse = await fetch(`${supabaseUrl}/functions/v1/ai-text-to-speech`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${serviceKey}`,
                          },
                          body: JSON.stringify({
                            text: chunkText.substring(0, 3900),
                            voiceId: voiceId,
                            lawFirmId: lawFirmId,
                            skipUsageTracking: true,
                          }),
                        });
                        
                        if (ttsResponse.ok) {
                          const ttsData = await ttsResponse.json();
                          if (ttsData.success && ttsData.audioContent) {
                            // Use correct MIME type from TTS response (ElevenLabs returns OGG/Opus)
                            const audioMime = (ttsData.mimeType || "audio/mpeg").split(";")[0].trim();
                            console.log("[UAZAPI_WEBHOOK] TTS audio MIME:", audioMime, "contentLen:", ttsData.audioContent?.length);
                            
                            // Send audio via uazapi /send/media (PTT) - correct endpoint per UAZAPi docs
                            const audioSendRes = await fetch(`${apiUrl}/send/media`, {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                token: instance.api_key,
                              },
                              body: JSON.stringify({
                                number: targetNumber,
                                type: "ptt",
                                file: `data:${audioMime};base64,${ttsData.audioContent}`,
                                mimetype: audioMime,
                              }),
                            });
                            
                            console.log("[UAZAPI_WEBHOOK] /send/media (ptt) response:", { status: audioSendRes.status, ok: audioSendRes.ok });
                            let audioSendData = await audioSendRes.json().catch(() => ({}));
                            console.log("[UAZAPI_WEBHOOK] /send/media (ptt) data:", JSON.stringify(audioSendData).slice(0, 500));
                            
                            // Fallback: if ptt failed, retry with type "audio"
                            if (!audioSendRes.ok) {
                              console.log("[UAZAPI_WEBHOOK] /send/media (ptt) failed, retrying with type audio...");
                              const retryRes = await fetch(`${apiUrl}/send/media`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  token: instance.api_key,
                                },
                                body: JSON.stringify({
                                  number: targetNumber,
                                  type: "audio",
                                  file: `data:${audioMime};base64,${ttsData.audioContent}`,
                                  mimetype: audioMime,
                                }),
                              });
                              console.log("[UAZAPI_WEBHOOK] /send/media (audio) retry response:", { status: retryRes.status, ok: retryRes.ok });
                              const retryData = await retryRes.json().catch(() => ({}));
                              console.log("[UAZAPI_WEBHOOK] /send/media (audio) retry data:", JSON.stringify(retryData).slice(0, 500));
                              if (retryRes.ok) {
                                audioSendData = retryData;
                              }
                            }
                            
                            const audioMsgId = audioSendData?.key?.id || audioSendData?.id || crypto.randomUUID();
                            
                            // Persist audio to storage (using safe base64 decoding)
                            let audioStorageUrl: string | null = null;
                            try {
                              // Safe base64 decode using Uint8Array (avoids atob stack overflow on large strings)
                              const raw = ttsData.audioContent as string;
                              const binaryStr = atob(raw);
                              const audioBytes = new Uint8Array(binaryStr.length);
                              for (let j = 0; j < binaryStr.length; j++) {
                                audioBytes[j] = binaryStr.charCodeAt(j);
                              }
                              const isOgg = (ttsData.mimeType || "").includes("ogg");
                              const ext = isOgg ? ".ogg" : ".mp3";
                              const storagePath = `${lawFirmId}/ai-audio/${audioMsgId}${ext}`;
                              
                              const { error: uploadErr } = await supabaseClient.storage
                                .from("chat-media")
                                .upload(storagePath, audioBytes, {
                                  contentType: isOgg ? "audio/ogg" : "audio/mpeg",
                                  cacheControl: "31536000",
                                  upsert: true,
                                });
                              
                              if (!uploadErr) {
                                const { data: urlData } = await supabaseClient.storage
                                  .from("chat-media")
                                  .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
                                audioStorageUrl = urlData?.signedUrl || null;
                                
                                // Fallback to public URL if signed URL fails
                                if (!audioStorageUrl) {
                                  const { data: publicData } = supabaseClient.storage
                                    .from("chat-media")
                                    .getPublicUrl(storagePath);
                                  audioStorageUrl = publicData?.publicUrl || null;
                                  console.log("[UAZAPI_WEBHOOK] Using public URL fallback for audio:", !!audioStorageUrl);
                                }
                              } else {
                                console.error("[UAZAPI_WEBHOOK] Audio upload error:", uploadErr.message, "path:", storagePath, "size:", audioBytes.length);
                              }
                            } catch (storageErr) {
                              console.error("[UAZAPI_WEBHOOK] Audio storage EXCEPTION:", storageErr instanceof Error ? storageErr.message : storageErr, "audioContentLen:", ttsData.audioContent?.length);
                            }
                            
                            // Save audio message to DB
                            const isOgg = (ttsData.mimeType || "").includes("ogg");
                            await supabaseClient.from("messages").insert({
                              conversation_id: conversationId,
                              whatsapp_message_id: audioMsgId,
                              content: chunkText,
                              message_type: "audio",
                              is_from_me: true,
                              sender_type: "system",
                              ai_generated: true,
                              media_mime_type: isOgg ? "audio/ogg" : "audio/mpeg",
                              media_url: audioStorageUrl,
                              law_firm_id: lawFirmId,
                              ai_agent_id: conv.current_automation_id,
                              ai_agent_name: automationName,
                            });
                            
                            // Record TTS usage for billing
                            const durationSeconds = Math.ceil(chunkText.length / CHARS_PER_SECOND);
                            await supabaseClient.from("usage_records").insert({
                              law_firm_id: lawFirmId,
                              usage_type: "tts_audio",
                              count: 1,
                              duration_seconds: durationSeconds,
                              billing_period: billingPeriod,
                              metadata: {
                                conversation_id: conversationId,
                                text_length: chunkText.length,
                                voice_id: voiceId,
                                voice_source: voiceSource,
                                provider: "uazapi",
                                generated_at: new Date().toISOString(),
                              },
                            });
                            
                            sentAsAudio = true;
                            console.log(`[UAZAPI_WEBHOOK] 🔊 Audio chunk ${ci + 1}/${ttsChunks.length} sent, id: ${audioMsgId}`);
                          } else {
                            console.warn("[UAZAPI_WEBHOOK] TTS generation failed, falling back to text");
                          }
                        } else {
                          console.warn("[UAZAPI_WEBHOOK] TTS endpoint error:", ttsResponse.status);
                        }
                      }
                    } catch (ttsErr) {
                      console.warn("[UAZAPI_WEBHOOK] TTS processing error (falling back to text):", ttsErr);
                    }
                  }

                  // ---- SEND AS TEXT (default or fallback) ----
                  if (!sentAsAudio) {
                    // Use responseParts from ai-chat if available (smarter split by paragraphs/sentences)
                    // Fallback: split manually if text > 400 chars
                    const MAX_PARTS = 5;
                    let parts: string[] = [];
                    
                    if (result.responseParts && Array.isArray(result.responseParts) && result.responseParts.length > 1) {
                      parts = result.responseParts.filter((p: string) => p && p.trim()).slice(0, MAX_PARTS);
                    } else if (aiText.length > 400) {
                      const rawParts = aiText.split(/\n\n+/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
                      if (rawParts.length > 1) {
                        let current = "";
                        for (const part of rawParts) {
                          if (current && (current.length + part.length > 500 || parts.length >= MAX_PARTS - 1)) {
                            parts.push(current.trim());
                            current = part;
                          } else {
                            current = current ? `${current}\n\n${part}` : part;
                          }
                        }
                        if (current.trim()) parts.push(current.trim());
                        if (parts.length > MAX_PARTS) parts = parts.slice(0, MAX_PARTS);
                      } else {
                        parts = [aiText];
                      }
                    } else {
                      parts = [aiText];
                    }

                    const allMsgIds: string[] = [];

                    for (let i = 0; i < parts.length; i++) {
                      if (i > 0) {
                        const delay = 1000 + Math.random() * 2000;
                        await new Promise(r => setTimeout(r, delay));
                      }

                      const sendRes = await fetch(`${apiUrl}/send/text`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          token: instance.api_key,
                        },
                        body: JSON.stringify({ number: targetNumber, text: parts[i] }),
                      });

                      const sendData = await sendRes.json().catch(() => ({}));
                      const msgId = sendData?.key?.id || sendData?.id || crypto.randomUUID();
                      allMsgIds.push(msgId);
                    }

                    console.log(`[UAZAPI_WEBHOOK] AI response sent in ${parts.length} part(s), ids:`, allMsgIds);

                    // Save full AI message to database
                    await supabaseClient.from("messages").insert({
                      conversation_id: conversationId,
                      whatsapp_message_id: allMsgIds[0],
                      content: aiText,
                      message_type: "text",
                      is_from_me: true,
                      sender_type: "ai",
                      ai_generated: true,
                      law_firm_id: lawFirmId,
                      ai_agent_id: conv.current_automation_id,
                      ai_agent_name: automationName,
                    });
                  }

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
