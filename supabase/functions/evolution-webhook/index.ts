import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Production CORS configuration
const ALLOWED_ORIGINS = [
  'https://miauchat.com.br',
  'https://www.miauchat.com.br',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.includes('.lovableproject.com') ||
    origin.includes('.lovable.app') ||
    origin.endsWith('.miauchat.com.br')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// Legacy corsHeaders for backwards compatibility (webhook receives from Evolution API, not browser)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to get current billing period in YYYY-MM format
function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Record AI conversation usage when AI first assumes a conversation in current billing period.
 * Business Rule: 1 conversation = 1 count, regardless of message count.
 * Only counts once per conversation per billing period.
 */
async function recordAIConversationUsage(
  supabaseClient: any,
  lawFirmId: string,
  conversationId: string,
  automationId: string,
  automationName: string
): Promise<boolean> {
  const billingPeriod = getCurrentBillingPeriod();
  
  try {
    // Check if this conversation was already counted this billing period
    const { data: existingRecord } = await supabaseClient
      .from('usage_records')
      .select('id')
      .eq('law_firm_id', lawFirmId)
      .eq('usage_type', 'ai_conversation')
      .eq('billing_period', billingPeriod)
      .eq('metadata->>conversation_id', conversationId)
      .limit(1);
    
    if (existingRecord && existingRecord.length > 0) {
      logDebug('USAGE_TRACKING', 'Conversation already counted this period', { 
        conversationId, 
        billingPeriod 
      });
      return false; // Already counted
    }
    
    // Record the usage - this conversation is being handled by AI for the first time this month
    const { error } = await supabaseClient
      .from('usage_records')
      .insert({
        law_firm_id: lawFirmId,
        usage_type: 'ai_conversation',
        count: 1,
        billing_period: billingPeriod,
        metadata: {
          conversation_id: conversationId,
          automation_id: automationId,
          automation_name: automationName,
          first_ai_response_at: new Date().toISOString(),
        }
      });
    
    if (error) {
      logDebug('USAGE_TRACKING', 'Failed to record AI conversation usage', { error });
      return false;
    }
    
    logDebug('USAGE_TRACKING', 'AI conversation usage recorded', { 
      conversationId, 
      automationName,
      billingPeriod 
    });
    return true;
  } catch (err) {
    logDebug('USAGE_TRACKING', 'Error recording usage', { error: err instanceof Error ? err.message : err });
    return false;
  }
}

// Evolution API event types - support both formats
interface EvolutionEvent {
  event: string;
  instance: string;
  data: unknown;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

interface ConnectionUpdateData {
  state: 'open' | 'close' | 'connecting' | 'qr';
  statusReason?: number;
}

interface QRCodeData {
  qrcode?: {
    base64?: string;
    code?: string;
  };
  base64?: string;
  code?: string;
}

interface MessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    imageMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
    };
    audioMessage?: {
      url?: string;
      mimetype?: string;
    };
    videoMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
    };
    documentMessage?: {
      url?: string;
      mimetype?: string;
      fileName?: string;
    };
  };
  messageType?: string;
  messageTimestamp?: number;
}

// ACK data structure for message status updates
interface MessageAckData {
  remoteJid?: string;
  id?: string;
  fromMe?: boolean;
  ack?: number; // 0=error, 1=pending, 2=sent, 3=delivered, 4=read, 5=played
  // Alternative structure
  key?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  status?: string;
  ids?: string[];
}

// Helper to normalize event names (Evolution API can send in different formats)
function normalizeEventName(event: string): string {
  // Convert UPPER_CASE to lowercase.with.dots
  const normalized = event.toLowerCase().replace(/_/g, '.');
  return normalized;
}

// Helper to extract phone number from JID
function extractPhoneFromJid(jid: string | null): string | null {
  if (!jid) return null;
  const match = jid.match(/(\d+)@/);
  return match ? match[1] : jid.replace(/@.*/, '');
}

// Fetch connected phone number from Evolution API
async function fetchConnectedPhoneNumber(
  apiUrl: string,
  apiKey: string,
  instanceName: string
): Promise<string | null> {
  try {
    const url = `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.log(`[Webhook] fetchInstances failed: ${res.status}`);
      return null;
    }
    
    const data = await res.json().catch(() => null);
    const candidates = Array.isArray(data) ? data : data?.instances ? data.instances : [data];
    
    const found = candidates?.find?.((i: any) => i?.instanceName === instanceName || i?.name === instanceName) ?? candidates?.[0];
    
    const ownerJid = found?.owner || found?.instance?.owner || found?.profile?.owner || found?.profile?.id || null;
    return extractPhoneFromJid(ownerJid);
  } catch (e) {
    console.log(`[Webhook] Error fetching phone number: ${e}`);
    return null;
  }
}

// Detailed logging helper
function logDebug(section: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [Evolution Webhook] [${section}] ${message}${dataStr}`);
}

// Interface for automation context
interface AutomationContext {
  lawFirmId: string;
  conversationId: string;
  messageContent: string;
  messageType: string;
  contactName: string;
  contactPhone: string;
  remoteJid: string;
  instanceId: string;
  instanceName: string;
  clientId?: string; // Added for client memory support
}

// =============================================================================
// MATRIZ DE IAs POR PLANO E FUNCIONALIDADE
// =============================================================================
// | Funcionalidade      | IA          | Plano                    |
// |---------------------|-------------|--------------------------|
// | Conversação         | Gemini      | Starter                  |
// | Conversação         | GPT         | Professional / Enterprise|
// | Transcrição áudio   | OpenAI      | Todos                    |
// | Visualização imagem | Gemini      | Todos                    |
// =============================================================================

type PlanType = 'starter' | 'professional' | 'enterprise' | 'unknown';
type ConversationAI = 'gemini' | 'gpt';

interface AIProviderConfig {
  planType: PlanType;
  conversationAI: ConversationAI;
  capabilities: Record<string, boolean>;
  openaiApiKey: string | null;
}

// Determine plan type from plan name
function getPlanType(planName: string): PlanType {
  const name = planName.toLowerCase().trim();
  if (name.includes('starter') || name.includes('básico') || name.includes('basico')) {
    return 'starter';
  }
  if (name.includes('professional') || name.includes('profissional') || name.includes('pro')) {
    return 'professional';
  }
  if (name.includes('enterprise') || name.includes('empresarial')) {
    return 'enterprise';
  }
  // Default to starter for unknown/free plans
  return 'starter';
}

// Get conversation AI based on plan (FIXED RULES - NO OVERRIDE)
function getConversationAI(planType: PlanType): ConversationAI {
  switch (planType) {
    case 'starter':
      return 'gemini'; // Starter ALWAYS uses Gemini
    case 'professional':
    case 'enterprise':
      return 'gpt'; // Professional/Enterprise ALWAYS use GPT
    default:
      return 'gemini'; // Default to Gemini for unknown
  }
}

// Get AI provider configuration based on PLAN MATRIX (not tenant settings)
async function getAIProviderConfig(
  supabaseClient: any, 
  lawFirmId: string
): Promise<AIProviderConfig> {
  try {
    // Fetch company plan
    const { data: company } = await supabaseClient
      .from('companies')
      .select('plan_id, plans(name)')
      .eq('law_firm_id', lawFirmId)
      .single();

    const planName = (company?.plans as any)?.name || '';
    const planType = getPlanType(planName);
    const conversationAI = getConversationAI(planType);

    logDebug('AI_MATRIX', `Plan detected: ${planName} -> ${planType} -> Conversation AI: ${conversationAI}`, { 
      lawFirmId,
      planName,
      planType,
      conversationAI
    });

    // For GPT plans (Professional/Enterprise), we need OpenAI key
    let openaiApiKey: string | null = null;
    if (conversationAI === 'gpt') {
      // Try to get from tenant settings first
      const { data: settings } = await supabaseClient
        .from('law_firm_settings')
        .select('openai_api_key')
        .eq('law_firm_id', lawFirmId)
        .single();
      
      // Use tenant key or fall back to global key
      openaiApiKey = settings?.openai_api_key || Deno.env.get('OPENAI_API_KEY') || null;
      
      if (!openaiApiKey) {
        logDebug('AI_MATRIX', 'WARNING: GPT required but no OpenAI key available', { lawFirmId });
      }
    }

    return {
      planType,
      conversationAI,
      capabilities: { 
        auto_reply: true, 
        summary: true, 
        transcription: true, // Always OpenAI Whisper
        classification: true,
        image_analysis: true // Always Gemini
      },
      openaiApiKey,
    };
  } catch (error) {
    logDebug('AI_MATRIX', 'Error fetching plan config, defaulting to Starter (Gemini)', { error });
    return { 
      planType: 'starter',
      conversationAI: 'gemini',
      capabilities: { auto_reply: true, summary: true, transcription: true, classification: true, image_analysis: true },
      openaiApiKey: null,
    };
  }
}

// Voice configuration interface
interface VoiceConfig {
  enabled: boolean;
  voiceId: string;
}

// Only respond with audio when the CLIENT explicitly requests it or indicates reading difficulty.
// (voiceConfig.enabled is just a permission toggle)
function isAudioRequestedFromText(userText: string): boolean {
  if (!userText) return false;
  const t = userText.toLowerCase();

  // Common PT-BR ways users ask for voice notes
  const explicitAudioPatterns: RegExp[] = [
    /(manda|envia|responde|responda|responder).{0,40}(áudio|audio|mensagem de voz|voz)/i,
    /(áudio|audio|mensagem de voz|voz).{0,40}(manda|envia|responde|responda|responder)/i,
    /por\s+(áudio|audio)/i,
    /em\s+(áudio|audio)/i,
    /em\s+voz/i,
    /pode\s+(falar|responder|mandar).{0,20}(áudio|audio|voz)/i,
    /prefiro\s+(áudio|audio|voz)/i,
  ];

  // Reading difficulty patterns - auto-activate audio for accessibility
  const readingDifficultyPatterns: RegExp[] = [
    /n[aã]o\s+(sei|consigo)\s+ler/i,
    /dificuldade\s+(de|para|em)\s+ler/i,
    /n[aã]o\s+leio\s+bem/i,
    /problema\s+(de|para|com)\s+(leitura|ler)/i,
    /n[aã]o\s+enxergo\s+bem/i,
    /tenho\s+dificuldade\s+(visual|de\s+vis[aã]o)/i,
  ];

  return explicitAudioPatterns.some((p) => p.test(t)) || 
         readingDifficultyPatterns.some((p) => p.test(t));
}

// Check if audio mode should be active based on:
// 1. Current message explicitly requests audio
// 2. Client indicated reading difficulty in recent messages
// 3. Client has been sending audio messages (prefers audio communication)
async function shouldRespondWithAudio(
  supabaseClient: any,
  conversationId: string,
  currentMessageText: string,
  currentMessageType: string
): Promise<boolean> {
  // Check current message first
  if (isAudioRequestedFromText(currentMessageText)) {
    logDebug('AUDIO_MODE', 'Audio requested in current message');
    return true;
  }

  try {
    // Get recent messages to check for audio preference pattern
    const { data: recentMessages } = await supabaseClient
      .from('messages')
      .select('content, message_type, is_from_me, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (!recentMessages || recentMessages.length === 0) {
      return false;
    }

    // Count client audio messages (indicates preference for audio communication)
    const clientAudioCount = recentMessages.filter(
      (m: any) => !m.is_from_me && m.message_type === 'audio'
    ).length;

    // Check if client requested audio in any recent message
    const clientMessages = recentMessages.filter((m: any) => !m.is_from_me && m.content);
    const hasRecentAudioRequest = clientMessages.some((m: any) => 
      isAudioRequestedFromText(m.content || '')
    );

    if (hasRecentAudioRequest) {
      logDebug('AUDIO_MODE', 'Client requested audio in recent messages');
      return true;
    }

    // If client is predominantly sending audio messages (3+ in last 15), respond with audio
    if (clientAudioCount >= 3) {
      logDebug('AUDIO_MODE', `Client prefers audio communication (${clientAudioCount} audio messages)`);
      return true;
    }

    // If current message is audio and voice is enabled, respond in audio
    if (currentMessageType === 'audio') {
      // Check if there were recent audio requests or reading difficulty mentions
      const hasAccessibilityNeed = clientMessages.some((m: any) => {
        const content = m.content?.toLowerCase() || '';
        return content.includes('não sei ler') || 
               content.includes('não consigo ler') ||
               content.includes('dificuldade') ||
               content.includes('não enxergo');
      });

      if (hasAccessibilityNeed) {
        logDebug('AUDIO_MODE', 'Client has accessibility needs, responding with audio');
        return true;
      }
    }

    return false;
  } catch (error) {
    logDebug('AUDIO_MODE', 'Error checking audio preference', { error });
    return false;
  }
}

// Helper to split text into safe chunks for TTS (OpenAI input limit ~4096 chars)
function splitTextForTTS(text: string, maxChars = 3500): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  let remaining = cleaned;

  while (remaining.length > maxChars) {
    // Prefer splitting at sentence boundaries near the max limit
    const slice = remaining.slice(0, maxChars);
    const lastSentenceBreak = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('; '),
      slice.lastIndexOf(': ')
    );

    const cutAt = lastSentenceBreak > 200 ? lastSentenceBreak + 1 : maxChars; // keep punctuation
    const part = remaining.slice(0, cutAt).trim();
    if (part) chunks.push(part);

    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

// Helper function to generate TTS audio using OpenAI
async function generateTTSAudio(text: string, voiceId: string): Promise<string | null> {
  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      logDebug('TTS', 'OPENAI_API_KEY not configured');
      return null;
    }

    const trimmedText = text.trim().substring(0, 3900);

    logDebug('TTS', `Generating audio with voice: ${voiceId}`, {
      textLength: trimmedText.length,
      truncated: trimmedText.length !== text.trim().length,
    });

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: trimmedText,
        voice: voiceId,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('TTS', 'OpenAI TTS API error', { status: response.status, error: errorText });
      return null;
    }

    // Convert to base64
    const audioBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Audio = btoa(binary);

    logDebug('TTS', `Audio generated successfully`, { size: audioBuffer.byteLength });
    return base64Audio;
  } catch (error) {
    logDebug('TTS', 'Error generating TTS audio', { error: error instanceof Error ? error.message : error });
    return null;
  }
}

// Helper function to send audio message to WhatsApp
async function sendAudioToWhatsApp(
  apiUrl: string,
  instanceName: string,
  apiKey: string,
  remoteJid: string,
  audioBase64: string
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const sendUrl = `${apiUrl}/message/sendWhatsAppAudio/${instanceName}`;
    
    logDebug('SEND_AUDIO', 'Sending audio to WhatsApp', { remoteJid });

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      // Evolution API expects "audio" at the root level (url or base64)
      body: JSON.stringify({
        number: remoteJid,
        audio: audioBase64,
        delay: 1200,
        encoding: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('SEND_AUDIO', 'Evolution API audio send failed', { status: response.status, error: errorText });
      return { success: false };
    }

    const result = await response.json();
    const messageId = result?.key?.id;
    
    logDebug('SEND_AUDIO', 'Audio sent successfully', { messageId });
    return { success: true, messageId };
  } catch (error) {
    logDebug('SEND_AUDIO', 'Error sending audio', { error: error instanceof Error ? error.message : error });
    return { success: false };
  }
}

// Helper function to send text fallback when audio fails
async function sendTextFallbackWithWarning(
  supabaseClient: any,
  context: AutomationContext,
  sendUrl: string,
  instance: { api_key: string | null; instance_name: string },
  messageParts: string[],
  sanitizeText: (value: string) => string,
  includeWarning: boolean
): Promise<void> {
  logDebug('FALLBACK', 'Sending text fallback for failed audio', { 
    includeWarning,
    partsCount: messageParts.length 
  });

  // First send the content
  for (let i = 0; i < messageParts.length; i++) {
    const part = sanitizeText(messageParts[i]);
    if (!part) continue;

    // Add delay between messages
    if (i > 0) {
      const typingDelay = Math.min(part.length * 15, 2000);
      await new Promise((resolve) => setTimeout(resolve, typingDelay));
    }

    const sendResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.api_key || '',
      },
      body: JSON.stringify({
        number: context.remoteJid,
        text: part,
      }),
    });

    if (sendResponse.ok) {
      const sendResult = await sendResponse.json();
      await supabaseClient
        .from('messages')
        .insert({
          conversation_id: context.conversationId,
          whatsapp_message_id: sendResult?.key?.id,
          content: part,
          message_type: 'text',
          is_from_me: true,
          sender_type: 'system',
          ai_generated: true,
        });
    }
  }

  // Then send warning message if requested
  if (includeWarning) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const warningText = '⚠️ Não consegui enviar por áudio no momento, mas aí está a resposta em texto.';
    
    const warnResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.api_key || '',
      },
      body: JSON.stringify({
        number: context.remoteJid,
        text: warningText,
      }),
    });

    if (warnResponse.ok) {
      const warnResult = await warnResponse.json();
      await supabaseClient
        .from('messages')
        .insert({
          conversation_id: context.conversationId,
          whatsapp_message_id: warnResult?.key?.id,
          content: warningText,
          message_type: 'text',
          is_from_me: true,
          sender_type: 'system',
          ai_generated: false, // This is a system warning, not AI content
        });
      logDebug('FALLBACK', 'Warning message sent');
    }
  }
}

// Helper function to send AI response back to WhatsApp and save to database
// Splits response into paragraphs and sends them separately for natural feel
// If voice is enabled, also sends audio response
async function sendAIResponseToWhatsApp(
  supabaseClient: any,
  context: AutomationContext,
  aiResponse: string,
  voiceConfig?: VoiceConfig
): Promise<boolean> {
  try {
    const AUDIO_PLACEHOLDER_RE = /\[\s*mensagem de [áa]udio\s*\]/gi;
    const sanitizeText = (value: string) =>
      value
        .replace(AUDIO_PLACEHOLDER_RE, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const sanitizedResponse = sanitizeText(aiResponse);

    logDebug('SEND_RESPONSE', 'Sending AI response to WhatsApp', {
      conversationId: context.conversationId,
      responseLength: sanitizedResponse.length,
    });

    if (!sanitizedResponse) {
      logDebug('SEND_RESPONSE', 'AI response became empty after sanitization; skipping send', {
        conversationId: context.conversationId,
      });
      return false;
    }

    // Get instance details for API URL and key
    const { data: instance } = await supabaseClient
      .from('whatsapp_instances')
      .select('api_url, api_key, instance_name')
      .eq('id', context.instanceId)
      .single();

    if (!instance) {
      logDebug('SEND_RESPONSE', 'Instance not found', { instanceId: context.instanceId });
      return false;
    }

    // Normalize API URL
    const apiUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
    const sendUrl = `${apiUrl}/message/sendText/${instance.instance_name}`;

    // Split response into paragraphs (by double newline or single newline with meaningful content)
    const paragraphs = sanitizedResponse
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // If only one paragraph but it's very long, try to split by single newlines
    let messageParts: string[] = [];
    if (paragraphs.length === 1 && paragraphs[0].length > 300) {
      messageParts = paragraphs[0]
        .split(/\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    } else {
      messageParts = paragraphs;
    }

    // Ensure we don't send more than 5 messages (combine if needed)
    if (messageParts.length > 5) {
      const combined: string[] = [];
      const chunkSize = Math.ceil(messageParts.length / 5);
      for (let i = 0; i < messageParts.length; i += chunkSize) {
        combined.push(messageParts.slice(i, i + chunkSize).join('\n\n'));
      }
      messageParts = combined;
    }

    // If still just one part, use as-is
    if (messageParts.length === 0) {
      messageParts = [sanitizedResponse];
    }

    logDebug('SEND_RESPONSE', `Splitting into ${messageParts.length} messages`, { 
      conversationId: context.conversationId 
    });

    // Check BEFORE sending if audio was requested - if so, skip text and send ONLY audio
    // Uses enhanced detection that checks recent messages for audio preference/accessibility needs
    const audioRequested = await shouldRespondWithAudio(
      supabaseClient,
      context.conversationId,
      context.messageContent,
      context.messageType
    );
    const shouldSendOnlyAudio = voiceConfig?.enabled && audioRequested;

    logDebug('SEND_RESPONSE', 'Audio detection', { 
      userMessage: context.messageContent.substring(0, 100),
      messageType: context.messageType,
      audioRequested, 
      voiceEnabled: voiceConfig?.enabled,
      shouldSendOnlyAudio 
    });

    if (shouldSendOnlyAudio) {
      logDebug('SEND_RESPONSE', 'Audio requested - attempting to send audio response', { 
        voiceId: voiceConfig?.voiceId,
        textLength: sanitizedResponse.length
      });

      // Combine all text parts for audio
      const fullText = messageParts.join(' ').trim();
      
      // CRITICAL: Detect if AI only sent an "audio announcement" instead of real content
      // These patterns indicate the AI failed to follow instructions and just announced it would send audio
      const audioAnnouncementPatterns = [
        /vou\s+(ativar|mandar|enviar|gravar|ligar)\s*(o)?\s*(áudio|audio|voz)/i,
        /ativando\s+(o)?\s*(áudio|audio)/i,
        /um\s+momento.*áudio/i,
        /áudio.*ativado/i,
        /deixa\s+eu\s+(mandar|enviar|gravar)/i,
        /^claro,?\s*(vou|deixa)/i,
        /vou\s+te\s+(explicar|falar)\s+(por|em)\s+áudio/i,
      ];
      
      const isJustAnnouncement = audioAnnouncementPatterns.some(p => p.test(fullText));
      
      if (isJustAnnouncement) {
        logDebug('SEND_RESPONSE', 'CRITICAL: AI sent only an announcement, not real content!', { 
          text: fullText.substring(0, 200)
        });
        // This is a BAD response - the AI didn't provide actual content
        // We need to send a helpful message to the user instead of the useless announcement
        const fallbackMessage = 'Desculpe, houve um problema técnico. Por favor, repita sua pergunta que vou te responder.';
        const fallbackParts = [fallbackMessage];
        await sendTextFallbackWithWarning(supabaseClient, context, sendUrl, instance, fallbackParts, sanitizeText, false);
        return true;
      }
      
      // Validate we have actual content to convert to audio
      if (!fullText || fullText.length < 5) {
        logDebug('SEND_RESPONSE', 'CRITICAL: Text too short for TTS, falling back to text', { 
          textLength: fullText.length,
          text: fullText
        });
        // Force text fallback with warning
        await sendTextFallbackWithWarning(supabaseClient, context, sendUrl, instance, messageParts, sanitizeText, true);
        return true;
      }

      const chunks = splitTextForTTS(fullText, 3500);
      logDebug('TTS_FLOW', 'Generating audio chunks', {
        totalLength: fullText.length,
        chunks: chunks.length,
        voiceId: voiceConfig!.voiceId,
      });

      let sentAnyAudio = false;

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        logDebug('TTS_FLOW', 'Generating audio chunk', {
          index: i + 1,
          total: chunks.length,
          textLength: chunkText.length,
        });

        const audioBase64 = await generateTTSAudio(chunkText, voiceConfig!.voiceId);

        if (!audioBase64) {
          logDebug('TTS_FLOW', 'FAILED to generate TTS audio chunk, falling back to text', { index: i + 1 });
          await sendTextFallbackWithWarning(supabaseClient, context, sendUrl, instance, messageParts, sanitizeText, true);
          return true;
        }

        logDebug('TTS_FLOW', 'Audio chunk generated, sending to WhatsApp', {
          index: i + 1,
          audioSize: audioBase64.length,
        });

        const audioResult = await sendAudioToWhatsApp(
          apiUrl,
          instance.instance_name,
          instance.api_key || '',
          context.remoteJid,
          audioBase64
        );

        if (!audioResult.success || !audioResult.messageId) {
          logDebug('TTS_FLOW', 'FAILED to send audio chunk to WhatsApp, falling back to text', {
            index: i + 1,
            audioResult,
          });
          await sendTextFallbackWithWarning(supabaseClient, context, sendUrl, instance, messageParts, sanitizeText, true);
          return true;
        }

        sentAnyAudio = true;

        // Save each audio chunk to DB (keeps transcript aligned with the audio that was sent)
        await supabaseClient
          .from('messages')
          .insert({
            conversation_id: context.conversationId,
            whatsapp_message_id: audioResult.messageId,
            content: chunkText,
            message_type: 'audio',
            is_from_me: true,
            sender_type: 'system',
            ai_generated: true,
            media_mime_type: 'audio/mpeg',
          });

        logDebug('SEND_RESPONSE', 'Audio chunk sent and saved successfully', {
          messageId: audioResult.messageId,
          chunkIndex: i + 1,
          chunksTotal: chunks.length,
          textLength: chunkText.length,
        });

        // Small pacing between multiple audios
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }

      if (sentAnyAudio) {
        // Update conversation timestamp
        await supabaseClient
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            n8n_last_response_at: new Date().toISOString(),
          })
          .eq('id', context.conversationId);

        return true;
      }

      // Fallback (shouldn't happen)
      await sendTextFallbackWithWarning(supabaseClient, context, sendUrl, instance, messageParts, sanitizeText, true);
      return true;
      // Normal text-only flow
      let lastWhatsappMessageId: string | null = null;

      for (let i = 0; i < messageParts.length; i++) {
        const part = sanitizeText(messageParts[i]);

        // If sanitization removed everything, skip
        if (!part) {
          logDebug('SEND_RESPONSE', `Skipping empty message part ${i + 1}/${messageParts.length} after sanitization`);
          continue;
        }

        // Add delay between messages (simulate typing)
        if (i > 0) {
          const typingDelay = Math.min(part.length * 15, 2000); // ~15ms per char, max 2s
          await new Promise((resolve) => setTimeout(resolve, typingDelay));
        }

        logDebug('SEND_RESPONSE', `Sending message part ${i + 1}/${messageParts.length}`, {
          partLength: part.length,
        });

        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': instance.api_key || '',
          },
          body: JSON.stringify({
            number: context.remoteJid,
            text: part,
          }),
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          logDebug('SEND_RESPONSE', `Evolution API send failed for part ${i + 1}`, { 
            status: sendResponse.status, 
            error: errorText 
          });
          continue; // Try to send remaining parts
        }

        const sendResult = await sendResponse.json();
        lastWhatsappMessageId = sendResult?.key?.id;

        logDebug('SEND_RESPONSE', `Part ${i + 1} sent successfully`, { 
          whatsappMessageId: lastWhatsappMessageId 
        });

        // Save each message part to the database
        const { error: saveError } = await supabaseClient
          .from('messages')
          .insert({
            conversation_id: context.conversationId,
            whatsapp_message_id: lastWhatsappMessageId,
            content: part,
            message_type: 'text',
            is_from_me: true,
            sender_type: 'system',
            ai_generated: true,
          });

        if (saveError) {
          logDebug('SEND_RESPONSE', `Failed to save message part ${i + 1} to DB`, { error: saveError });
        }
      }
    }

    // Update conversation last_message_at
    await supabaseClient
      .from('conversations')
      .update({ 
        last_message_at: new Date().toISOString(),
        n8n_last_response_at: new Date().toISOString(),
      })
      .eq('id', context.conversationId);

    logDebug('SEND_RESPONSE', `Response sent successfully (audio-only: ${shouldSendOnlyAudio})`);
    return true;
  } catch (error) {
    logDebug('SEND_RESPONSE', 'Error sending AI response', { 
      error: error instanceof Error ? error.message : error 
    });
    return false;
  }
}

// Process messages with Gemini AI (Starter plan) via Lovable AI Gateway
// CRITICAL: Must have valid automationId - prompt is the SINGLE SOURCE OF TRUTH
async function processWithGemini(
  supabaseClient: any, 
  context: AutomationContext, 
  aiConfig: AIProviderConfig
) {
  if (!aiConfig.capabilities.auto_reply) {
    logDebug('AI_MATRIX', 'auto_reply capability disabled, skipping Gemini');
    return;
  }

  logDebug('AI_MATRIX', `Processing with GEMINI (Plan: ${aiConfig.planType})`, { conversationId: context.conversationId });

  try {
    // CRITICAL: Get the CORRECT automation for this tenant
    // Only use automations that are:
    // 1. From the same law_firm_id
    // 2. Active
    // 3. Have a configured ai_prompt (required!)
    const { data: automations, error: autoError } = await supabaseClient
      .from('automations')
      .select('id, ai_prompt, ai_temperature, name, trigger_config')
      .eq('law_firm_id', context.lawFirmId)
      .eq('is_active', true)
      .not('ai_prompt', 'is', null)
      .limit(1);

    if (autoError || !automations || automations.length === 0) {
      logDebug('AI_PROVIDER', 'No valid automation found with prompt configured', { 
        lawFirmId: context.lawFirmId,
        error: autoError 
      });
      return;
    }

    const automation = automations[0];
    
    if (!automation.ai_prompt || automation.ai_prompt.trim() === '') {
      logDebug('AI_PROVIDER', 'Automation has no prompt configured, cannot proceed', { 
        automationId: automation.id 
      });
      return;
    }

    logDebug('AI_PROVIDER', `Using agent: ${automation.name}`, { automationId: automation.id });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Decide audio mode BEFORE calling AI (so the model can answer in a single complete shot)
    const audioRequestedForThisMessage = await shouldRespondWithAudio(
      supabaseClient,
      context.conversationId,
      context.messageContent,
      context.messageType
    );

    // Call internal ai-chat edge function with automationId (REQUIRED)
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        conversationId: context.conversationId,
        message: context.messageContent,
        automationId: automation.id, // REQUIRED for proper isolation
        context: {
          clientName: context.contactName,
          clientPhone: context.contactPhone,
          lawFirmId: context.lawFirmId,
          clientId: context.clientId, // Pass clientId for memory support
          audioRequested: audioRequestedForThisMessage,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('AI_PROVIDER', 'Internal AI call failed', { 
        status: response.status, 
        error: errorText,
        automationId: automation.id 
      });
      return;
    }

    const result = await response.json();
    const aiResponse = result.response;
    logDebug('AI_PROVIDER', 'Internal AI response received', { 
      hasResponse: !!aiResponse, 
      responseLength: aiResponse?.length,
      automationId: automation.id 
    });

    if (aiResponse) {
      // CRITICAL: Record AI conversation usage (1 per conversation per billing period)
      await recordAIConversationUsage(
        supabaseClient,
        context.lawFirmId,
        context.conversationId,
        automation.id,
        automation.name
      );

      // Get voice configuration from automation trigger_config
      const triggerConfig = automation.trigger_config as Record<string, unknown> | null;
      const voiceConfig: VoiceConfig = {
        enabled: Boolean(triggerConfig?.voice_enabled),
        voiceId: (triggerConfig?.voice_id as string) || 'shimmer',
      };

      logDebug('AI_PROVIDER', 'Voice config', { voiceConfig });

      // Send the response back to WhatsApp (with optional voice)
      await sendAIResponseToWhatsApp(supabaseClient, context, aiResponse, voiceConfig);
    }

    // Log the AI processing
    await supabaseClient
      .from('webhook_logs')
      .insert({
        automation_id: automation.id,
        direction: 'internal',
        payload: {
          provider: 'miauchat_ai',
          automation_name: automation.name,
          conversation_id: context.conversationId,
          message: context.messageContent,
          response_sent: !!aiResponse,
        },
        status_code: 200,
      });

  } catch (error) {
    logDebug('AI_PROVIDER', 'Error processing with internal AI', { error: error instanceof Error ? error.message : error });
  }
}

// Process messages with GPT (Professional/Enterprise plans)
// CRITICAL: Must have valid automation with prompt - no fallbacks allowed
async function processWithGPT(
  supabaseClient: any, 
  context: AutomationContext, 
  aiConfig: AIProviderConfig
) {
  if (!aiConfig.capabilities.auto_reply) {
    logDebug('AI_MATRIX', 'auto_reply capability disabled, skipping GPT');
    return;
  }

  if (!aiConfig.openaiApiKey) {
    logDebug('AI_MATRIX', 'OpenAI API key not configured, cannot process GPT', { planType: aiConfig.planType });
    return;
  }

  logDebug('AI_MATRIX', `Processing with GPT (Plan: ${aiConfig.planType})`, { conversationId: context.conversationId });

  try {
    // CRITICAL: Get the CORRECT automation for this tenant
    const { data: automations, error: autoError } = await supabaseClient
      .from('automations')
      .select('id, ai_prompt, ai_temperature, name, trigger_config')
      .eq('law_firm_id', context.lawFirmId)
      .eq('is_active', true)
      .not('ai_prompt', 'is', null)
      .limit(1);

    if (autoError || !automations || automations.length === 0) {
      logDebug('AI_MATRIX', 'No valid automation found with prompt configured', { lawFirmId: context.lawFirmId });
      return;
    }

    const automation = automations[0];
    
    if (!automation.ai_prompt || automation.ai_prompt.trim() === '') {
      logDebug('AI_MATRIX', 'Automation has no prompt configured, cannot proceed', { automationId: automation.id });
      return;
    }

    logDebug('AI_MATRIX', `Using agent: ${automation.name}`, { automationId: automation.id });

    // Get recent messages for context - increased to 25 for better context retention
    const { data: recentMessages } = await supabaseClient
      .from('messages')
      .select('content, is_from_me, message_type, created_at')
      .eq('conversation_id', context.conversationId)
      .order('created_at', { ascending: false })
      .limit(25);

    // Get client memories if clientId is available
    let clientMemoriesText = '';
    if (context.clientId) {
      const { data: memories } = await supabaseClient
        .from('client_memories')
        .select('fact_type, content, importance')
        .eq('client_id', context.clientId)
        .eq('is_active', true)
        .order('importance', { ascending: false })
        .limit(15);
      
      if (memories && memories.length > 0) {
        clientMemoriesText = `\n\n📝 MEMÓRIA DO CLIENTE (fatos importantes já conhecidos):\n` +
          memories.map((m: any) => `- [${m.fact_type}] ${m.content}`).join('\n');
      }
    }

    // Get conversation summary if available
    const { data: convData } = await supabaseClient
      .from('conversations')
      .select('ai_summary')
      .eq('id', context.conversationId)
      .single();
    
    const summaryText = convData?.ai_summary ? 
      `\n\n📋 RESUMO DA CONVERSA ANTERIOR:\n${convData.ai_summary}` : '';

    // Agent prompt is the SINGLE SOURCE OF TRUTH - no fallbacks
    const systemPrompt = automation.ai_prompt;

    // Decide audio mode BEFORE calling GPT (so the model doesn't do step-by-step)
    const audioRequestedForThisMessage = await shouldRespondWithAudio(
      supabaseClient,
      context.conversationId,
      context.messageContent,
      context.messageType
    );

    const behaviorInstruction = audioRequestedForThisMessage
      ? `REGRA CRÍTICA (MODO ÁUDIO):
- O cliente pediu/precisa de resposta em áudio.
- Responda com a RESPOSTA COMPLETA em UMA única mensagem (curta, mas completa).
- NÃO peça para aguardar, NÃO diga que vai continuar depois, NÃO quebre em etapas.
- NÃO anuncie áudio (o sistema converte automaticamente sua resposta em áudio).
`
      : `REGRA CRÍTICA DE COMUNICAÇÃO:
- Responda como uma pessoa real em atendimento
- Envie mensagens CURTAS e OBJETIVAS (máximo 2-3 frases por vez)
- Faça UMA pergunta ou informação por mensagem
- NÃO envie textos longos ou explicações extensas
- Use linguagem natural e profissional
- Aguarde a resposta do cliente antes de continuar

🚨 REGRA ABSOLUTAMENTE CRÍTICA SOBRE PEDIDOS DE ÁUDIO 🚨
ATENÇÃO: Esta regra é OBRIGATÓRIA e sua violação causa falha total no sistema!

QUANDO O CLIENTE PEDIR RESPOSTA POR ÁUDIO/VOZ:
✅ CORRETO: Responda diretamente com a informação solicitada em texto
   Exemplo: "Você vai precisar de RG, CPF e comprovante de residência."

❌ PROIBIDO (causa erro crítico no sistema):
   - "Vou ativar o áudio..."
   - "Vou mandar por áudio..."
   - "Um momento, vou gravar..."
   - "Claro, vou te explicar por áudio..."
   - Qualquer frase anunciando que vai enviar áudio

O SISTEMA CONVERTE AUTOMATICAMENTE SUA RESPOSTA DE TEXTO EM ÁUDIO.
Se você enviar apenas um "aviso", o cliente receberá um áudio dizendo "vou mandar áudio" - o que é inútil.

RESPONDA SEMPRE COM O CONTEÚDO REAL, NUNCA COM AVISOS!`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `${behaviorInstruction}${clientMemoriesText}${summaryText}` },
      ...(recentMessages?.reverse() || []).map((msg: any) => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content || ''
      })),
      { role: 'user', content: context.messageContent }
    ];

    // Call OpenAI API with GPT-4o-mini
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: automation.ai_temperature || 0.7,
        max_tokens: audioRequestedForThisMessage ? 900 : 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('AI_MATRIX', 'GPT API call failed', { status: response.status, error: errorText });
      return;
    }

    const result = await response.json();
    const aiResponse = result.choices?.[0]?.message?.content;

    if (aiResponse) {
      logDebug('AI_MATRIX', 'GPT response received', { 
        responseLength: aiResponse.length,
        automationId: automation.id 
      });

      // CRITICAL: Record AI conversation usage (1 per conversation per billing period)
      await recordAIConversationUsage(
        supabaseClient,
        context.lawFirmId,
        context.conversationId,
        automation.id,
        automation.name
      );

      // Get voice configuration from automation trigger_config
      const triggerConfig = automation.trigger_config as Record<string, unknown> | null;
      const voiceConfig: VoiceConfig = {
        enabled: Boolean(triggerConfig?.voice_enabled),
        voiceId: (triggerConfig?.voice_id as string) || 'shimmer',
      };

      logDebug('AI_MATRIX', 'Voice config', { voiceConfig });

      // Send the response back to WhatsApp (with optional voice)
      await sendAIResponseToWhatsApp(supabaseClient, context, aiResponse, voiceConfig);

      // Log the AI processing
      await supabaseClient
        .from('webhook_logs')
        .insert({
          automation_id: automation.id,
          direction: 'internal',
          payload: {
            provider: 'gpt',
            plan_type: aiConfig.planType,
            automation_name: automation.name,
            conversation_id: context.conversationId,
            message: context.messageContent,
            model: 'gpt-4o-mini',
            response_sent: true,
          },
          status_code: 200,
        });
    }

  } catch (error) {
    logDebug('AI_MATRIX', 'Error processing with GPT', { error: error instanceof Error ? error.message : error });
  }
}

// Process automations - RESPECTS AI MATRIX BY PLAN (NO OVERRIDE ALLOWED)
async function processAutomations(supabaseClient: any, context: AutomationContext) {
  // Get AI configuration based on PLAN MATRIX
  const aiConfig = await getAIProviderConfig(supabaseClient, context.lawFirmId);
  
  logDebug('AI_MATRIX', `Routing conversation based on plan matrix`, {
    planType: aiConfig.planType,
    conversationAI: aiConfig.conversationAI,
    hasOpenAIKey: Boolean(aiConfig.openaiApiKey)
  });

  // Route to correct AI based on PLAN (no manual override allowed)
  switch (aiConfig.conversationAI) {
    case 'gemini':
      // Starter plan -> Gemini via Lovable AI Gateway
      logDebug('AI_MATRIX', 'STARTER PLAN -> Routing to GEMINI');
      await processWithGemini(supabaseClient, context, aiConfig);
      break;
      
    case 'gpt':
      // Professional/Enterprise plan -> GPT via OpenAI
      logDebug('AI_MATRIX', 'PROFESSIONAL/ENTERPRISE PLAN -> Routing to GPT');
      await processWithGPT(supabaseClient, context, aiConfig);
      break;
      
    default:
      // Fallback to Gemini (should never happen)
      logDebug('AI_MATRIX', 'Unknown AI type, defaulting to Gemini');
      await processWithGemini(supabaseClient, context, aiConfig);
  }
}

// (N8N routing removed - using AI Matrix only)

// Evaluate if automation rules match the message context
function evaluateAutomationRules(automation: any, context: AutomationContext): boolean {
  const config = automation.trigger_config || {};
  const triggerType = automation.trigger_type;

  // Default: trigger on all new messages if no specific config
  if (!triggerType || triggerType === 'new_message') {
    // Check keyword filters if configured
    if (config.keywords && Array.isArray(config.keywords) && config.keywords.length > 0) {
      const messageText = context.messageContent.toLowerCase();
      const hasKeyword = config.keywords.some((keyword: string) => 
        messageText.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Check message type filter
    if (config.message_types && Array.isArray(config.message_types) && config.message_types.length > 0) {
      if (!config.message_types.includes(context.messageType)) return false;
    }

    // Check first message only filter
    if (config.first_message_only) {
      // This would require additional DB query to check if this is the first message
      // For now, we skip this check and let N8N handle it
    }

    return true;
  }

  // Trigger type: keyword match
  if (triggerType === 'keyword_match') {
    if (!config.keywords || !Array.isArray(config.keywords)) return false;
    const messageText = context.messageContent.toLowerCase();
    return config.keywords.some((keyword: string) => 
      messageText.includes(keyword.toLowerCase())
    );
  }

  // Trigger type: media received
  if (triggerType === 'media_received') {
    const mediaTypes = ['image', 'audio', 'video', 'document'];
    return mediaTypes.includes(context.messageType);
  }

  // Trigger type: first contact
  if (triggerType === 'first_contact') {
    // Always trigger for new contacts - N8N can verify if it's actually first
    return true;
  }

  return true;
}

// Update instance with last webhook event info
async function updateInstanceWebhookEvent(
  supabaseClient: any,
  instanceId: string,
  eventName: string
) {
  logDebug('DIAG', `Updating last_webhook_event to "${eventName}" for instance ${instanceId}`);
  
  const { error } = await supabaseClient
    .from('whatsapp_instances')
    .update({
      last_webhook_event: eventName,
      last_webhook_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', instanceId);

  if (error) {
    logDebug('DIAG', `Failed to update last_webhook_event (non-fatal)`, error);
  } else {
    logDebug('DIAG', `Successfully updated last_webhook_event`);
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  logDebug('REQUEST', `Received ${req.method} request`, { requestId });
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    logDebug('REQUEST', `Rejected non-POST request: ${req.method}`, { requestId });
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawBody = await req.text();
    logDebug('PAYLOAD', `Raw body length: ${rawBody.length} chars`, { requestId });
    logDebug('PAYLOAD', `First 800 chars: ${rawBody.substring(0, 800)}`, { requestId });
    
    let body: EvolutionEvent;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      logDebug('ERROR', `Failed to parse JSON`, { requestId, error: parseError });
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const normalizedEvent = normalizeEventName(body.event);
    logDebug('EVENT', `Received event`, { 
      requestId, 
      event: body.event, 
      normalized: normalizedEvent, 
      instance: body.instance,
      destination: body.destination,
      server_url: body.server_url
    });

    // Find the WhatsApp instance by instance_name
    logDebug('DB', `Looking up instance: ${body.instance}`, { requestId });
    
    const { data: instance, error: instanceError } = await supabaseClient
      .from('whatsapp_instances')
      .select('*, law_firms(id, name), default_department_id, default_status_id, default_assigned_to')
      .eq('instance_name', body.instance)
      .single();

    if (instanceError || !instance) {
      logDebug('DB', `Instance not found: ${body.instance}`, { requestId, error: instanceError });
      // Return 200 to avoid Evolution API retrying
      return new Response(
        JSON.stringify({ success: true, message: 'Instance not found, event ignored' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logDebug('DB', `Found instance`, { 
      requestId, 
      instanceId: instance.id, 
      lawFirmId: instance.law_firm_id,
      instanceName: instance.instance_name,
      defaultDepartment: instance.default_department_id,
      defaultStatus: instance.default_status_id,
      defaultAssigned: instance.default_assigned_to
    });
    
    const lawFirmId = instance.law_firm_id;

    // Update last webhook event for diagnostics
    await updateInstanceWebhookEvent(supabaseClient, instance.id, body.event);

    // Handle events (support both formats: CONNECTION_UPDATE and connection.update)
    switch (normalizedEvent) {
      case 'connection.update': {
        const data = body.data as ConnectionUpdateData;
        logDebug('CONNECTION', `Connection state update`, { requestId, state: data.state, statusReason: data.statusReason });
        
        let dbStatus = 'disconnected';
        if (data.state === 'open') {
          dbStatus = 'connected';
        } else if (data.state === 'connecting' || data.state === 'qr') {
          dbStatus = 'connecting';
        } else if (data.state === 'close') {
          dbStatus = 'disconnected';
        }

        // Build update payload
        const updatePayload: Record<string, unknown> = { 
          status: dbStatus, 
          updated_at: new Date().toISOString() 
        };

        // When connected, fetch and store phone number if missing
        if (dbStatus === 'connected' && !instance.phone_number && instance.api_key && instance.api_url) {
          logDebug('CONNECTION', `Fetching phone number for newly connected instance`, { requestId });
          try {
            const phoneNumber = await fetchConnectedPhoneNumber(
              instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, ''),
              instance.api_key,
              instance.instance_name
            );
            if (phoneNumber) {
              updatePayload.phone_number = phoneNumber;
              logDebug('CONNECTION', `Phone number fetched: ${phoneNumber}`, { requestId });
            }
          } catch (e) {
            logDebug('CONNECTION', `Failed to fetch phone number (non-fatal): ${e}`, { requestId });
          }
        }

        // Update instance status
        const { error: updateError } = await supabaseClient
          .from('whatsapp_instances')
          .update(updatePayload)
          .eq('id', instance.id);

        if (updateError) {
          logDebug('ERROR', `Failed to update status`, { requestId, error: updateError });
        } else {
          logDebug('CONNECTION', `Updated instance status to ${dbStatus}`, { requestId });
        }
        break;
      }

      case 'qrcode.updated': {
        logDebug('QRCODE', `QR code updated for instance`, { requestId, instance: body.instance });
        
        // Update status to connecting/awaiting_qr
        await supabaseClient
          .from('whatsapp_instances')
          .update({ 
            status: 'connecting', 
            updated_at: new Date().toISOString() 
          })
          .eq('id', instance.id);
        break;
      }

      case 'messages.upsert': {
        const data = body.data as MessageData;
        logDebug('MESSAGE', `New message received`, { 
          requestId, 
          remoteJid: data.key?.remoteJid, 
          fromMe: data.key?.fromMe,
          messageId: data.key?.id,
          pushName: data.pushName,
          messageType: data.messageType
        });
        
        if (!data.key?.remoteJid) {
          logDebug('MESSAGE', `No remoteJid in message, skipping`, { requestId });
          break;
        }

        // Extract phone number from remoteJid (format: 5511999999999@s.whatsapp.net)
        const remoteJid = data.key.remoteJid;
        const phoneNumber = remoteJid.split('@')[0];
        const isFromMe = data.key.fromMe;

        logDebug('MESSAGE', `Processing message`, { requestId, phoneNumber, isFromMe });

        // Get or create conversation
        logDebug('DB', `Looking up conversation for remote_jid: ${remoteJid}`, { requestId });
        
        let { data: conversation, error: convError } = await supabaseClient
          .from('conversations')
          .select('*')
          .eq('remote_jid', remoteJid)
          .eq('law_firm_id', lawFirmId)
          .single();

        if (convError && convError.code === 'PGRST116') {
          // Conversation doesn't exist, create it
          // IMPORTANT: Only trust pushName for inbound messages. For outbound (fromMe), pushName is usually our own name.
          const contactName = (!isFromMe && data.pushName) ? data.pushName : phoneNumber;
          logDebug('DB', `Creating new conversation for: ${contactName}`, { requestId });
          
          // Use instance defaults for handler
          const defaultHandler = instance.default_assigned_to ? 'human' : 'ai';
          
          const { data: newConv, error: createError } = await supabaseClient
            .from('conversations')
            .insert({
              law_firm_id: lawFirmId,
              remote_jid: remoteJid,
              contact_name: contactName,
              contact_phone: phoneNumber,
              status: 'novo_contato',
              current_handler: defaultHandler,
              assigned_to: instance.default_assigned_to || null,
              department_id: instance.default_department_id || null,
              whatsapp_instance_id: instance.id,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (createError) {
            logDebug('ERROR', `Failed to create conversation`, { requestId, error: createError });
            break;
          }
          conversation = newConv;
          logDebug('DB', `Created new conversation with defaults`, { 
            requestId, 
            conversationId: conversation.id,
            assignedTo: instance.default_assigned_to,
            departmentId: instance.default_department_id,
            handler: defaultHandler
          });
          
          // Also create/update the client with default department and status
          const { data: existingClient } = await supabaseClient
            .from('clients')
            .select('id')
            .eq('phone', phoneNumber)
            .eq('law_firm_id', lawFirmId)
            .maybeSingle();
          
          if (!existingClient) {
            // Create new client with instance defaults
            const { data: newClient, error: clientError } = await supabaseClient
              .from('clients')
              .insert({
                law_firm_id: lawFirmId,
                name: contactName,
                phone: phoneNumber,
                department_id: instance.default_department_id || null,
                custom_status_id: instance.default_status_id || null,
              })
              .select()
              .single();
            
            if (clientError) {
              logDebug('ERROR', `Failed to create client`, { requestId, error: clientError });
            } else {
              logDebug('DB', `Created new client with defaults`, { 
                requestId, 
                clientId: newClient.id,
                departmentId: instance.default_department_id,
                statusId: instance.default_status_id
              });
              
              // Link client to conversation
              await supabaseClient
                .from('conversations')
                .update({ client_id: newClient.id })
                .eq('id', conversation.id);
            }
          } else {
            // Link existing client to conversation
            await supabaseClient
              .from('conversations')
              .update({ client_id: existingClient.id })
              .eq('id', conversation.id);
          }
        } else if (convError) {
          logDebug('ERROR', `Error fetching conversation`, { requestId, error: convError });
          break;
        } else {
          logDebug('DB', `Found existing conversation`, { requestId, conversationId: conversation.id });
        }

        // Extract message content
        let messageContent = '';
        let messageType = 'text';
        let mediaUrl = '';
        let mediaMimeType = '';

        if (data.message?.conversation) {
          messageContent = data.message.conversation;
        } else if (data.message?.extendedTextMessage?.text) {
          messageContent = data.message.extendedTextMessage.text;
        } else if (data.message?.imageMessage) {
          messageType = 'image';
          messageContent = data.message.imageMessage.caption || '';
          mediaUrl = data.message.imageMessage.url || '';
          mediaMimeType = data.message.imageMessage.mimetype || 'image/jpeg';
        } else if (data.message?.audioMessage) {
          messageType = 'audio';
          mediaUrl = data.message.audioMessage.url || '';
          mediaMimeType = data.message.audioMessage.mimetype || 'audio/ogg';
          
          // Transcribe audio for AI processing ONLY if handler is AI
          // If human handler, user can manually transcribe via button in chat
          const shouldAutoTranscribe = !data.key.fromMe && conversation?.current_handler === 'ai';
          
          if (shouldAutoTranscribe) {
            try {
              logDebug('AUDIO', 'Attempting to transcribe audio for AI (handler is AI)', { requestId, messageId: data.key.id });
              
              // Get audio via Evolution API
              const evolutionBaseUrlRaw = Deno.env.get('EVOLUTION_BASE_URL') ?? '';
              // Normalize to avoid double-slashes when building endpoint URLs
              const evolutionBaseUrl = evolutionBaseUrlRaw.replace(/\/+$/, '');
              const evolutionApiKey = Deno.env.get('EVOLUTION_GLOBAL_API_KEY') ?? '';
              
              logDebug('AUDIO', 'Evolution API config', { 
                requestId, 
                hasBaseUrl: !!evolutionBaseUrl, 
                hasApiKey: !!evolutionApiKey,
                instanceName: instance.instance_name
              });
              
              if (evolutionBaseUrl && evolutionApiKey && instance.instance_name) {
                const mediaUrl = `${evolutionBaseUrl}/chat/getBase64FromMediaMessage/${instance.instance_name}`;
                logDebug('AUDIO', 'Fetching media from Evolution', { requestId, url: mediaUrl });
                
                const mediaResponse = await fetch(mediaUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionApiKey,
                  },
                  body: JSON.stringify({
                    message: { key: data.key, message: data.message },
                    convertToMp4: false,
                  }),
                });

                logDebug('AUDIO', 'Evolution media response', { 
                  requestId, 
                  status: mediaResponse.status,
                  ok: mediaResponse.ok
                });

                if (mediaResponse.ok) {
                  const mediaData = await mediaResponse.json();
                  const audioBase64 = mediaData.base64;

                  logDebug('AUDIO', 'Media data received', { 
                    requestId, 
                    hasBase64: !!audioBase64,
                    base64Length: audioBase64?.length || 0
                  });

                  if (audioBase64) {
                    // Call transcribe-audio edge function
                    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
                    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
                    
                    logDebug('AUDIO', 'Calling transcribe-audio function', { requestId });
                    
                    const transcribeResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                      },
                      body: JSON.stringify({
                        audioBase64: audioBase64,
                        mimeType: mediaMimeType,
                      }),
                    });

                    logDebug('AUDIO', 'Transcribe response', { 
                      requestId, 
                      status: transcribeResponse.status,
                      ok: transcribeResponse.ok
                    });

                    if (transcribeResponse.ok) {
                      const transcribeResult = await transcribeResponse.json();
                      logDebug('AUDIO', 'Transcribe result', { 
                        requestId, 
                        hasTranscription: !!transcribeResult.transcription,
                        success: transcribeResult.success
                      });
                      
                      if (transcribeResult.transcription) {
                        messageContent = `[Áudio transcrito]: ${transcribeResult.transcription}`;
                        logDebug('AUDIO', 'Audio transcribed successfully', { 
                          requestId, 
                          transcriptionLength: transcribeResult.transcription.length 
                        });
                      }
                    } else {
                      const errorText = await transcribeResponse.text();
                      logDebug('AUDIO', 'Transcription failed', { 
                        requestId, 
                        status: transcribeResponse.status,
                        error: errorText
                      });
                    }
                  }
                } else {
                  const errorText = await mediaResponse.text();
                  logDebug('AUDIO', 'Evolution media fetch failed', { 
                    requestId, 
                    status: mediaResponse.status,
                    error: errorText
                  });
                }
              } else {
                logDebug('AUDIO', 'Missing Evolution API config', { requestId });
              }
            } catch (transcribeError) {
              logDebug('AUDIO', 'Error transcribing audio', { 
                requestId, 
                error: transcribeError instanceof Error ? transcribeError.message : transcribeError 
              });
            }
          }
        } else if (data.message?.videoMessage) {
          messageType = 'video';
          messageContent = data.message.videoMessage.caption || '';
          mediaUrl = data.message.videoMessage.url || '';
          mediaMimeType = data.message.videoMessage.mimetype || 'video/mp4';
        } else if (data.message?.documentMessage) {
          messageType = 'document';
          messageContent = data.message.documentMessage.fileName || '';
          mediaUrl = data.message.documentMessage.url || '';
          mediaMimeType = data.message.documentMessage.mimetype || 'application/octet-stream';
        }

        logDebug('MESSAGE', `Message content extracted`, { 
          requestId, 
          contentLength: messageContent.length,
          contentPreview: messageContent.substring(0, 100),
          type: messageType,
          hasMedia: !!mediaUrl
        });

        // Save message (avoid duplicates - webhook may retry and fromMe messages can come back after we already inserted)
        logDebug('DB', `Saving message to database`, { requestId, messageId: data.key.id });

        // If this whatsapp_message_id already exists for this conversation, skip
        const { data: existingMsg } = await supabaseClient
          .from('messages')
          .select('id')
          .eq('conversation_id', conversation.id)
          .eq('whatsapp_message_id', data.key.id)
          .maybeSingle();

        if (existingMsg?.id) {
          logDebug('MESSAGE', `Duplicate message ignored (already exists)`, { requestId, messageId: data.key.id, dbMessageId: existingMsg.id });
          break;
        }

        const { data: savedMessage, error: msgError } = await supabaseClient
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            whatsapp_message_id: data.key.id,
            content: messageContent,
            message_type: messageType,
            media_url: mediaUrl || null,
            media_mime_type: mediaMimeType || null,
            is_from_me: isFromMe,
            sender_type: isFromMe ? 'system' : 'client',
            ai_generated: false,
          })
          .select()
          .single();

        if (msgError) {
          logDebug('ERROR', `Failed to save message`, { requestId, error: msgError, code: msgError.code });
        } else {
          logDebug('MESSAGE', `Message saved successfully`, { requestId, dbMessageId: savedMessage?.id, whatsappId: data.key.id });
        }

        // Update conversation last_message_at
        // IMPORTANT: Do NOT overwrite contact_name on outbound messages (fromMe), because pushName is our own display name.
        const { error: updateConvError } = await supabaseClient
          .from('conversations')
          .update({ 
            last_message_at: new Date().toISOString(),
            contact_name: !isFromMe ? (data.pushName || conversation.contact_name) : conversation.contact_name,
          })
          .eq('id', conversation.id);

        if (updateConvError) {
          logDebug('ERROR', `Failed to update conversation last_message_at`, { requestId, error: updateConvError });
        } else {
          logDebug('DB', `Updated conversation last_message_at`, { requestId, conversationId: conversation.id });
        }

        // ==== AUTOMATION: Check and forward to N8N if rules match ====
        // IMPORTANT: Only trigger automations if:
        // 1. Message is NOT from us (external message from client)
        // 2. The conversation handler is set to 'ai' (not 'human')
        // 
        // RE-FETCH the conversation to get the LATEST handler value
        // This prevents race conditions where handler was changed to 'human'
        // but the cached conversation object still shows 'ai'
        if (!isFromMe && savedMessage) {
          const { data: freshConversation } = await supabaseClient
            .from('conversations')
            .select('current_handler')
            .eq('id', conversation.id)
            .single();
          
          const currentHandler = freshConversation?.current_handler || conversation.current_handler;
          const shouldTriggerAutomation = currentHandler === 'ai';
          
          if (shouldTriggerAutomation) {
            logDebug('AUTOMATION', `Triggering automation - handler is AI`, { requestId, handler: currentHandler });
            await processAutomations(supabaseClient, {
              lawFirmId,
              conversationId: conversation.id,
              messageContent,
              messageType,
              contactName: data.pushName || phoneNumber,
              contactPhone: phoneNumber,
              remoteJid,
              instanceId: instance.id,
              instanceName: instance.instance_name,
              clientId: conversation.client_id || undefined, // Pass clientId for memory support
            });
          } else {
            logDebug('AUTOMATION', `Skipping automation - handler is human`, { requestId, handler: currentHandler });
          }
        }

        break;
      }

      case 'messages.update': {
        // Handle ACK events - message delivery/read status
        const data = body.data as MessageAckData | MessageAckData[];
        logDebug('ACK', `Message update/ACK event received`, { requestId, data });

        // Normalize to array (Evolution API can send single or array)
        const ackMessages = Array.isArray(data) ? data : [data];

        for (const ackData of ackMessages) {
          // Get message ID and ack status
          const messageId = ackData.id || ackData.key?.id;
          const ack = ackData.ack ?? (ackData.status === 'READ' ? 4 : ackData.status === 'DELIVERY_ACK' ? 3 : null);

          if (!messageId) {
            logDebug('ACK', `No message ID in ACK data, skipping`, { requestId });
            continue;
          }

          logDebug('ACK', `Processing ACK for message`, { requestId, messageId, ack, status: ackData.status });

          // ACK values: 0=error, 1=pending, 2=sent, 3=delivered, 4=read, 5=played
          if (ack === 3 || ackData.status === 'DELIVERY_ACK') {
            // Message delivered (2 grey ticks)
            // We don't have a delivery_at column, so we'll use a workaround:
            // If read_at is null and it's delivered, that means it's delivered but not read
            // The frontend checks status prop for 'delivered'
            logDebug('ACK', `Message delivered: ${messageId}`, { requestId });
            
            // We could add a delivered_at column, but for now we'll just log it
            // The frontend will get UPDATE events via realtime
          } else if (ack === 4 || ack === 5 || ackData.status === 'READ') {
            // Message read (2 blue ticks)
            logDebug('ACK', `Marking message as read: ${messageId}`, { requestId });

            const { error: updateError } = await supabaseClient
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('whatsapp_message_id', messageId);

            if (updateError) {
              logDebug('ERROR', `Failed to update message read status`, { requestId, error: updateError });
            } else {
              logDebug('ACK', `Message marked as read successfully`, { requestId, messageId });
            }
          }
        }
        break;
      }

      case 'message.ack':
      case 'messages.ack': {
        // Alternative ACK event format
        const data = body.data as MessageAckData | MessageAckData[];
        logDebug('ACK', `Message ACK event received`, { requestId, data });

        const ackMessages = Array.isArray(data) ? data : [data];

        for (const ackData of ackMessages) {
          const messageId = ackData.id || ackData.key?.id;
          const ack = ackData.ack;

          if (!messageId || ack === undefined) {
            logDebug('ACK', `Missing message ID or ack value, skipping`, { requestId });
            continue;
          }

          logDebug('ACK', `Processing ACK`, { requestId, messageId, ack });

          if (ack >= 4) {
            // Read or played
            const { error } = await supabaseClient
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('whatsapp_message_id', messageId);

            if (error) {
              logDebug('ERROR', `Failed to update read status`, { requestId, error });
            } else {
              logDebug('ACK', `Message marked as read`, { requestId, messageId });
            }
          }
        }
        break;
      }

      case 'messages.delete': {
        logDebug('MESSAGE', `Message delete event received`, { requestId, data: body.data });
        break;
      }

      case 'send.message': {
        logDebug('MESSAGE', `Send message event received`, { requestId, data: body.data });
        break;
      }

      default:
        logDebug('EVENT', `Unhandled event`, { requestId, event: body.event, normalized: normalizedEvent });
    }

    // Log webhook event for auditing
    try {
      await supabaseClient
        .from('webhook_logs')
        .insert({
          direction: 'incoming',
          payload: body as unknown as Record<string, unknown>,
          status_code: 200,
        });
      logDebug('AUDIT', `Webhook logged successfully`, { requestId });
    } catch (logError) {
      logDebug('AUDIT', `Failed to log webhook (non-fatal)`, { requestId, error: logError });
    }

    logDebug('REQUEST', `Request completed successfully`, { requestId, event: body.event });

    return new Response(
      JSON.stringify({ success: true, event: body.event, requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logDebug('ERROR', `Unhandled error`, { error: error instanceof Error ? error.message : error });
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 200, // Return 200 to avoid Evolution API retrying on parse errors
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});