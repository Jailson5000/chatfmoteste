import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { humanDelay, messageSplitDelay, DELAY_CONFIG } from "../_shared/human-delay.ts";

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

// =============================================================================
// MESSAGE DEBOUNCE QUEUE - Batches messages before AI processing
// =============================================================================

async function queueMessageForAIProcessing(
  supabaseClient: any,
  context: {
    conversationId: string; lawFirmId: string; messageContent: string; messageType: string;
    contactName: string; contactPhone: string; remoteJid: string; instanceId: string;
    instanceName: string; clientId?: string; audioRequested: boolean; automationId: string;
    automationName: string | null; agentResponseDelayMs: number; apiUrl: string; apiKey: string;
  },
  debounceSeconds: number,
  requestId: string
): Promise<void> {
  const processAfter = new Date(Date.now() + debounceSeconds * 1000).toISOString();
  const messageData = { content: context.messageContent, type: context.messageType, timestamp: new Date().toISOString() };

  console.log(`[UAZAPI_DEBOUNCE] [${requestId}] Queueing message, debounce=${debounceSeconds}s`);

  const metadataPayload = {
    contact_name: context.contactName, contact_phone: context.contactPhone, remote_jid: context.remoteJid,
    instance_id: context.instanceId, instance_name: context.instanceName, client_id: context.clientId,
    audio_requested: context.audioRequested, automation_id: context.automationId, automation_name: context.automationName,
    agent_response_delay_ms: context.agentResponseDelayMs, api_url: context.apiUrl, api_key: context.apiKey, provider: 'uazapi',
  };

  const { data: existingQueue, error: fetchError } = await supabaseClient
    .from('ai_processing_queue').select('id, messages, message_count, metadata')
    .eq('conversation_id', context.conversationId).eq('status', 'pending').maybeSingle();

  if (existingQueue) {
    const updatedMessages = [...(existingQueue.messages || []), messageData];
    await supabaseClient.from('ai_processing_queue').update({
      messages: updatedMessages, message_count: existingQueue.message_count + 1,
      last_message_at: new Date().toISOString(), process_after: processAfter,
      metadata: { ...(existingQueue.metadata as Record<string, any> || {}), ...metadataPayload,
        audio_requested: context.audioRequested || !!(existingQueue.metadata as any)?.audio_requested },
    }).eq('id', existingQueue.id);
    console.log(`[UAZAPI_DEBOUNCE] [${requestId}] Added to existing queue (${updatedMessages.length} msgs)`);
  } else {
    const { data: processingItem } = await supabaseClient.from('ai_processing_queue').select('id')
      .eq('conversation_id', context.conversationId).eq('status', 'processing').maybeSingle();
    let effectiveProcessAfter = processAfter;
    if (processingItem) {
      effectiveProcessAfter = new Date(Date.now() + Math.max(debounceSeconds, 15) * 1000).toISOString();
    }

    const { error: insertError } = await supabaseClient.from('ai_processing_queue').insert({
      conversation_id: context.conversationId, law_firm_id: context.lawFirmId,
      messages: [messageData], message_count: 1, process_after: effectiveProcessAfter, metadata: metadataPayload,
    }).select('id').single();

    if (insertError?.code === '23505') {
      const { data: ep } = await supabaseClient.from('ai_processing_queue').select('id, messages, message_count')
        .eq('conversation_id', context.conversationId).eq('status', 'pending').maybeSingle();
      if (ep) {
        const msgs = Array.isArray(ep.messages) ? ep.messages : [];
        await supabaseClient.from('ai_processing_queue').update({
          messages: [...msgs, messageData], message_count: msgs.length + 1,
          last_message_at: new Date().toISOString(), process_after: effectiveProcessAfter,
        }).eq('id', ep.id);
      }
    } else if (!insertError) {
      console.log(`[UAZAPI_DEBOUNCE] [${requestId}] Created new queue item`);
    }
  }

  scheduleUazapiQueueProcessing(supabaseClient, context.conversationId, debounceSeconds, requestId);
}

function scheduleUazapiQueueProcessing(supabaseClient: any, conversationId: string, _ds: number, requestId: string): void {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const runTask = async () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const { data: qi } = await supabaseClient.from('ai_processing_queue').select('id, process_after')
          .eq('conversation_id', conversationId).eq('status', 'pending').maybeSingle();
        if (!qi) return;
        const delayMs = Math.max(0, new Date(qi.process_after).getTime() - Date.now()) + 500;
        await sleep(delayMs);
        await processUazapiQueuedMessages(supabaseClient, conversationId, requestId);
      } catch (e) { await sleep(1000); }
    }
  };
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) { er.waitUntil(runTask()); return; }
  try { setTimeout(() => { void runTask(); }, 0); } catch (_) { /* noop */ }
}

async function processUazapiQueuedMessages(supabaseClient: any, conversationId: string, requestId: string): Promise<void> {
  const now = new Date().toISOString();

  await supabaseClient.from('ai_processing_queue').update({ status: 'failed', error_message: 'Timeout: stuck >2min', completed_at: now })
    .eq('conversation_id', conversationId).eq('status', 'processing').lt('processing_started_at', new Date(Date.now() - 120000).toISOString());

  const { data: lockedItem, error: lockError } = await supabaseClient.from('ai_processing_queue')
    .update({ status: 'processing', processing_started_at: now })
    .eq('conversation_id', conversationId).eq('status', 'pending').lte('process_after', now).select().maybeSingle();

  if (lockError || !lockedItem) return;

  const queueItem = lockedItem;
  console.log(`[UAZAPI_DEBOUNCE] [${requestId}] Processing ${queueItem.message_count} batched messages`);

  try {
    const messages = queueItem.messages as Array<{ content: string; type: string }>;
    let combinedContent = messages.length > 1 ? messages.map(m => m.content).join('\n\n') : messages[0]?.content || '';
    const metadata = queueItem.metadata as Record<string, any>;
    const lawFirmId = queueItem.law_firm_id;
    const automationId = metadata.automation_id;

    // ---- FALLBACK: Re-transcribe audio if content is still literal "[audio]" ----
    const hasOnlyLiteralAudio = combinedContent.trim() === '[audio]' || combinedContent.trim() === '[Áudio]';
    if (hasOnlyLiteralAudio) {
      console.warn(`[UAZAPI_DEBOUNCE] [${requestId}] ⚠️ Content is literal "[audio]" - attempting late transcription from DB`);
      try {
        // Find the audio message in DB — by now it should have media_url persisted
        const { data: audioMsgs } = await supabaseClient
          .from('messages')
          .select('media_url, media_mime_type, whatsapp_message_id')
          .eq('conversation_id', conversationId)
          .eq('message_type', 'audio')
          .eq('is_from_me', false)
          .order('created_at', { ascending: false })
          .limit(1);

        const audioMsg = audioMsgs?.[0];
        if (audioMsg?.media_url && (audioMsg.media_url.includes('supabase') || audioMsg.media_url.includes('/storage/v1/'))) {
          console.log(`[UAZAPI_DEBOUNCE] [${requestId}] Found persisted audio URL, transcribing...`);
          const audioResponse = await fetch(audioMsg.media_url);
          if (audioResponse.ok) {
            const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
            if (audioBytes.length > 100) {
              let binary = '';
              for (let i = 0; i < audioBytes.byteLength; i++) {
                binary += String.fromCharCode(audioBytes[i]);
              }
              const audioBase64 = btoa(binary);
              const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
              const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
              const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                body: JSON.stringify({ audioBase64, mimeType: audioMsg.media_mime_type || 'audio/ogg' }),
              });
              if (transcribeRes.ok) {
                const tResult = await transcribeRes.json();
                if (tResult.transcription) {
                  combinedContent = `[Áudio transcrito]: ${tResult.transcription}`;
                  console.log(`[UAZAPI_DEBOUNCE] [${requestId}] ✅ Late transcription succeeded: ${tResult.transcription.length} chars`);
                  // Update the message in DB too
                  await supabaseClient
                    .from('messages')
                    .update({ content: combinedContent })
                    .eq('whatsapp_message_id', audioMsg.whatsapp_message_id)
                    .eq('conversation_id', conversationId);
                }
              }
            }
          }
        } else {
          console.warn(`[UAZAPI_DEBOUNCE] [${requestId}] No persisted audio URL found in DB for late transcription`);
        }
      } catch (lateTranscribeErr) {
        console.warn(`[UAZAPI_DEBOUNCE] [${requestId}] Late transcription error:`, lateTranscribeErr);
      }
    }
    const automationName = metadata.automation_name;
    const agentResponseDelayMs = metadata.agent_response_delay_ms || 0;
    const audioRequested = !!metadata.audio_requested;
    const remoteJid = metadata.remote_jid || '';
    const apiUrl = (metadata.api_url || '').replace(/\/+$/, '');
    const apiKey = metadata.api_key || '';
    const targetNumber = remoteJid.replace('@s.whatsapp.net', '');

    if (!automationId || !apiUrl || !apiKey) {
      await supabaseClient.from('ai_processing_queue').update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Missing config' }).eq('id', queueItem.id);
      return;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ conversationId, message: combinedContent, automationId, source: 'whatsapp',
        context: { clientName: metadata.contact_name, clientPhone: metadata.contact_phone, lawFirmId,
          clientId: metadata.client_id, skipSaveUserMessage: true, skipSaveAIResponse: true, audioRequested } }),
    });

    if (!aiResponse.ok) { throw new Error(`AI chat returned ${aiResponse.status}`); }

    const result = await aiResponse.json();
    let aiText = result.response;

    if (aiText) {
      if (/@[Aa]tivar\s*[aáAÁ]udio/g.test(aiText)) {
        aiText = aiText.replace(/@[Aa]tivar\s*[aáAÁ]udio/gi, '');
        await supabaseClient.from('conversations').update({ ai_audio_enabled: true, ai_audio_enabled_by: 'user_request', ai_audio_last_enabled_at: new Date().toISOString() }).eq('id', conversationId);
      }
      if (/@[Dd]esativar\s*[aáAÁ]udio/g.test(aiText)) {
        aiText = aiText.replace(/@[Dd]esativar\s*[aáAÁ]udio/gi, '');
        await supabaseClient.from('conversations').update({ ai_audio_enabled: false, ai_audio_enabled_by: 'user_request', ai_audio_last_disabled_at: new Date().toISOString() }).eq('id', conversationId);
      }
      aiText = aiText.replace(/\n{3,}/g, '\n\n').trim();
    }

    if (aiText && apiUrl && apiKey) {
      let sentAsAudio = false;

      if (audioRequested) {
        try {
          let voiceId = 'el_laura'; let voiceSource = 'default';
          const { data: autom } = await supabaseClient.from('automations').select('ai_voice_id').eq('id', automationId).single();
          if (autom?.ai_voice_id) { voiceId = autom.ai_voice_id; voiceSource = 'agent'; }
          else { const { data: s } = await supabaseClient.from('law_firm_settings').select('ai_voice_id').eq('law_firm_id', lawFirmId).maybeSingle(); if (s?.ai_voice_id) { voiceId = s.ai_voice_id; voiceSource = 'company'; } }

          const ttsChunks: string[] = [];
          if (aiText.trim().length <= 3500) { ttsChunks.push(aiText.trim()); }
          else { const pars = aiText.trim().split(/\n\n+/).filter((p: string) => p.trim()); let cur = ''; for (const p of pars) { if (cur && cur.length + p.length > 3500) { ttsChunks.push(cur.trim()); cur = p; } else { cur = cur ? `${cur}\n\n${p}` : p; } } if (cur.trim()) ttsChunks.push(cur.trim()); }

          const CHARS_PER_SECOND = 12.5;
          const bp = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

          for (let ci = 0; ci < ttsChunks.length; ci++) {
            const chunk = ttsChunks[ci];
            if (ci === 0) await humanDelay(DELAY_CONFIG.AI_RESPONSE.min + agentResponseDelayMs, DELAY_CONFIG.AI_RESPONSE.max + agentResponseDelayMs, '[UAZAPI_TTS]');
            else await humanDelay(DELAY_CONFIG.AUDIO_CHUNK.min, DELAY_CONFIG.AUDIO_CHUNK.max, '[UAZAPI_TTS_CHUNK]');

            const ttsRes = await fetch(`${supabaseUrl}/functions/v1/ai-text-to-speech`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ text: chunk.substring(0, 3900), voiceId, lawFirmId, skipUsageTracking: true }) });
            if (ttsRes.ok) {
              const td = await ttsRes.json();
              if (td.success && td.audioContent) {
                const am = (td.mimeType || 'audio/mpeg').split(';')[0].trim();
                let sr = await fetch(`${apiUrl}/send/media`, { method: 'POST', headers: { 'Content-Type': 'application/json', token: apiKey }, body: JSON.stringify({ number: targetNumber, type: 'ptt', file: `data:${am};base64,${td.audioContent}`, mimetype: am }) });
                let sd = await sr.json().catch(() => ({}));
                if (!sr.ok) { const rr = await fetch(`${apiUrl}/send/media`, { method: 'POST', headers: { 'Content-Type': 'application/json', token: apiKey }, body: JSON.stringify({ number: targetNumber, type: 'audio', file: `data:${am};base64,${td.audioContent}`, mimetype: am }) }); if (rr.ok) sd = await rr.json().catch(() => ({})); }
                const mid = sd?.key?.id || sd?.id || crypto.randomUUID();

                let audioUrl: string | null = null;
                try {
                  const bs = atob(td.audioContent as string); const ab = new Uint8Array(bs.length); for (let j = 0; j < bs.length; j++) ab[j] = bs.charCodeAt(j);
                  const isOgg = (td.mimeType || '').includes('ogg'); const sp = `${lawFirmId}/ai-audio/${mid}${isOgg ? '.ogg' : '.mp3'}`;
                  const { error: ue } = await supabaseClient.storage.from('chat-media').upload(sp, ab, { contentType: isOgg ? 'audio/ogg' : 'audio/mpeg', cacheControl: '31536000', upsert: true });
                  if (!ue) { const { data: ud } = await supabaseClient.storage.from('chat-media').createSignedUrl(sp, 31536000); audioUrl = ud?.signedUrl || null; }
                } catch (_) {}

                const isOgg = (td.mimeType || '').includes('ogg');
                await supabaseClient.from('messages').insert({ conversation_id: conversationId, whatsapp_message_id: mid, content: chunk, message_type: 'audio', is_from_me: true, sender_type: 'system', ai_generated: true, media_mime_type: isOgg ? 'audio/ogg' : 'audio/mpeg', media_url: audioUrl, law_firm_id: lawFirmId, ai_agent_id: automationId, ai_agent_name: automationName });
                await supabaseClient.from('usage_records').insert({ law_firm_id: lawFirmId, usage_type: 'tts_audio', count: 1, duration_seconds: Math.ceil(chunk.length / CHARS_PER_SECOND), billing_period: bp, metadata: { conversation_id: conversationId, text_length: chunk.length, voice_id: voiceId, voice_source: voiceSource, provider: 'uazapi' } });
                sentAsAudio = true;
              }
            }
          }
        } catch (ttsErr) { console.warn('[UAZAPI_DEBOUNCE] TTS error:', ttsErr); }
      }

      if (!sentAsAudio) {
        const MAX_PARTS = 5; let parts: string[] = [];
        if (result.responseParts?.length > 1) { parts = result.responseParts.filter((p: string) => p?.trim()).slice(0, MAX_PARTS); }
        else if (aiText.length > 400) { const rp = aiText.split(/\n\n+/).map((p: string) => p.trim()).filter((p: string) => p); if (rp.length > 1) { let c = ''; for (const p of rp) { if (c && (c.length + p.length > 500 || parts.length >= MAX_PARTS - 1)) { parts.push(c.trim()); c = p; } else { c = c ? `${c}\n\n${p}` : p; } } if (c.trim()) parts.push(c.trim()); parts = parts.slice(0, MAX_PARTS); } else parts = [aiText]; }
        else parts = [aiText];

        const ids: string[] = [];
        for (let i = 0; i < parts.length; i++) {
          if (i === 0) await humanDelay(DELAY_CONFIG.AI_RESPONSE.min + agentResponseDelayMs, DELAY_CONFIG.AI_RESPONSE.max + agentResponseDelayMs, '[UAZAPI_AI]');
          else await messageSplitDelay(i, parts.length, '[UAZAPI_AI]');
          const r = await fetch(`${apiUrl}/send/text`, { method: 'POST', headers: { 'Content-Type': 'application/json', token: apiKey }, body: JSON.stringify({ number: targetNumber, text: parts[i] }) });
          const d = await r.json().catch(() => ({})); ids.push(d?.key?.id || d?.id || crypto.randomUUID());
        }
        await supabaseClient.from('messages').insert({ conversation_id: conversationId, whatsapp_message_id: ids[0], content: aiText, message_type: 'text', is_from_me: true, sender_type: 'ai', ai_generated: true, law_firm_id: lawFirmId, ai_agent_id: automationId, ai_agent_name: automationName });
      }

      await supabaseClient.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    }

    // Warning when AI returns empty response (helps diagnose audio transcription failures)
    if (!aiText) {
      console.warn(`[UAZAPI_DEBOUNCE] [${requestId}] ⚠️ AI returned empty response for conversation ${conversationId}. Content sent: "${combinedContent.substring(0, 100)}"`);
    }

    await supabaseClient.from('ai_processing_queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', queueItem.id);

    const { data: np } = await supabaseClient.from('ai_processing_queue').select('id, process_after').eq('conversation_id', conversationId).eq('status', 'pending').maybeSingle();
    if (np) {
      const w = Math.max(0, new Date(np.process_after).getTime() - Date.now());
      if (w > 0) await new Promise(r => setTimeout(r, w));
      await processUazapiQueuedMessages(supabaseClient, conversationId, requestId);
    }
  } catch (error) {
    console.error(`[UAZAPI_DEBOUNCE] [${requestId}] Error:`, error);
    await supabaseClient.from('ai_processing_queue').update({ status: 'failed', completed_at: new Date().toISOString(), error_message: error instanceof Error ? error.message : String(error) }).eq('id', queueItem.id);
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
        // Only update contact_name if no linked client exists (protects manual edits)
        const shouldUpdateContactName = !isFromMe && !resolvedClientId && contactName && contactName !== phoneNumber;
        if (shouldUpdateContactName) {
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
          // Helper to transcribe from a persisted URL
          async function transcribeFromUrl(url: string, mime: string): Promise<string | null> {
            try {
              const audioResponse = await fetch(url);
              if (!audioResponse.ok) return null;
              const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
              if (audioBytes.length < 100) return null;
              let binary = "";
              for (let i = 0; i < audioBytes.byteLength; i++) {
                binary += String.fromCharCode(audioBytes[i]);
              }
              const audioBase64 = btoa(binary);
              const sUrl = Deno.env.get("SUPABASE_URL") || "";
              const sKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
              const transcribeResponse = await fetch(`${sUrl}/functions/v1/transcribe-audio`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sKey}` },
                body: JSON.stringify({ audioBase64, mimeType: mime || "audio/ogg" }),
              });
              if (transcribeResponse.ok) {
                const result = await transcribeResponse.json();
                return result.transcription || null;
              }
            } catch (e) { console.warn("[UAZAPI_WEBHOOK] transcribeFromUrl error:", e); }
            return null;
          }

          // Helper to transcribe via uazapi /message/download
          async function transcribeViaDownload(): Promise<string | null> {
            try {
              const aUrl = (instance.api_url || "").replace(/\/+$/, "");
              const aKey = instance.api_key || "";
              if (!aUrl || !aKey) return null;
              const dlRes = await fetch(`${aUrl}/message/download`, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: aKey },
                body: JSON.stringify({ id: whatsappMessageId, return_base64: true }),
              });
              if (!dlRes.ok) return null;
              const dlData = await dlRes.json();
              const dlBase64 = dlData.base64Data || dlData.base64;
              if (!dlBase64) return null;
              const sUrl = Deno.env.get("SUPABASE_URL") || "";
              const sKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
              const transcribeRes = await fetch(`${sUrl}/functions/v1/transcribe-audio`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sKey}` },
                body: JSON.stringify({ audioBase64: dlBase64, mimeType: mimeType || "audio/ogg" }),
              });
              if (transcribeRes.ok) {
                const tResult = await transcribeRes.json();
                return tResult.transcription || null;
              }
            } catch (e) { console.warn("[UAZAPI_WEBHOOK] transcribeViaDownload error:", e); }
            return null;
          }

          try {
            let transcription: string | null = null;

            // Attempt 1: Use persisted media URL (already in storage)
            const persistedMediaUrl = messagePayload.media_url as string | null;
            if (persistedMediaUrl && (persistedMediaUrl.includes("supabase") || persistedMediaUrl.includes("/storage/v1/"))) {
              console.log("[UAZAPI_WEBHOOK] 🎤 Transcribing audio (attempt 1: persisted URL)...");
              transcription = await transcribeFromUrl(persistedMediaUrl, (messagePayload.media_mime_type as string) || "audio/ogg");
            }

            // Attempt 2: Try /message/download from uazapi
            if (!transcription) {
              console.log("[UAZAPI_WEBHOOK] 🎤 Transcribing audio (attempt 2: /message/download)...");
              transcription = await transcribeViaDownload();
            }

            // Attempt 3: Wait 3s and retry — media may have been persisted by now (race condition fix)
            if (!transcription) {
              console.log("[UAZAPI_WEBHOOK] 🎤 Transcription failed, waiting 3s for retry (race condition fix)...");
              await new Promise(r => setTimeout(r, 3000));

              // Re-fetch message from DB to get updated media_url
              const { data: refreshedMsg } = await supabaseClient
                .from("messages")
                .select("media_url, media_mime_type")
                .eq("whatsapp_message_id", whatsappMessageId)
                .eq("conversation_id", conversationId)
                .maybeSingle();

              const refreshedUrl = refreshedMsg?.media_url;
              if (refreshedUrl && (refreshedUrl.includes("supabase") || refreshedUrl.includes("/storage/v1/"))) {
                console.log("[UAZAPI_WEBHOOK] 🎤 Transcribing audio (attempt 3: refreshed URL after delay)...");
                transcription = await transcribeFromUrl(refreshedUrl, refreshedMsg?.media_mime_type || "audio/ogg");
              }

              // Last resort: retry /message/download after delay
              if (!transcription) {
                console.log("[UAZAPI_WEBHOOK] 🎤 Transcribing audio (attempt 4: /message/download retry)...");
                transcription = await transcribeViaDownload();
              }
            }

            if (transcription) {
              contentForAI = `[Áudio transcrito]: ${transcription}`;
              console.log(`[UAZAPI_WEBHOOK] ✅ Audio transcribed: ${transcription.length} chars`);
              await supabaseClient
                .from("messages")
                .update({ content: contentForAI })
                .eq("whatsapp_message_id", whatsappMessageId)
                .eq("conversation_id", conversationId);
            } else {
              console.warn("[UAZAPI_WEBHOOK] ⚠️ All transcription attempts failed for audio message:", whatsappMessageId);
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
            
            // Fetch automation name and delay config for ai_agent_name
            let automationName: string | null = null;
            let agentResponseDelayMs = 0;
            try {
              const { data: automation } = await supabaseClient
                .from("automations")
                .select("name, response_delay_seconds")
                .eq("id", conv.current_automation_id)
                .single();
              automationName = automation?.name || null;
              agentResponseDelayMs = ((automation?.response_delay_seconds) || 0) * 1000;
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

            const DEBOUNCE_SECONDS = 10;
            const requestId = crypto.randomUUID().substring(0, 8);

            await queueMessageForAIProcessing(supabaseClient, {
              conversationId,
              lawFirmId,
              messageContent: contentForAI || '',
              messageType,
              contactName,
              contactPhone: phoneNumber,
              remoteJid,
              instanceId: instance.id,
              instanceName: instance.instance_name,
              clientId: resolvedClientId,
              audioRequested: audioRequestedForThisMessage,
              automationId: conv.current_automation_id,
              automationName: automationName,
              agentResponseDelayMs,
              apiUrl: instance.api_url || '',
              apiKey: instance.api_key || '',
            }, DEBOUNCE_SECONDS, requestId);
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
