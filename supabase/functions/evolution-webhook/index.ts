import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { humanDelay, messageSplitDelay, DELAY_CONFIG } from "../_shared/human-delay.ts";

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
};

// Webhook token for security validation
const WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN");

/**
 * Validate webhook request using token from header OR query string.
 * Supports: x-webhook-token header, x-evolution-token header, or ?token= query param.
 * Returns error response if invalid, null if valid.
 */
function validateWebhookToken(req: Request): Response | null {
  // SECURITY: Token validation is REQUIRED - FAIL CLOSED
  if (!WEBHOOK_TOKEN) {
    console.error("[WEBHOOK_SECURITY] ❌ CRITICAL: EVOLUTION_WEBHOOK_TOKEN not configured - blocking all requests!");
    return new Response(
      JSON.stringify({ error: "Webhook authentication not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  // Extract token from multiple sources (header or query string)
  const url = new URL(req.url);
  const headerToken = req.headers.get("x-webhook-token") || req.headers.get("x-evolution-token");
  const queryToken = url.searchParams.get("token");
  const providedToken = headerToken ?? queryToken;
  
  if (!providedToken) {
    console.warn("[WEBHOOK_SECURITY] ❌ Request rejected - no token provided (header or query)", {
      timestamp: new Date().toISOString(),
      user_agent: req.headers.get("user-agent"),
    });
    return new Response(
      JSON.stringify({ error: "Unauthorized - missing webhook token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  if (providedToken !== WEBHOOK_TOKEN) {
    console.warn("[WEBHOOK_SECURITY] ❌ Request rejected - invalid webhook token", {
      timestamp: new Date().toISOString(),
      token_source: headerToken ? "header" : "query",
      token_prefix: providedToken.substring(0, 4) + "...",
    });
    return new Response(
      JSON.stringify({ error: "Unauthorized - invalid webhook token" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  console.log("[WEBHOOK_SECURITY] ✅ Token validated", { source: headerToken ? "header" : "query" });
  return null; // Valid
}

// Helper to get current billing period in YYYY-MM format
function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Record TTS audio usage for billing.
 * Estimates duration based on text length (avg 150 words/min, 5 chars/word = 750 chars/min)
 * @param textLength - Length of text that was converted to speech
 * @returns Estimated duration in seconds
 */
function estimateAudioDuration(textLength: number): number {
  // Average speaking rate: ~150 words per minute
  // Average word length: ~5 characters
  // So approximately 750 characters per minute = 12.5 chars per second
  const CHARS_PER_SECOND = 12.5;
  return Math.ceil(textLength / CHARS_PER_SECOND);
}

/**
 * Record TTS audio usage for billing purposes.
 * Each audio generated is recorded with its duration in seconds.
 */
async function recordTTSUsage(
  supabaseClient: any,
  lawFirmId: string,
  conversationId: string,
  textLength: number,
  voiceId: string,
  voiceSource: string
): Promise<boolean> {
  const billingPeriod = getCurrentBillingPeriod();
  const durationSeconds = estimateAudioDuration(textLength);
  
  try {
    const { error } = await supabaseClient
      .from('usage_records')
      .insert({
        law_firm_id: lawFirmId,
        usage_type: 'tts_audio',
        count: 1,
        duration_seconds: durationSeconds,
        billing_period: billingPeriod,
        metadata: {
          conversation_id: conversationId,
          text_length: textLength,
          voice_id: voiceId,
          voice_source: voiceSource,
          generated_at: new Date().toISOString(),
        }
      });
    
    if (error) {
      logDebug('USAGE_TRACKING', 'Failed to record TTS usage', { error, lawFirmId });
      return false;
    }
    
    logDebug('USAGE_TRACKING', 'TTS usage recorded', { 
      lawFirmId,
      durationSeconds,
      textLength,
      voiceId,
      billingPeriod 
    });
    return true;
  } catch (err) {
    logDebug('USAGE_TRACKING', 'Error recording TTS usage', { error: err instanceof Error ? err.message : err });
    return false;
  }
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

/**
 * Log AI transfer/assignment for audit purposes.
 * Records when an AI agent is assigned to a conversation.
 */
async function logAITransfer(
  supabaseClient: any,
  lawFirmId: string,
  conversationId: string,
  fromAgentId: string | null,
  toAgentId: string,
  toAgentName: string,
  transferType: 'manual' | 'auto_assignment' | 'escalation',
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    // Get from agent name if exists
    let fromAgentName: string | null = null;
    if (fromAgentId) {
      const { data: fromAgent } = await supabaseClient
        .from('automations')
        .select('name')
        .eq('id', fromAgentId)
        .single();
      fromAgentName = fromAgent?.name || null;
    }

    await supabaseClient.from('ai_transfer_logs').insert({
      law_firm_id: lawFirmId,
      conversation_id: conversationId,
      from_agent_id: fromAgentId,
      to_agent_id: toAgentId,
      from_agent_name: fromAgentName,
      to_agent_name: toAgentName,
      transferred_by: null, // System/automatic
      transferred_by_name: null,
      transfer_type: transferType,
      reason: transferType === 'auto_assignment' ? 'First AI assignment based on instance/company default' : null,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[AI_TRANSFER] ${transferType.toUpperCase()}`, JSON.stringify({
      conversation_id: conversationId,
      from_agent: fromAgentId,
      from_agent_name: fromAgentName,
      to_agent: toAgentId,
      to_agent_name: toAgentName,
      transfer_type: transferType,
    }));
  } catch (error) {
    console.warn(`[AI_TRANSFER] Failed to log transfer`, JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      conversation_id: conversationId,
    }));
  }
}

/**
 * Resolve which automation to use for a conversation.
 * Priority order:
 * 1. Conversation's current_automation_id (highest - transfer or previous assignment)
 * 2. WhatsApp instance default_automation_id
 * 3. Company-wide default_automation_id from law_firm_settings
 * 
 * IMPORTANT: NO FALLBACK TO "FIRST ACTIVE" - explicit configuration required.
 */
// ============================================================================
// CRITICAL: AI ISOLATION - CANONICAL IDENTITY RESOLUTION
// ============================================================================
// This function resolves which AI agent should handle a conversation.
// 
// SECURITY RULES (MANDATORY):
// 1. NO FALLBACK TO "FIRST ACTIVE" - This was causing cross-AI contamination
// 2. EXPLICIT CONFIGURATION REQUIRED - Either instance or company default must be set
// 3. STRICT TENANT ISOLATION - Automation MUST belong to the same law_firm_id
// 4. AUDIT TRAIL - Every resolution is logged with full identity context
// 5. PROMPT IS THE AI'S - The prompt used is ALWAYS from the resolved AI, never cached
// ============================================================================

interface AutomationIdentity {
  id: string;
  ai_prompt: string;
  ai_temperature: number | null;
  name: string;
  trigger_config: any;
  version: number;
  updated_at: string;
  law_firm_id: string;
  // Canonical identity fields for audit
  // Priority: conversation_transfer > whatsapp_instance > law_firm_settings
  resolved_from: 'conversation_transfer' | 'whatsapp_instance' | 'law_firm_settings';
  resolution_timestamp: string;
}

async function resolveAutomationForConversation(
  supabaseClient: any,
  lawFirmId: string,
  conversationId: string
): Promise<AutomationIdentity | null> {
  const resolutionTimestamp = new Date().toISOString();
  
  try {
    // ========================================================================
    // Step 1: Get conversation to find whatsapp_instance_id AND current_automation_id
    // ========================================================================
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('whatsapp_instance_id, current_automation_id')
      .eq('id', conversationId)
      .single();

    console.log(`[AI_ISOLATION] 🔍 DEBUG - Conversation lookup`, JSON.stringify({
      conversation_id: conversationId,
      conversation_found: !!conversation,
      conversation_error: convError?.message || null,
      current_automation_id: conversation?.current_automation_id || null,
      whatsapp_instance_id: conversation?.whatsapp_instance_id || null,
    }));

    // ========================================================================
    // Step 2: HIGHEST PRIORITY - Check if conversation has a specific automation assigned
    // This happens when a conversation is transferred to a specific AI agent
    // ========================================================================
    if (conversation?.current_automation_id) {
      console.log(`[AI_ISOLATION] 🔍 DEBUG - Priority 1: Looking up automation from conversation`, JSON.stringify({
        automation_id: conversation.current_automation_id,
      }));
      
      // Use maybeSingle instead of single to avoid throwing on no match
      const { data: automation, error: autoError } = await supabaseClient
        .from('automations')
        .select('id, ai_prompt, ai_temperature, name, trigger_config, version, updated_at, law_firm_id')
        .eq('id', conversation.current_automation_id)
        .eq('is_active', true)
        .maybeSingle();

      console.log(`[AI_ISOLATION] 🔍 DEBUG - Priority 1: Automation query result`, JSON.stringify({
        automation_id: conversation.current_automation_id,
        automation_found: !!automation,
        automation_error: autoError?.message || null,
        automation_name: automation?.name || null,
        automation_law_firm_id: automation?.law_firm_id || null,
        has_ai_prompt: !!automation?.ai_prompt,
        expected_law_firm_id: lawFirmId,
        tenant_match: automation?.law_firm_id === lawFirmId,
        has_prompt: !!automation?.ai_prompt?.trim(),
      }));

      // CRITICAL: Validate tenant isolation - automation must belong to same tenant
      if (automation && automation.law_firm_id === lawFirmId && automation.ai_prompt?.trim()) {
        const identity: AutomationIdentity = {
          ...automation,
          resolved_from: 'conversation_transfer',
          resolution_timestamp: resolutionTimestamp,
        };
        
        // AUDIT LOG: Canonical identity resolved from conversation transfer
        console.log(`[AI_ISOLATION] ✅ RESOLVED - Conversation Transfer (Priority 1)`, JSON.stringify({
          tenant_id: lawFirmId,
          ai_id: automation.id,
          ai_name: automation.name,
          ai_role: automation.trigger_config?.role || 'transferred',
          prompt_version: automation.version,
          prompt_updated_at: automation.updated_at,
          resolved_from: 'conversation_transfer',
          conversation_id: conversationId,
          timestamp: resolutionTimestamp,
        }));
        
        return identity;
      } else if (automation && automation.law_firm_id !== lawFirmId) {
        // SECURITY ALERT: Cross-tenant contamination attempt detected!
        console.error(`[AI_ISOLATION] ❌ SECURITY VIOLATION - Cross-tenant automation in conversation!`, JSON.stringify({
          expected_tenant: lawFirmId,
          automation_tenant: automation.law_firm_id,
          automation_id: automation.id,
          conversation_id: conversationId,
          timestamp: resolutionTimestamp,
        }));
        return null;
      }
      
      // If automation not found or inactive, log and fall through to next priority
      console.warn(`[AI_ISOLATION] ⚠️ Priority 1 FAILED - Automation not found or invalid`, JSON.stringify({
        automation_id: conversation.current_automation_id,
        automation_error: autoError?.message || 'unknown',
        falling_through_to: 'Priority 2 (instance default)',
      }));
    }

    // ========================================================================
    // Step 3: Check if instance has a default automation (SECOND PRIORITY)
    // Used for first contact / new conversations
    // ========================================================================
    if (conversation?.whatsapp_instance_id) {
      const { data: instance, error: instanceError } = await supabaseClient
        .from('whatsapp_instances')
        .select('default_automation_id, instance_name')
        .eq('id', conversation.whatsapp_instance_id)
        .single();

      console.log(`[AI_ISOLATION] 🔍 DEBUG - Instance lookup`, JSON.stringify({
        instance_id: conversation.whatsapp_instance_id,
        instance_found: !!instance,
        instance_error: instanceError?.message || null,
        default_automation_id: instance?.default_automation_id || null,
        instance_name: instance?.instance_name || null,
      }));

      if (instance?.default_automation_id) {
        const { data: automation, error: automationError } = await supabaseClient
          .from('automations')
          .select('id, ai_prompt, ai_temperature, name, trigger_config, version, updated_at, law_firm_id')
          .eq('id', instance.default_automation_id)
          .eq('is_active', true)
          .maybeSingle();

        console.log(`[AI_ISOLATION] 🔍 DEBUG - Priority 2: Automation lookup`, JSON.stringify({
          automation_id: instance.default_automation_id,
          automation_found: !!automation,
          automation_error: automationError?.message || null,
          automation_name: automation?.name || null,
          automation_law_firm_id: automation?.law_firm_id || null,
          has_ai_prompt: !!automation?.ai_prompt,
          expected_law_firm_id: lawFirmId,
          tenant_match: automation?.law_firm_id === lawFirmId,
          has_prompt: !!automation?.ai_prompt?.trim(),
        }));

        // CRITICAL: Validate tenant isolation - automation must belong to same tenant
        if (automation && automation.law_firm_id === lawFirmId && automation.ai_prompt?.trim()) {
          // PERSIST: Save the resolved automation to the conversation for future messages
          // This ensures the same AI handles subsequent messages in this conversation
          const { error: updateError } = await supabaseClient
            .from('conversations')
            .update({ current_automation_id: automation.id })
            .eq('id', conversationId);
          
          if (updateError) {
            console.warn(`[AI_ISOLATION] ⚠️ Failed to persist current_automation_id`, JSON.stringify({
              conversation_id: conversationId,
              automation_id: automation.id,
              error: updateError.message,
            }));
          } else {
            console.log(`[AI_ISOLATION] 💾 PERSISTED - current_automation_id saved`, JSON.stringify({
              conversation_id: conversationId,
              automation_id: automation.id,
              automation_name: automation.name,
            }));

            // LOG AUTO-ASSIGNMENT: First time AI is assigned to this conversation
            await logAITransfer(
              supabaseClient,
              lawFirmId,
              conversationId,
              null, // No previous agent
              automation.id,
              automation.name,
              'auto_assignment',
              {
                resolved_from: 'whatsapp_instance',
                instance_name: instance.instance_name,
              }
            );
          }
          
          const identity: AutomationIdentity = {
            ...automation,
            resolved_from: 'whatsapp_instance',
            resolution_timestamp: resolutionTimestamp,
          };
          
          // AUDIT LOG: Canonical identity resolved
          console.log(`[AI_ISOLATION] ✅ RESOLVED - Instance Default`, JSON.stringify({
            tenant_id: lawFirmId,
            ai_id: automation.id,
            ai_name: automation.name,
            ai_role: automation.trigger_config?.role || 'default',
            prompt_version: automation.version,
            prompt_updated_at: automation.updated_at,
            resolved_from: 'whatsapp_instance',
            instance_name: instance.instance_name,
            conversation_id: conversationId,
            timestamp: resolutionTimestamp,
          }));
          
          return identity;
        } else if (automation && automation.law_firm_id !== lawFirmId) {
          // SECURITY ALERT: Cross-tenant contamination attempt detected!
          console.error(`[AI_ISOLATION] ❌ SECURITY VIOLATION - Cross-tenant automation detected!`, JSON.stringify({
            expected_tenant: lawFirmId,
            automation_tenant: automation.law_firm_id,
            automation_id: automation.id,
            conversation_id: conversationId,
            timestamp: resolutionTimestamp,
          }));
          return null;
        }
      }
    }

    // ========================================================================
    // Step 3: Check company-wide default from law_firm_settings (SECONDARY)
    // ========================================================================
    const { data: settings } = await supabaseClient
      .from('law_firm_settings')
      .select('default_automation_id')
      .eq('law_firm_id', lawFirmId)
      .maybeSingle();

    console.log(`[AI_ISOLATION] 🔍 DEBUG - Priority 3: Law firm settings lookup`, JSON.stringify({
      law_firm_id: lawFirmId,
      settings_found: !!settings,
      default_automation_id: settings?.default_automation_id || null,
    }));

    if (settings?.default_automation_id) {
      const { data: automation, error: settingsAutoError } = await supabaseClient
        .from('automations')
        .select('id, ai_prompt, ai_temperature, name, trigger_config, version, updated_at, law_firm_id')
        .eq('id', settings.default_automation_id)
        .eq('is_active', true)
        .maybeSingle();

      console.log(`[AI_ISOLATION] 🔍 DEBUG - Priority 3: Automation lookup`, JSON.stringify({
        automation_id: settings.default_automation_id,
        automation_found: !!automation,
        automation_error: settingsAutoError?.message || null,
        automation_name: automation?.name || null,
        has_ai_prompt: !!automation?.ai_prompt,
      }));

      // CRITICAL: Validate tenant isolation - automation must belong to same tenant
      if (automation && automation.law_firm_id === lawFirmId && automation.ai_prompt?.trim()) {
        // PERSIST: Save the resolved automation to the conversation for future messages
        const { error: updateError } = await supabaseClient
          .from('conversations')
          .update({ current_automation_id: automation.id })
          .eq('id', conversationId);
        
        if (updateError) {
          console.warn(`[AI_ISOLATION] ⚠️ Failed to persist current_automation_id`, JSON.stringify({
            conversation_id: conversationId,
            automation_id: automation.id,
            error: updateError.message,
          }));
        } else {
          console.log(`[AI_ISOLATION] 💾 PERSISTED - current_automation_id saved`, JSON.stringify({
            conversation_id: conversationId,
            automation_id: automation.id,
            automation_name: automation.name,
          }));

          // LOG AUTO-ASSIGNMENT: First time AI is assigned to this conversation
          await logAITransfer(
            supabaseClient,
            lawFirmId,
            conversationId,
            null, // No previous agent
            automation.id,
            automation.name,
            'auto_assignment',
            {
              resolved_from: 'law_firm_settings',
            }
          );
        }
        
        const identity: AutomationIdentity = {
          ...automation,
          resolved_from: 'law_firm_settings',
          resolution_timestamp: resolutionTimestamp,
        };
        
        // AUDIT LOG: Canonical identity resolved
        console.log(`[AI_ISOLATION] ✅ RESOLVED - Company Default`, JSON.stringify({
          tenant_id: lawFirmId,
          ai_id: automation.id,
          ai_name: automation.name,
          ai_role: automation.trigger_config?.role || 'default',
          prompt_version: automation.version,
          prompt_updated_at: automation.updated_at,
          resolved_from: 'law_firm_settings',
          conversation_id: conversationId,
          timestamp: resolutionTimestamp,
        }));
        
        return identity;
      } else if (automation && automation.law_firm_id !== lawFirmId) {
        // SECURITY ALERT: Cross-tenant contamination attempt detected!
        console.error(`[AI_ISOLATION] ❌ SECURITY VIOLATION - Cross-tenant automation detected!`, JSON.stringify({
          expected_tenant: lawFirmId,
          automation_tenant: automation.law_firm_id,
          automation_id: automation.id,
          conversation_id: conversationId,
          timestamp: resolutionTimestamp,
        }));
        return null;
      }
    }

    // ========================================================================
    // CRITICAL: NO FALLBACK TO "FIRST ACTIVE"
    // ========================================================================
    // This was the root cause of cross-AI contamination.
    // If no explicit automation is configured, we BLOCK execution entirely.
    // The admin MUST configure a default automation for the instance or company.
    // ========================================================================
    
    console.warn(`[AI_ISOLATION] ⚠️ BLOCKED - No explicit automation configured`, JSON.stringify({
      tenant_id: lawFirmId,
      conversation_id: conversationId,
      has_instance: !!conversation?.whatsapp_instance_id,
      has_company_default: !!settings?.default_automation_id,
      resolution: 'BLOCKED_NO_EXPLICIT_CONFIG',
      recommendation: 'Configure default_automation_id in whatsapp_instances or law_firm_settings',
      timestamp: resolutionTimestamp,
    }));
    
    return null;
    
  } catch (error) {
    console.error(`[AI_ISOLATION] ❌ ERROR - Resolution failed`, JSON.stringify({
      tenant_id: lawFirmId,
      conversation_id: conversationId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: resolutionTimestamp,
    }));
    return null;
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

// Context info for quoted/reply messages
interface ContextInfo {
  stanzaId?: string;  // WhatsApp message ID of the quoted message
  participant?: string;
  quotedMessage?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { caption?: string };
    audioMessage?: Record<string, unknown>;
    videoMessage?: { caption?: string };
    documentMessage?: { fileName?: string };
  };
}

// MessageContextInfo - contains quoted message info for some message types
interface MessageContextInfo {
  stanzaId?: string;
  quotedMessage?: Record<string, unknown>;
  deviceListMetadata?: Record<string, unknown>;
  deviceListMetadataVersion?: number;
  messageAddOnDurationInSecs?: number;
  // Additional fields that may contain the stanza ID
  quotedStanzaId?: string;
}

interface MessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  /** Some Evolution payloads provide reply/quote context at this level */
  contextInfo?: ContextInfo;
  message?: {
    conversation?: string;
    messageContextInfo?: MessageContextInfo;
    extendedTextMessage?: {
      text: string;
      contextInfo?: ContextInfo;
    };
    imageMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
      contextInfo?: ContextInfo;
    };
    audioMessage?: {
      url?: string;
      mimetype?: string;
      contextInfo?: ContextInfo;
    };
    videoMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
      contextInfo?: ContextInfo;
    };
    documentMessage?: {
      url?: string;
      mimetype?: string;
      fileName?: string;
      contextInfo?: ContextInfo;
    };
    stickerMessage?: {
      url?: string;
      mimetype?: string;
      contextInfo?: ContextInfo;
    };
  };
  messageType?: string;
  messageTimestamp?: number;
}

// ACK data structure for message status updates
interface MessageAckData {
  remoteJid?: string;
  /** Evolution often sends WhatsApp message id as keyId */
  keyId?: string;
  /** Instance id (maps to whatsapp_instances.id) */
  instanceId?: string;
  /** Evolution internal message id (not our DB message id) */
  messageId?: string;

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
  automationId?: string; // ID of the AI agent handling this conversation
  automationName?: string; // Name of the AI agent for display purposes
}

// =============================================================================
// MESSAGE DEBOUNCE QUEUE - Batches messages before AI processing
// =============================================================================
// When a client sends multiple messages rapidly, we queue them and wait for
// a debounce period before processing. This ensures the AI sees all messages
// as a single context instead of responding to each one individually.

/**
 * Queue a message for AI processing with debounce.
 * If there's already a pending queue item for this conversation, extend the debounce time.
 * Otherwise, create a new queue item.
 */
async function queueMessageForAIProcessing(
  supabaseClient: any,
  context: Omit<AutomationContext, 'automationId' | 'automationName'>,
  debounceSeconds: number,
  requestId: string
): Promise<void> {
  const processAfter = new Date(Date.now() + debounceSeconds * 1000).toISOString();
  const messageData = {
    content: context.messageContent,
    type: context.messageType,
    timestamp: new Date().toISOString(),
  };

  logDebug('DEBOUNCE', `Queueing message for debounced processing`, {
    requestId,
    conversationId: context.conversationId,
    debounceSeconds,
    processAfter,
    messagePreview: context.messageContent.substring(0, 50),
  });

  // Try to update existing pending queue item (extend debounce, add message)
  const { data: existingQueue, error: fetchError } = await supabaseClient
    .from('ai_processing_queue')
    .select('id, messages, message_count')
    .eq('conversation_id', context.conversationId)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchError) {
    logDebug('DEBOUNCE', 'Error fetching existing queue', { requestId, error: fetchError });
  }

  if (existingQueue) {
    // Extend debounce and add message to existing queue
    const existingMessages = existingQueue.messages || [];
    const updatedMessages = [...existingMessages, messageData];
    
    const { error: updateError } = await supabaseClient
      .from('ai_processing_queue')
      .update({
        messages: updatedMessages,
        message_count: existingQueue.message_count + 1,
        last_message_at: new Date().toISOString(),
        process_after: processAfter, // Reset debounce timer
        metadata: {
          contact_name: context.contactName,
          contact_phone: context.contactPhone,
          remote_jid: context.remoteJid,
          instance_id: context.instanceId,
          instance_name: context.instanceName,
          client_id: context.clientId,
        },
      })
      .eq('id', existingQueue.id);

    if (updateError) {
      logDebug('DEBOUNCE', 'Failed to update queue', { requestId, error: updateError });
      // Fallback: process immediately
      await processAutomations(supabaseClient, context as AutomationContext);
    } else {
      logDebug('DEBOUNCE', `Added to existing queue (${updatedMessages.length} messages total)`, {
        requestId,
        queueId: existingQueue.id,
        messageCount: updatedMessages.length,
      });
    }
  } else {
    // Create new queue item
    const { data: newQueue, error: insertError } = await supabaseClient
      .from('ai_processing_queue')
      .insert({
        conversation_id: context.conversationId,
        law_firm_id: context.lawFirmId,
        messages: [messageData],
        message_count: 1,
        process_after: processAfter,
        metadata: {
          contact_name: context.contactName,
          contact_phone: context.contactPhone,
          remote_jid: context.remoteJid,
          instance_id: context.instanceId,
          instance_name: context.instanceName,
          client_id: context.clientId,
        },
      })
      .select('id')
      .single();

    if (insertError) {
      // Could be a race condition - another request created the queue
      if (insertError.code === '23505') { // unique constraint violation
        logDebug('DEBOUNCE', 'Race condition: queue already exists, retrying update', { requestId });
        // Retry as update
        await queueMessageForAIProcessing(supabaseClient, context, debounceSeconds, requestId);
      } else {
        logDebug('DEBOUNCE', 'Failed to create queue', { requestId, error: insertError });
        // Fallback: process immediately
        await processAutomations(supabaseClient, context as AutomationContext);
      }
    } else {
      logDebug('DEBOUNCE', `Created new queue item`, {
        requestId,
        queueId: newQueue?.id,
        processAfter,
      });
    }
  }

  // Trigger async processing check
  // This ensures queued messages get processed even if no more messages arrive
  scheduleQueueProcessing(supabaseClient, context.conversationId, debounceSeconds, requestId);
}

/**
 * Schedule processing of the queue after the debounce period.
 * Uses a non-blocking approach to avoid holding the webhook connection.
 */
/**
 * Schedule processing of the queue after the debounce period.
 * Uses EdgeRuntime.waitUntil when available so the work survives the request lifecycle.
 *
 * IMPORTANT: We do NOT trust the local `debounceSeconds` for scheduling, because
 * the queue's `process_after` can be extended by subsequent messages.
 * Instead, we re-check the DB each attempt and compute the remaining delay.
 */
function scheduleQueueProcessing(
  supabaseClient: any,
  conversationId: string,
  _debounceSeconds: number,
  requestId: string
): void {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runTask = async () => {
    const MAX_ATTEMPTS = 6;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // Always read the current `process_after` from DB (it may have been extended)
        const { data: queueItem, error: fetchError } = await supabaseClient
          .from('ai_processing_queue')
          .select('id, process_after')
          .eq('conversation_id', conversationId)
          .eq('status', 'pending')
          .maybeSingle();

        if (fetchError) {
          logDebug('DEBOUNCE', 'Failsafe scheduler: error fetching queue item', {
            requestId,
            conversationId,
            error: fetchError,
            attempt,
          });
          return;
        }

        // Nothing pending -> nothing to do
        if (!queueItem) {
          return;
        }

        const processAfterMs = new Date(queueItem.process_after).getTime();
        const delayMs = Math.max(0, processAfterMs - Date.now()) + 500;

        logDebug('DEBOUNCE', 'Failsafe scheduler: waiting until process_after', {
          requestId,
          conversationId,
          queueId: queueItem.id,
          attempt,
          delayMs,
        });

        await sleep(delayMs);

        // Try to process now (this function is concurrency-safe via status update)
        await processQueuedMessages(supabaseClient, conversationId, requestId);

        // Loop continues: if new messages arrived and queue is still pending,
        // we'll fetch it again and wait again.
      } catch (error) {
        logDebug('DEBOUNCE', 'Failsafe scheduler: background processing failed', {
          requestId,
          conversationId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        // Small backoff before retrying
        await sleep(1000);
      }
    }

    logDebug('DEBOUNCE', 'Failsafe scheduler: max attempts reached', {
      requestId,
      conversationId,
      maxAttempts: MAX_ATTEMPTS,
    });
  };

  // Prefer EdgeRuntime.waitUntil for reliable background execution in serverless
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === 'function') {
    edgeRuntime.waitUntil(runTask());
    return;
  }

  // Fallback: best-effort setTimeout (still OK in most Deno runtimes)
  try {
    setTimeout(() => {
      void runTask();
    }, 0);
  } catch (_error) {
    logDebug('DEBOUNCE', 'Failsafe scheduler: setTimeout not available', {
      requestId,
      conversationId,
    });
  }
}

/**
 * Process queued messages for a conversation if the debounce period has passed.
 */
async function processQueuedMessages(
  supabaseClient: any,
  conversationId: string,
  requestId: string
): Promise<void> {
  const now = new Date().toISOString();

  // ATOMIC LOCK: Update status to 'processing' and return the item in a single operation
  // This prevents race conditions where multiple schedulers could process the same item
  // The .select() returns the updated row(s), so we know we got the lock if data is returned
  const { data: lockedItem, error: lockError } = await supabaseClient
    .from('ai_processing_queue')
    .update({
      status: 'processing',
      processing_started_at: now,
    })
    .eq('conversation_id', conversationId)
    .eq('status', 'pending')
    .lte('process_after', now)
    .select()
    .maybeSingle();

  if (lockError) {
    logDebug('DEBOUNCE', 'Error acquiring lock on queue item', { requestId, error: lockError });
    return;
  }

  if (!lockedItem) {
    // Either no pending item exists, or another process already locked it
    logDebug('DEBOUNCE', 'No ready queue item to lock (still in debounce, already processing, or already completed)', { 
      requestId, 
      conversationId 
    });
    return;
  }

  const queueItem = lockedItem;

  logDebug('DEBOUNCE', `Processing ${queueItem.message_count} batched messages`, {
    requestId,
    queueId: queueItem.id,
    conversationId,
    firstMessageAt: queueItem.first_message_at,
    lastMessageAt: queueItem.last_message_at,
  });

  try {
    // Combine all messages into a single context
    const messages = queueItem.messages as Array<{ content: string; type: string; timestamp: string }>;
    const combinedContent = messages.length > 1
      ? messages.map((m, i) => m.content).join('\n\n')
      : messages[0]?.content || '';
    
    // Get the primary message type (prioritize text if any text exists)
    const primaryType = messages.some(m => m.type === 'text') ? 'text' : messages[0]?.type || 'text';

    const metadata = queueItem.metadata as Record<string, any>;
    const context: AutomationContext = {
      lawFirmId: queueItem.law_firm_id,
      conversationId: queueItem.conversation_id,
      messageContent: combinedContent,
      messageType: primaryType,
      contactName: metadata.contact_name || '',
      contactPhone: metadata.contact_phone || '',
      remoteJid: metadata.remote_jid || '',
      instanceId: metadata.instance_id || '',
      instanceName: metadata.instance_name || '',
      clientId: metadata.client_id,
    };

    // Process the combined messages
    await processAutomations(supabaseClient, context);

    // Mark as completed
    await supabaseClient
      .from('ai_processing_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id);

    logDebug('DEBOUNCE', `Successfully processed batched messages`, {
      requestId,
      queueId: queueItem.id,
      messageCount: queueItem.message_count,
    });

  } catch (error) {
    logDebug('DEBOUNCE', 'Error processing queued messages', {
      requestId,
      queueId: queueItem.id,
      error: error instanceof Error ? error.message : error,
    });

    // Mark as failed
    await supabaseClient
      .from('ai_processing_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq('id', queueItem.id);
  }
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
type ConversationAI = 'gemini' | 'gpt' | 'n8n';

interface AIProviderConfig {
  planType: PlanType;
  conversationAI: ConversationAI;
  capabilities: Record<string, boolean>;
  openaiApiKey: string | null;
  // N8N specific config
  n8nWebhookUrl: string | null;
  n8nWebhookSecret: string | null;
  useN8N: boolean;
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

// Get AI provider configuration based on PLAN MATRIX + N8N override
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
    let conversationAI = getConversationAI(planType);

    logDebug('AI_MATRIX', `Plan detected: ${planName} -> ${planType} -> Base AI: ${conversationAI}`, { 
      lawFirmId,
      planName,
      planType,
      conversationAI
    });

    // Fetch tenant settings to check for N8N and OpenAI config
    const { data: settings } = await supabaseClient
      .from('law_firm_settings')
      .select('ai_provider, openai_api_key, n8n_webhook_url, n8n_webhook_secret')
      .eq('law_firm_id', lawFirmId)
      .maybeSingle();

    // Check if N8N is configured and enabled
    const n8nWebhookUrl = settings?.n8n_webhook_url || null;
    const n8nWebhookSecret = settings?.n8n_webhook_secret || null;
    const aiProvider = settings?.ai_provider || 'internal';
    const useN8N = aiProvider === 'n8n' && Boolean(n8nWebhookUrl);

    // If N8N is configured and enabled, override the conversation AI
    if (useN8N) {
      conversationAI = 'n8n';
      logDebug('AI_MATRIX', `N8N OVERRIDE - Using N8N webhook for conversations`, { 
        lawFirmId,
        n8nWebhookUrl: n8nWebhookUrl?.substring(0, 50) + '...',
        originalAI: getConversationAI(planType)
      });
    }

    // For GPT plans (Professional/Enterprise), we need OpenAI key
    let openaiApiKey: string | null = null;
    if (conversationAI === 'gpt') {
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
      n8nWebhookUrl,
      n8nWebhookSecret,
      useN8N,
    };
  } catch (error) {
    logDebug('AI_MATRIX', 'Error fetching plan config, defaulting to Starter (Gemini)', { error });
    return { 
      planType: 'starter',
      conversationAI: 'gemini',
      capabilities: { auto_reply: true, summary: true, transcription: true, classification: true, image_analysis: true },
      openaiApiKey: null,
      n8nWebhookUrl: null,
      n8nWebhookSecret: null,
      useN8N: false,
    };
  }
}

// Voice configuration interface
interface VoiceConfig {
  enabled: boolean;
  voiceId: string;
  source?: 'agente' | 'empresa' | 'global' | 'fallback';
}

// ElevenLabs voice mapping - synchronized with src/lib/voiceConfig.ts
const VOICE_MAP: Record<string, string> = {
  'el_laura': 'sLEZIrFwEyhMIH1ALLIQ',
  'el_felipe': 'GxZ0UJKPezKah8TMxZZM',
  'el_eloisa': '4JmPeXyyRsHSbtyiCSrt',
};

// Technical fallback voice when nothing is configured
const TECHNICAL_FALLBACK_VOICE = 'el_laura';

// =============================================================================
// VOICE RESOLUTION WITH CORRECT PRECEDENCE (MULTI-TENANT)
// =============================================================================
// Priority order:
// 1. Agent (automation.trigger_config.voice_id)
// 2. Tenant (law_firm_settings.ai_capabilities.elevenlabs_voice)
// 3. Global (system_settings.tts_elevenlabs_voice)
// 4. Technical fallback (el_laura)
// =============================================================================

async function resolveVoiceWithPrecedence(
  supabaseClient: any,
  lawFirmId: string,
  agentVoiceId: string | null
): Promise<{ voiceId: string; source: 'agente' | 'empresa' | 'global' | 'fallback' }> {
  try {
    // 1. Agent voice (highest priority)
    if (agentVoiceId && agentVoiceId.trim() !== '') {
      logDebug('VOICE_RESOLUTION', `Using agent voice: ${agentVoiceId}`, { lawFirmId, source: 'agente' });
      return { voiceId: agentVoiceId, source: 'agente' };
    }

    // 2. Tenant voice (empresa)
    const { data: tenantSettings } = await supabaseClient
      .from('law_firm_settings')
      .select('ai_capabilities')
      .eq('law_firm_id', lawFirmId)
      .single();

    const tenantCaps = tenantSettings?.ai_capabilities as Record<string, unknown> | null;
    const tenantVoice = tenantCaps?.elevenlabs_voice as string | null;
    
    if (tenantVoice && tenantVoice.trim() !== '') {
      logDebug('VOICE_RESOLUTION', `Using tenant voice: ${tenantVoice}`, { lawFirmId, source: 'empresa' });
      return { voiceId: tenantVoice, source: 'empresa' };
    }

    // 3. Global default voice
    const { data: globalSettings } = await supabaseClient
      .from('system_settings')
      .select('value')
      .eq('key', 'tts_elevenlabs_voice')
      .single();

    const globalVoice = globalSettings?.value as string | null;
    
    if (globalVoice && globalVoice.trim() !== '') {
      logDebug('VOICE_RESOLUTION', `Using global voice: ${globalVoice}`, { lawFirmId, source: 'global' });
      return { voiceId: globalVoice, source: 'global' };
    }

    // 4. Technical fallback
    logDebug('VOICE_RESOLUTION', `Using technical fallback: ${TECHNICAL_FALLBACK_VOICE}`, { lawFirmId, source: 'fallback' });
    return { voiceId: TECHNICAL_FALLBACK_VOICE, source: 'fallback' };

  } catch (error) {
    logDebug('VOICE_RESOLUTION', 'Error resolving voice, using fallback', { 
      error: error instanceof Error ? error.message : error,
      lawFirmId 
    });
    return { voiceId: TECHNICAL_FALLBACK_VOICE, source: 'fallback' };
  }
}

// ============= AUDIO MODE STATE MACHINE =============
// States: TEXT_MODE (default) and AUDIO_MODE (active)
// Transitions:
// - Client requests audio -> TEXT_MODE -> AUDIO_MODE (persist ai_audio_enabled = true)
// - Client sends TEXT message -> AUDIO_MODE -> TEXT_MODE (persist ai_audio_enabled = false)
// - User clicks "Disable audio" in UI -> any state -> TEXT_MODE (persist ai_audio_enabled = false)

// Detect EXPLICIT audio activation requests
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

// Detect EXPLICIT audio deactivation requests
function isAudioDeactivationRequest(userText: string): boolean {
  if (!userText) return false;
  const t = userText.toLowerCase();

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

  return deactivationPatterns.some((p) => p.test(t));
}

// Update audio mode state in database
async function updateAudioModeState(
  supabaseClient: any,
  conversationId: string,
  enabled: boolean,
  reason: 'user_request' | 'text_message_received' | 'manual_toggle' | 'accessibility_need'
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const updateData: any = {
      ai_audio_enabled: enabled,
      ai_audio_enabled_by: reason,
    };
    
    if (enabled) {
      updateData.ai_audio_last_enabled_at = now;
    } else {
      updateData.ai_audio_last_disabled_at = now;
    }

    const { error } = await supabaseClient
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (error) {
      logDebug('AUDIO_MODE', 'Failed to update audio state', { error, conversationId, enabled, reason });
      return false;
    }

    logDebug('AUDIO_MODE', 'Audio state updated successfully', { 
      conversationId, 
      enabled, 
      reason 
    });
    return true;
  } catch (error) {
    logDebug('AUDIO_MODE', 'Error updating audio state', { error, conversationId });
    return false;
  }
}

// SINGLE SOURCE OF TRUTH: Check audio mode from database and apply state machine logic
// This is the ONLY function that determines whether to respond with audio
async function shouldRespondWithAudio(
  supabaseClient: any,
  conversationId: string,
  currentMessageText: string,
  currentMessageType: string
): Promise<boolean> {
  try {
    // 1. FIRST: Load the current state from database (SINGLE SOURCE OF TRUTH)
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('ai_audio_enabled, ai_audio_enabled_by')
      .eq('id', conversationId)
      .single();

    if (convError) {
      logDebug('AUDIO_MODE', 'Error loading conversation audio state', { error: convError, conversationId });
      return false;
    }

    const currentAudioEnabled = conversation?.ai_audio_enabled === true;
    
    logDebug('AUDIO_MODE', 'Loaded audio state from DB', { 
      conversationId,
      ai_audio_enabled: currentAudioEnabled,
      ai_audio_enabled_by: conversation?.ai_audio_enabled_by,
    });

    // 2. Check if client EXPLICITLY requested audio deactivation
    if (isAudioDeactivationRequest(currentMessageText)) {
      logDebug('AUDIO_MODE', 'Client requested to DISABLE audio');
      await updateAudioModeState(supabaseClient, conversationId, false, 'user_request');
      return false;
    }

    // 3. Check if client EXPLICITLY requested audio activation
    if (isAudioRequestedFromText(currentMessageText)) {
      logDebug('AUDIO_MODE', 'Client requested to ENABLE audio');
      await updateAudioModeState(supabaseClient, conversationId, true, 'user_request');
      return true;
    }

    // 4. STATE MACHINE: If audio is currently enabled but client sent TEXT message, auto-disable
    // This implements "Desativação automática do áudio ao receber mensagem por texto"
    if (currentAudioEnabled && currentMessageType === 'text') {
      logDebug('AUDIO_MODE', 'Audio was enabled but client sent TEXT - auto-disabling audio mode');
      await updateAudioModeState(supabaseClient, conversationId, false, 'text_message_received');
      return false;
    }

    // 5. If audio is enabled and message is audio, keep audio mode
    if (currentAudioEnabled && currentMessageType === 'audio') {
      logDebug('AUDIO_MODE', 'Audio mode active and client sent audio - keeping audio mode');
      return true;
    }

    // 6. Default: return current state from database
    logDebug('AUDIO_MODE', 'Using persisted audio state', { 
      conversationId, 
      result: currentAudioEnabled 
    });
    return currentAudioEnabled;

  } catch (error) {
    logDebug('AUDIO_MODE', 'Error in shouldRespondWithAudio', { error, conversationId });
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

// Helper function to generate TTS audio using ai-text-to-speech edge function (supports ElevenLabs + OpenAI fallback)
async function generateTTSAudio(text: string, voiceId: string, lawFirmId?: string): Promise<string | null> {
  try {
    const trimmedText = text.trim().substring(0, 3900);

    logDebug('TTS_GENERATE', 'Starting TTS audio generation', {
      voiceId,
      textLength: trimmedText.length,
      originalLength: text.trim().length,
      truncated: trimmedText.length !== text.trim().length,
      lawFirmId: lawFirmId || 'not provided',
    });

    // Verify environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      logDebug('TTS_GENERATE', 'CRITICAL: Missing environment variables', {
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseKey: !!supabaseKey,
      });
      return null;
    }
    
    const ttsEndpoint = `${supabaseUrl}/functions/v1/ai-text-to-speech`;
    logDebug('TTS_GENERATE', 'Calling TTS endpoint', { endpoint: ttsEndpoint });
    
    const startTime = Date.now();
    const response = await fetch(ttsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        text: trimmedText,
        voiceId: voiceId,
        lawFirmId: lawFirmId,
      }),
    });
    
    const elapsed = Date.now() - startTime;

    logDebug('TTS_GENERATE', 'TTS endpoint response', {
      status: response.status,
      statusText: response.statusText,
      elapsedMs: elapsed,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('TTS_GENERATE', 'TTS endpoint ERROR', { 
        status: response.status, 
        error: errorText,
        elapsedMs: elapsed,
      });
      return null;
    }

    const data = await response.json();
    
    logDebug('TTS_GENERATE', 'TTS response data', {
      success: data.success,
      hasAudioContent: !!data.audioContent,
      audioContentLength: data.audioContent?.length || 0,
      provider: data.provider || 'unknown',
      error: data.error || null,
    });
    
    if (!data.success) {
      logDebug('TTS_GENERATE', 'TTS generation FAILED', { error: data.error });
      return null;
    }
    
    if (!data.audioContent) {
      logDebug('TTS_GENERATE', 'TTS response missing audioContent');
      return null;
    }

    logDebug('TTS_GENERATE', 'Audio generated SUCCESS', {
      provider: data.provider,
      audioSize: data.audioContent.length,
      elapsedMs: elapsed,
    });
    
    return data.audioContent;
  } catch (error) {
    logDebug('TTS_GENERATE', 'EXCEPTION in generateTTSAudio', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
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
      // NOTE: ai-chat already saved the message - just update with WhatsApp ID
      await supabaseClient
        .from('messages')
        .update({ whatsapp_message_id: sendResult?.key?.id })
        .eq('conversation_id', context.conversationId)
        .eq('content', part)
        .eq('ai_generated', true)
        .is('whatsapp_message_id', null)
        .order('created_at', { ascending: false })
        .limit(1);
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
// responseDelaySeconds: delay configured by client (summed with jitter)
async function sendAIResponseToWhatsApp(
  supabaseClient: any,
  context: AutomationContext,
  aiResponse: string,
  voiceConfig?: VoiceConfig,
  responseDelaySeconds: number = 0
): Promise<boolean> {
  try {
    const AUDIO_PLACEHOLDER_RE = /\[\s*mensagem de [áa]udio\s*\]/gi;
    // Regex to detect [IMAGE]url, [VIDEO]url, [AUDIO]url, or [DOCUMENT]url patterns anywhere in the text
    const MEDIA_PATTERN_RE = /\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/i;
    
    const sanitizeText = (value: string) =>
      value
        .replace(AUDIO_PLACEHOLDER_RE, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Deduplicate paragraphs - remove repeated content from AI responses
    // This prevents the AI from sending duplicate messages when it hallucinates repetitions
    // Uses Jaccard similarity to detect semantically similar paragraphs (not just exact matches)
    const deduplicateParagraphs = (text: string): string => {
      const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
      const unique: string[] = [];
      
      // Extract significant words from a paragraph (for Jaccard comparison)
      const extractWords = (text: string): Set<string> => {
        // Remove punctuation, lowercase, split by spaces
        const words = text.toLowerCase()
          .replace(/[^\w\sàáâãéêíóôõúüç]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3); // Only words with 4+ chars (ignore "the", "and", etc.)
        return new Set(words);
      };
      
      // Calculate Jaccard similarity between two word sets
      const jaccardSimilarity = (setA: Set<string>, setB: Set<string>): number => {
        if (setA.size === 0 && setB.size === 0) return 1;
        if (setA.size === 0 || setB.size === 0) return 0;
        
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return intersection.size / union.size;
      };
      
      // Store word sets for each unique paragraph
      const seenWordSets: Set<string>[] = [];
      
      for (const p of paragraphs) {
        const normalized = p.toLowerCase().replace(/\s+/g, ' ').trim();
        const words = extractWords(p);
        
        // Check if this paragraph is similar to any we've already seen
        let isDuplicate = false;
        
        for (const seenWords of seenWordSets) {
          const similarity = jaccardSimilarity(words, seenWords);
          
          // If similarity > 95%, consider it a duplicate
          if (similarity > 0.95) {
            isDuplicate = true;
            logDebug('DEDUPE', 'Removed similar paragraph (Jaccard similarity)', {
              duplicate: p.substring(0, 100),
              similarity: (similarity * 100).toFixed(1) + '%',
            });
            break;
          }
        }
        
        if (!isDuplicate) {
          unique.push(p);
          seenWordSets.push(words);
        }
      }
      
      return unique.join('\n\n');
    };

    const sanitizedResponse = deduplicateParagraphs(sanitizeText(aiResponse));

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
    
    // ========================================================================
    // CHECK FOR MEDIA TEMPLATE PATTERN: [IMAGE]url, [VIDEO]url, [AUDIO]url, [DOCUMENT]url
    // If found anywhere in the text, extract media, send it, and send remaining text separately
    // ========================================================================
    const mediaMatch = sanitizedResponse.match(MEDIA_PATTERN_RE);
    if (mediaMatch) {
      const fullMatch = mediaMatch[0]; // e.g., "[IMAGE]https://..."
      const mediaTypeRaw = mediaMatch[1].toUpperCase(); // "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"
      const mediaUrl = mediaMatch[2];
      
      // Extract text before and after the media pattern
      const matchIndex = sanitizedResponse.indexOf(fullMatch);
      const textBefore = sanitizedResponse.substring(0, matchIndex).trim();
      const textAfter = sanitizedResponse.substring(matchIndex + fullMatch.length).trim();
      
      // The caption is the text after the media URL (usually on next line)
      const caption = textAfter.split('\n')[0]?.trim() || "";
      // Text to send separately (excluding the caption that goes with media)
      const remainingTextAfterCaption = textAfter.split('\n').slice(1).join('\n').trim();
      
      logDebug('SEND_RESPONSE', `Detected media template pattern: ${mediaTypeRaw}`, {
        mediaUrl,
        caption,
        textBefore,
        conversationId: context.conversationId,
      });
      
      // Get instance details for API URL and key
      const { data: instance } = await supabaseClient
        .from('whatsapp_instances')
        .select('api_url, api_key, instance_name')
        .eq('id', context.instanceId)
        .single();

      if (!instance) {
        logDebug('SEND_RESPONSE', 'Instance not found for media send', { instanceId: context.instanceId });
        return false;
      }

      // Normalize API URL
      const apiUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
      const targetNumber = (context.remoteJid || "").split("@")[0];
      
      if (!targetNumber) {
        logDebug('SEND_RESPONSE', 'Invalid remoteJid for media send');
        return false;
      }
      
      // Apply delay before sending
      const clientDelayMs = responseDelaySeconds * 1000;
      
      // If there's text before the media pattern, send it first as a text message
      if (textBefore) {
        await humanDelay(
          DELAY_CONFIG.AI_RESPONSE.min + clientDelayMs, 
          DELAY_CONFIG.AI_RESPONSE.max + clientDelayMs, 
          '[AI_TEXT_BEFORE_MEDIA]'
        );
        
        const textUrl = `${apiUrl}/message/sendText/${instance.instance_name}`;
        const textResponse = await fetch(textUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': instance.api_key || '',
          },
          body: JSON.stringify({ number: targetNumber, text: textBefore }),
        });
        
        if (textResponse.ok) {
          const textResult = await textResponse.json();
          // Save text message to database
          await supabaseClient
            .from('messages')
            .insert({
              conversation_id: context.conversationId,
              whatsapp_message_id: textResult?.key?.id,
              content: textBefore,
              message_type: 'text',
              is_from_me: true,
              sender_type: 'system',
              ai_generated: true,
              ai_agent_id: context.automationId || null,
              ai_agent_name: context.automationName || null,
            });
        }
        
        // Small delay before sending media
        await humanDelay(500, 1000, '[BEFORE_MEDIA]');
      }
      
      // Now send the media
      await humanDelay(
        DELAY_CONFIG.AI_RESPONSE.min + clientDelayMs, 
        DELAY_CONFIG.AI_RESPONSE.max + clientDelayMs, 
        '[AI_MEDIA_RESPONSE]'
      );
      
      // Build endpoint and payload based on media type
      let endpoint = "";
      let payload: Record<string, unknown> = { number: targetNumber };
      let dbMessageType = "";
      let dbMimeType = "";
      
      switch (mediaTypeRaw) {
        case "IMAGE":
          endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
          dbMessageType = "image";
          dbMimeType = "image/jpeg";
          payload = {
            ...payload,
            mediatype: "image",
            mimetype: "image/jpeg",
            caption: caption,
            media: mediaUrl,
          };
          break;
          
        case "VIDEO":
          endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
          dbMessageType = "video";
          dbMimeType = "video/mp4";
          payload = {
            ...payload,
            mediatype: "video",
            mimetype: "video/mp4",
            caption: caption,
            media: mediaUrl,
          };
          break;
          
        case "AUDIO":
          endpoint = `${apiUrl}/message/sendWhatsAppAudio/${instance.instance_name}`;
          dbMessageType = "audio";
          dbMimeType = "audio/mpeg";
          payload = {
            ...payload,
            audio: mediaUrl,
          };
          break;
          
        case "DOCUMENT":
          endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
          dbMessageType = "document";
          // Try to infer mime type from URL extension
          const urlLower = mediaUrl.toLowerCase();
          if (urlLower.includes('.pdf')) {
            dbMimeType = "application/pdf";
          } else if (urlLower.includes('.doc') || urlLower.includes('.docx')) {
            dbMimeType = "application/msword";
          } else if (urlLower.includes('.xls') || urlLower.includes('.xlsx')) {
            dbMimeType = "application/vnd.ms-excel";
          } else {
            dbMimeType = "application/octet-stream";
          }
          // Extract filename from URL
          const urlParts = mediaUrl.split('/');
          const fileName = urlParts[urlParts.length - 1].split('?')[0] || "document";
          payload = {
            ...payload,
            mediatype: "document",
            mimetype: dbMimeType,
            caption: caption,
            fileName: fileName,
            media: mediaUrl,
          };
          break;
          
        default:
          logDebug('SEND_RESPONSE', `Unknown media type: ${mediaTypeRaw}`);
          return false;
      }
      
      logDebug('SEND_RESPONSE', 'Sending media via Evolution API', { endpoint, mediaType: mediaTypeRaw });
      
      const sendResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': instance.api_key || '',
        },
        body: JSON.stringify(payload),
      });

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        logDebug('SEND_RESPONSE', 'Evolution API media send failed', {
          status: sendResponse.status,
          error: errorText,
        });
        return false;
      }

      const sendResult = await sendResponse.json();
      const whatsappMessageId = sendResult?.key?.id;
      
      logDebug('SEND_RESPONSE', 'Media sent successfully', { whatsappMessageId, mediaType: mediaTypeRaw });

      // Save media message to database
      await supabaseClient
        .from('messages')
        .insert({
          conversation_id: context.conversationId,
          whatsapp_message_id: whatsappMessageId,
          content: caption || `[${mediaTypeRaw}]`,
          message_type: dbMessageType,
          media_url: mediaUrl,
          media_mime_type: dbMimeType,
          is_from_me: true,
          sender_type: 'system',
          ai_generated: true,
          ai_agent_id: context.automationId || null,
          ai_agent_name: context.automationName || null,
        });

      // Update conversation last_message_at
      await supabaseClient
        .from('conversations')
        .update({ 
          last_message_at: new Date().toISOString(),
          n8n_last_response_at: new Date().toISOString(),
        })
        .eq('id', context.conversationId);

      // If there's remaining text after the caption, send it as a separate message
      if (remainingTextAfterCaption) {
        await humanDelay(500, 1000, '[AFTER_MEDIA_TEXT]');
        
        const textUrl = `${apiUrl}/message/sendText/${instance.instance_name}`;
        const textResponse = await fetch(textUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': instance.api_key || '',
          },
          body: JSON.stringify({ number: targetNumber, text: remainingTextAfterCaption }),
        });
        
        if (textResponse.ok) {
          const textResult = await textResponse.json();
          await supabaseClient
            .from('messages')
            .insert({
              conversation_id: context.conversationId,
              whatsapp_message_id: textResult?.key?.id,
              content: remainingTextAfterCaption,
              message_type: 'text',
              is_from_me: true,
              sender_type: 'system',
              ai_generated: true,
              ai_agent_id: context.automationId || null,
              ai_agent_name: context.automationName || null,
            });
        }
      }

      logDebug('SEND_RESPONSE', `${mediaTypeRaw} media response completed successfully`);
      return true;
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

        // Apply client delay + human-like jitter before first audio, shorter delay between chunks
        if (i === 0) {
          const clientDelayMs = responseDelaySeconds * 1000;
          await humanDelay(
            DELAY_CONFIG.AI_RESPONSE.min + clientDelayMs, 
            DELAY_CONFIG.AI_RESPONSE.max + clientDelayMs, 
            '[TTS_AUDIO]'
          );
        } else {
          await humanDelay(DELAY_CONFIG.AUDIO_CHUNK.min, DELAY_CONFIG.AUDIO_CHUNK.max, '[TTS_CHUNK]');
        }

        logDebug('TTS_FLOW', 'Generating audio chunk', {
          index: i + 1,
          total: chunks.length,
          textLength: chunkText.length,
        });

        const audioBase64 = await generateTTSAudio(chunkText, voiceConfig!.voiceId, context.lawFirmId);

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
            ai_agent_id: context.automationId || null,
            ai_agent_name: context.automationName || null,
          });

        // Record TTS usage for billing
        await recordTTSUsage(
          supabaseClient,
          context.lawFirmId,
          context.conversationId,
          chunkText.length,
          voiceConfig!.voiceId,
          voiceConfig!.source || 'unknown'
        );

        logDebug('SEND_RESPONSE', 'Audio chunk sent, saved, and usage recorded', {
          messageId: audioResult.messageId,
          chunkIndex: i + 1,
          chunksTotal: chunks.length,
          textLength: chunkText.length,
        });

        // Note: Delay between chunks is now handled at the start of the loop
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
    }

    // Normal text-only flow
    let lastWhatsappMessageId: string | null = null;

    for (let i = 0; i < messageParts.length; i++) {
      const part = sanitizeText(messageParts[i]);

      // If sanitization removed everything, skip
      if (!part) {
        logDebug('SEND_RESPONSE', `Skipping empty message part ${i + 1}/${messageParts.length} after sanitization`);
        continue;
      }

      // Add client delay + human-like jitter delay between messages
      if (i > 0) {
        await messageSplitDelay(i, messageParts.length, '[AI_RESPONSE]');
      } else if (i === 0) {
        // First message gets client delay + human-like jitter (e.g., 10s + 7-15s = 17-25s)
        const clientDelayMs = responseDelaySeconds * 1000;
        await humanDelay(
          DELAY_CONFIG.AI_RESPONSE.min + clientDelayMs, 
          DELAY_CONFIG.AI_RESPONSE.max + clientDelayMs, 
          '[AI_RESPONSE]'
        );
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
          error: errorText,
        });
        continue; // Try to send remaining parts
      }

      const sendResult = await sendResponse.json();
      lastWhatsappMessageId = sendResult?.key?.id;

      logDebug('SEND_RESPONSE', `Part ${i + 1} sent successfully`, {
        whatsappMessageId: lastWhatsappMessageId,
      });

      // NOTE: We do NOT save messages here because ai-chat already saves them to the database
      // This prevents duplicate messages. We only need to update with the WhatsApp message ID.
      // UPDATE the message with the whatsapp_message_id for proper ACK tracking
      const { error: updateError } = await supabaseClient
        .from('messages')
        .update({ whatsapp_message_id: lastWhatsappMessageId })
        .eq('conversation_id', context.conversationId)
        .eq('content', part)
        .eq('ai_generated', true)
        .is('whatsapp_message_id', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (updateError) {
        logDebug('SEND_RESPONSE', `Failed to update message with WhatsApp ID`, { error: updateError });
      } else {
        logDebug('SEND_RESPONSE', `Updated message with WhatsApp ID: ${lastWhatsappMessageId}`);
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
    // CRITICAL: Use the new resolution logic with priority:
    // 1. Instance default -> 2. Company default -> 3. First active
    const automation = await resolveAutomationForConversation(
      supabaseClient,
      context.lawFirmId,
      context.conversationId
    );

    if (!automation) {
      logDebug('AI_PROVIDER', 'No valid automation found after resolution', { 
        lawFirmId: context.lawFirmId,
        conversationId: context.conversationId 
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
        source: 'whatsapp',
        context: {
          clientName: context.contactName,
          clientPhone: context.contactPhone,
          lawFirmId: context.lawFirmId,
          clientId: context.clientId, // Pass clientId for memory support
          audioRequested: audioRequestedForThisMessage,
          skipSaveUserMessage: true, // Message already saved by evolution-webhook
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
    const toolCallsExecuted = result.toolCallsExecuted || [];
    
    logDebug('AI_PROVIDER', 'Internal AI response received', { 
      hasResponse: !!aiResponse, 
      responseLength: aiResponse?.length,
      automationId: automation.id,
      toolCallsCount: toolCallsExecuted.length
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

      // Get voice configuration with proper precedence: agente → empresa → global → fallback
      const triggerConfig = automation.trigger_config as Record<string, unknown> | null;
      const agentVoiceId = triggerConfig?.voice_id as string | null;
      const resolvedVoice = await resolveVoiceWithPrecedence(supabaseClient, context.lawFirmId, agentVoiceId);

      const voiceConfig: VoiceConfig = {
        enabled: Boolean(triggerConfig?.voice_enabled),
        voiceId: resolvedVoice.voiceId,
        source: resolvedVoice.source,
      };

      logDebug('AI_PROVIDER', 'Voice config (with precedence)', {
        voiceConfig,
        agentVoiceId,
        lawFirmId: context.lawFirmId,
      });

      // Add AI agent info to context for message tracking
      const contextWithAgent = {
        ...context,
        automationId: automation.id,
        automationName: automation.name,
      };

      // Send the response back to WhatsApp (with optional voice and client delay)
      const responseDelaySeconds =
        Number((triggerConfig as any)?.response_delay_seconds ?? (triggerConfig as any)?.response_delay ?? 0) || 0;
      await sendAIResponseToWhatsApp(supabaseClient, contextWithAgent, aiResponse, voiceConfig, responseDelaySeconds);
    }

    // Log the AI processing with tool calls
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
          tool_calls_executed: toolCallsExecuted,
        },
        status_code: 200,
      });

  } catch (error) {
    logDebug('AI_PROVIDER', 'Error processing with internal AI', { error: error instanceof Error ? error.message : error });
  }
}

// Process messages with GPT (Professional/Enterprise plans)
// CRITICAL: Must have valid automation with prompt - no fallbacks allowed
// Uses ai-chat edge function for consistent function calling support
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
    // CRITICAL: Use the new resolution logic with priority:
    // 1. Instance default -> 2. Company default -> 3. First active
    const automation = await resolveAutomationForConversation(
      supabaseClient,
      context.lawFirmId,
      context.conversationId
    );

    if (!automation) {
      logDebug('AI_MATRIX', 'No valid automation found after resolution', { 
        lawFirmId: context.lawFirmId,
        conversationId: context.conversationId 
      });
      return;
    }

    logDebug('AI_MATRIX', `Using agent: ${automation.name}`, { 
      automationId: automation.id,
      version: automation.version,
      updatedAt: automation.updated_at
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Decide audio mode BEFORE calling AI (so the model doesn't do step-by-step)
    const audioRequestedForThisMessage = await shouldRespondWithAudio(
      supabaseClient,
      context.conversationId,
      context.messageContent,
      context.messageType
    );

    // Call internal ai-chat edge function with automationId (REQUIRED)
    // ai-chat handles: prompt loading, knowledge base, memory, function calling
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
        source: 'whatsapp',
        context: {
          clientName: context.contactName,
          clientPhone: context.contactPhone,
          lawFirmId: context.lawFirmId,
          clientId: context.clientId, // Pass clientId for memory support
          audioRequested: audioRequestedForThisMessage,
          skipSaveUserMessage: true, // Message already saved by evolution-webhook
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('AI_MATRIX', 'ai-chat call failed for GPT', { 
        status: response.status, 
        error: errorText,
        automationId: automation.id 
      });
      return;
    }

    const result = await response.json();
    const aiResponse = result.response;
    const toolCallsExecuted = result.toolCallsExecuted || [];

    if (aiResponse) {
      logDebug('AI_MATRIX', 'GPT response received via ai-chat', { 
        responseLength: aiResponse.length,
        automationId: automation.id,
        toolCallsCount: toolCallsExecuted.length
      });

      // CRITICAL: Record AI conversation usage (1 per conversation per billing period)
      await recordAIConversationUsage(
        supabaseClient,
        context.lawFirmId,
        context.conversationId,
        automation.id,
        automation.name
      );

      // Get voice configuration with proper precedence: agente → empresa → global → fallback
      const triggerConfig = automation.trigger_config as Record<string, unknown> | null;
      const agentVoiceId = triggerConfig?.voice_id as string | null;
      const resolvedVoice = await resolveVoiceWithPrecedence(supabaseClient, context.lawFirmId, agentVoiceId);
      
      const voiceConfig: VoiceConfig = {
        enabled: Boolean(triggerConfig?.voice_enabled),
        voiceId: resolvedVoice.voiceId,
        source: resolvedVoice.source,
      };

      logDebug('AI_MATRIX', 'Voice config (with precedence)', { 
        voiceConfig,
        agentVoiceId,
        lawFirmId: context.lawFirmId,
      });

      // Add AI agent info to context for message tracking
      const contextWithAgent = {
        ...context,
        automationId: automation.id,
        automationName: automation.name,
      };

      // Send the response back to WhatsApp (with optional voice and client delay)
      const responseDelaySeconds =
        Number((triggerConfig as any)?.response_delay_seconds ?? (triggerConfig as any)?.response_delay ?? 0) || 0;
      await sendAIResponseToWhatsApp(supabaseClient, contextWithAgent, aiResponse, voiceConfig, responseDelaySeconds);
      // Log the AI processing with tool calls
      await supabaseClient
        .from('webhook_logs')
        .insert({
          automation_id: automation.id,
          direction: 'internal',
          payload: {
            provider: 'gpt',
            plan_type: aiConfig.planType,
            automation_name: automation.name,
            automation_version: automation.version,
            conversation_id: context.conversationId,
            message: context.messageContent,
            model: 'gpt-4o-mini',
            response_sent: true,
            tool_calls_executed: toolCallsExecuted,
          },
          status_code: 200,
        });
    }

  } catch (error) {
    logDebug('AI_MATRIX', 'Error processing with GPT', { error: error instanceof Error ? error.message : error });
  }
}

// =============================================================================
// PROCESS WITH N8N - Send message to external N8N workflow
// =============================================================================
// This allows customers to use their own N8N workflow for AI processing
// CRITICAL: Falls back to default AI (Gemini/GPT) if N8N fails
// =============================================================================
async function processWithN8N(
  supabaseClient: any, 
  context: AutomationContext, 
  aiConfig: AIProviderConfig
) {
  if (!aiConfig.capabilities.auto_reply) {
    logDebug('AI_MATRIX', 'auto_reply capability disabled, skipping N8N');
    return;
  }

  if (!aiConfig.n8nWebhookUrl) {
    logDebug('AI_MATRIX', 'N8N webhook URL not configured, falling back to default AI');
    // Fallback to default AI based on plan
    const fallbackAI = getConversationAI(aiConfig.planType);
    if (fallbackAI === 'gpt') {
      await processWithGPT(supabaseClient, context, { ...aiConfig, conversationAI: 'gpt' });
    } else {
      await processWithGemini(supabaseClient, context, { ...aiConfig, conversationAI: 'gemini' });
    }
    return;
  }

  logDebug('AI_MATRIX', `Processing with N8N (Plan: ${aiConfig.planType})`, { 
    conversationId: context.conversationId,
    webhookUrl: aiConfig.n8nWebhookUrl.substring(0, 50) + '...'
  });

  try {
    // Get automation for context (still need it for logging and voice config)
    const automation = await resolveAutomationForConversation(
      supabaseClient,
      context.lawFirmId,
      context.conversationId
    );

    // Get client info for richer context
    let clientInfo: Record<string, any> = {
      phone: context.contactPhone,
      name: context.contactName,
    };

    if (context.clientId) {
      const { data: client } = await supabaseClient
        .from('clients')
        .select('id, name, phone, email, notes, custom_status_id, document, address, birth_date, state')
        .eq('id', context.clientId)
        .maybeSingle();
      
      if (client) {
        clientInfo = { ...clientInfo, ...client };
      }

      // Get client memories for N8N memory node
      const { data: memories } = await supabaseClient
        .from('client_memories')
        .select('fact_type, content, importance')
        .eq('client_id', context.clientId)
        .eq('is_active', true)
        .order('importance', { ascending: false })
        .limit(10);

      if (memories && memories.length > 0) {
        clientInfo.memories = memories;
      }
    }

    // Get recent conversation history for N8N context (last 20 messages)
    const { data: recentMessages } = await supabaseClient
      .from('messages')
      .select('content, is_from_me, message_type, created_at')
      .eq('conversation_id', context.conversationId)
      .order('created_at', { ascending: false })
      .limit(20);

    const conversationHistory = (recentMessages || [])
      .reverse() // Oldest first
      .map((msg: { is_from_me: boolean; content: string; message_type: string; created_at: string }) => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content,
        type: msg.message_type,
        timestamp: msg.created_at,
      }));

    // Get knowledge items linked to this automation (for base de conhecimento node)
    let knowledgeItems: any[] = [];
    if (automation?.id) {
      const { data: agentKnowledge } = await supabaseClient
        .from('agent_knowledge')
        .select('knowledge_item_id')
        .eq('automation_id', automation.id);

      if (agentKnowledge && agentKnowledge.length > 0) {
        const knowledgeIds = agentKnowledge.map((k: { knowledge_item_id: string }) => k.knowledge_item_id);
        const { data: items } = await supabaseClient
          .from('knowledge_items')
          .select('title, content, category')
          .in('id', knowledgeIds)
          .eq('is_active', true);

        knowledgeItems = items || [];
      }
    }

    // Build N8N payload with enhanced metadata
    // Detect if message was transcribed from audio
    const isTranscribedAudio = context.messageContent.startsWith('[Áudio transcrito]:');
    const originalMessageType = isTranscribedAudio ? 'audio' : context.messageType;
    const cleanMessageContent = isTranscribedAudio 
      ? context.messageContent.replace('[Áudio transcrito]: ', '').trim()
      : context.messageContent;

    // Generate session ID based on conversation for N8N memory nodes
    const sessionId = `miauchat_${context.conversationId}`;

    const n8nPayload = {
      event: 'new_message',
      conversation_id: context.conversationId,
      session_id: sessionId, // For N8N InputsessionId node
      message: cleanMessageContent, // Clean transcription without prefix
      message_type: context.messageType, // Current type (may be 'text' after transcription)
      original_message_type: originalMessageType, // Original type before transcription
      is_audio_transcription: isTranscribedAudio, // Flag for N8N to know this was audio
      raw_message: context.messageContent, // Full message with prefix if any
      client: clientInfo, // Includes memories if available
      automation: automation ? {
        id: automation.id,
        name: automation.name,
        prompt: automation.ai_prompt,
        temperature: automation.ai_temperature || 0.7,
        voice_enabled: Boolean((automation.trigger_config as any)?.voice_enabled),
        voice_id: (automation.trigger_config as any)?.voice_id || null,
      } : null,
      conversation_history: conversationHistory, // Last 20 messages for context
      knowledge_base: knowledgeItems, // Knowledge items linked to agent
      context: {
        law_firm_id: context.lawFirmId,
        whatsapp_instance_id: context.instanceId,
        remote_jid: context.remoteJid,
        timestamp: new Date().toISOString(),
      }
    };

    // Build headers
    const n8nHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add secret if configured
    if (aiConfig.n8nWebhookSecret) {
      n8nHeaders['X-Webhook-Secret'] = aiConfig.n8nWebhookSecret;
      n8nHeaders['Authorization'] = `Bearer ${aiConfig.n8nWebhookSecret}`;
    }

    logDebug('AI_MATRIX', 'Sending to N8N webhook', { 
      payloadSize: JSON.stringify(n8nPayload).length,
      hasSecret: Boolean(aiConfig.n8nWebhookSecret)
    });

    // Call N8N with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const n8nResponse = await fetch(aiConfig.n8nWebhookUrl, {
      method: 'POST',
      headers: n8nHeaders,
      body: JSON.stringify(n8nPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      logDebug('AI_MATRIX', 'N8N webhook failed', { 
        status: n8nResponse.status, 
        error: errorText.substring(0, 200)
      });
      throw new Error(`N8N returned ${n8nResponse.status}: ${errorText.substring(0, 100)}`);
    }

    const n8nResult = await n8nResponse.json();
    
    logDebug('AI_MATRIX', 'N8N response received', { 
      hasResponse: !!n8nResult.response,
      action: n8nResult.action || 'send_text'
    });

    // Handle N8N response
    const aiResponse = n8nResult.response || n8nResult.text || n8nResult.message;
    const action = n8nResult.action || 'send_text';

    if (!aiResponse) {
      logDebug('AI_MATRIX', 'N8N returned no response content');
      return;
    }

    // Record AI conversation usage
    if (automation) {
      await recordAIConversationUsage(
        supabaseClient,
        context.lawFirmId,
        context.conversationId,
        automation.id,
        automation.name
      );
    }

    // Get voice configuration
    const triggerConfig = automation?.trigger_config as Record<string, unknown> | null;
    const agentVoiceId = triggerConfig?.voice_id as string | null;
    const resolvedVoice = await resolveVoiceWithPrecedence(supabaseClient, context.lawFirmId, agentVoiceId);

    const voiceConfig: VoiceConfig = {
      enabled: Boolean(triggerConfig?.voice_enabled),
      voiceId: resolvedVoice.voiceId,
      source: resolvedVoice.source,
    };

    // Add AI agent info to context
    const contextWithAgent = {
      ...context,
      automationId: automation?.id || undefined,
      automationName: automation?.name || 'N8N Workflow',
    };

    // Send the response back to WhatsApp
    const responseDelaySeconds =
      Number((triggerConfig as any)?.response_delay_seconds ?? (triggerConfig as any)?.response_delay ?? 0) || 0;
    
    // Handle different actions from N8N
    if (action === 'none' || action === 'skip') {
      logDebug('AI_MATRIX', 'N8N requested no response (action: none/skip)');
      return;
    }

    await sendAIResponseToWhatsApp(supabaseClient, contextWithAgent, aiResponse, voiceConfig, responseDelaySeconds);

    // Log the N8N processing
    await supabaseClient
      .from('webhook_logs')
      .insert({
        automation_id: automation?.id || null,
        direction: 'outgoing',
        payload: {
          provider: 'n8n',
          webhook_url: aiConfig.n8nWebhookUrl.substring(0, 50) + '...',
          automation_name: automation?.name || 'N8N Workflow',
          conversation_id: context.conversationId,
          message: context.messageContent,
          response_sent: true,
          action: action,
        },
        response: { response_length: aiResponse.length },
        status_code: 200,
      });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logDebug('AI_MATRIX', 'Error processing with N8N, falling back to default AI', { error: errorMessage });

    // Log the failure
    await supabaseClient
      .from('webhook_logs')
      .insert({
        automation_id: null,
        direction: 'outgoing',
        payload: {
          provider: 'n8n',
          webhook_url: aiConfig.n8nWebhookUrl?.substring(0, 50) + '...',
          conversation_id: context.conversationId,
          error: errorMessage,
        },
        status_code: 500,
      });

    // Fallback to default AI based on plan
    logDebug('AI_MATRIX', `Falling back to ${getConversationAI(aiConfig.planType)} after N8N failure`);
    const fallbackAI = getConversationAI(aiConfig.planType);
    if (fallbackAI === 'gpt' && aiConfig.openaiApiKey) {
      await processWithGPT(supabaseClient, context, { ...aiConfig, conversationAI: 'gpt', useN8N: false });
    } else {
      await processWithGemini(supabaseClient, context, { ...aiConfig, conversationAI: 'gemini', useN8N: false });
    }
  }
}

// Process automations - RESPECTS AI MATRIX BY PLAN + N8N OVERRIDE
async function processAutomations(supabaseClient: any, context: AutomationContext) {
  // Get AI configuration based on PLAN MATRIX + N8N check
  const aiConfig = await getAIProviderConfig(supabaseClient, context.lawFirmId);
  
  logDebug('AI_MATRIX', `Routing conversation based on plan matrix`, {
    planType: aiConfig.planType,
    conversationAI: aiConfig.conversationAI,
    hasOpenAIKey: Boolean(aiConfig.openaiApiKey),
    useN8N: aiConfig.useN8N
  });

  // Route to correct AI based on PLAN + N8N override
  switch (aiConfig.conversationAI) {
    case 'n8n':
      // N8N override - customer has configured their own workflow
      logDebug('AI_MATRIX', 'N8N OVERRIDE -> Routing to N8N Workflow');
      await processWithN8N(supabaseClient, context, aiConfig);
      break;

    case 'gemini':
      // Starter/Basic plan -> Gemini via Lovable AI Gateway
      logDebug('AI_MATRIX', 'STARTER/BASIC PLAN -> Routing to GEMINI');
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

// N8N routing now integrated into AI Matrix above

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

  // Validate webhook token for security
  const tokenError = validateWebhookToken(req);
  if (tokenError) {
    return tokenError;
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

    // =========================================================================
    // PAYLOAD SIZE PROTECTION - Reject large sync payloads to prevent DB overload
    // =========================================================================
    // Evolution API sends massive "messages.set" payloads during history sync
    // (often 10-15MB+). These are not real-time messages and should be ignored
    // to prevent database connection timeouts and system crashes.
    const MAX_PAYLOAD_SIZE_BYTES = 100 * 1024; // 100KB limit
    const SYNC_EVENTS_TO_LIMIT = ['messages.set', 'chats.set', 'contacts.set'];
    const normalizedEventForSizeCheck = body.event?.toLowerCase().replace(/_/g, '.');
    
    if (SYNC_EVENTS_TO_LIMIT.includes(normalizedEventForSizeCheck) && rawBody.length > MAX_PAYLOAD_SIZE_BYTES) {
      logDebug('PROTECTION', `Rejecting large sync payload to prevent DB overload`, { 
        requestId, 
        event: body.event,
        payloadSizeBytes: rawBody.length,
        maxAllowed: MAX_PAYLOAD_SIZE_BYTES,
        instance: body.instance,
      });
      
      // Return 200 to prevent Evolution API from retrying
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Large sync payload ignored (history sync not processed)',
          payloadSize: rawBody.length,
          limit: MAX_PAYLOAD_SIZE_BYTES,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        
        // Check if instance is already awaiting QR scan - preserve this state unless connected
        const isAlreadyAwaitingQr = instance.awaiting_qr === true || instance.status === 'awaiting_qr';
        
        let dbStatus: 'connected' | 'connecting' | 'disconnected' | 'awaiting_qr' = 'disconnected';
        let shouldSetAwaitingQr = false;
        
        if (data.state === 'open') {
          // Connected successfully - this is the only state that should override awaiting_qr
          dbStatus = 'connected';
        } else if (data.state === 'qr') {
          // QR code is being displayed - mark as awaiting_qr so auto-reconnect stops
          dbStatus = 'awaiting_qr';
          shouldSetAwaitingQr = true;
        } else if (data.state === 'connecting') {
          // IMPORTANT: If instance is already awaiting QR scan, preserve that status
          // Evolution sends "connecting" events even while QR is displayed
          if (isAlreadyAwaitingQr) {
            dbStatus = 'awaiting_qr';
            logDebug('CONNECTION', `Preserving awaiting_qr status (ignoring connecting state)`, { requestId });
          } else {
            dbStatus = 'connecting';
          }
        } else if (data.state === 'close') {
          dbStatus = 'disconnected';
        }

        // Build update payload
        const updatePayload: Record<string, unknown> = { 
          status: dbStatus, 
          updated_at: new Date().toISOString() 
        };

        // When QR is displayed, set awaiting_qr flag to stop auto-reconnect attempts
        if (shouldSetAwaitingQr) {
          updatePayload.awaiting_qr = true;
          updatePayload.manual_disconnect = false;
          logDebug('CONNECTION', `QR code displayed - setting awaiting_qr=true`, { requestId });
        }

        // When connected, reset ALL flags to allow future auto-reconnects and fresh alert cycle
        if (dbStatus === 'connected') {
          updatePayload.manual_disconnect = false;
          updatePayload.awaiting_qr = false; // QR was scanned successfully
          updatePayload.last_alert_sent_at = null; // Reset alert history for fresh cycle
          updatePayload.disconnected_since = null; // Clear disconnection timestamp
          updatePayload.alert_sent_for_current_disconnect = false; // Reset alert flag for next disconnect cycle
          updatePayload.reconnect_attempts_count = 0; // Reset reconnect counter
        }

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
              
              // ========================================
              // CRITICAL: DUPLICATE PHONE NUMBER CHECK
              // Prevent the same WhatsApp number from being connected to multiple instances
              // This prevents message duplication and tenant data mixing
              // ========================================
              const { data: existingInstances, error: dupCheckError } = await supabaseClient
                .from('whatsapp_instances')
                .select('id, instance_name, law_firm_id, phone_number')
                .eq('phone_number', phoneNumber)
                .eq('status', 'connected')
                .neq('id', instance.id);
              
              if (!dupCheckError && existingInstances && existingInstances.length > 0) {
                const existingInstance = existingInstances[0];
                logDebug('CONNECTION', `🚨 CRITICAL: Phone ${phoneNumber} already connected on another instance!`, { 
                  requestId,
                  thisInstanceId: instance.id,
                  thisInstanceName: instance.instance_name,
                  thisLawFirmId: instance.law_firm_id,
                  existingInstanceId: existingInstance.id,
                  existingInstanceName: existingInstance.instance_name,
                  existingLawFirmId: existingInstance.law_firm_id,
                  sameTenant: existingInstance.law_firm_id === instance.law_firm_id,
                });
                
                // Disconnect THIS instance (the newer one) to prevent conflicts
                // The existing instance keeps working normally
                try {
                  const apiUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
                  await fetch(`${apiUrl}/instance/logout/${instance.instance_name}`, {
                    method: 'DELETE',
                    headers: {
                      'apikey': instance.api_key || '',
                      'Content-Type': 'application/json',
                    },
                  });
                  logDebug('CONNECTION', `⚠️ Auto-disconnected duplicate instance ${instance.instance_name}`, { requestId });
                } catch (logoutErr) {
                  logDebug('CONNECTION', `Failed to logout duplicate instance: ${logoutErr}`, { requestId });
                }
                
                // Update status to disconnected with a clear reason
                await supabaseClient
                  .from('whatsapp_instances')
                  .update({ 
                    status: 'disconnected', 
                    updated_at: new Date().toISOString(),
                    phone_number: phoneNumber, // Still save the phone for reference
                  })
                  .eq('id', instance.id);
                
                // Return early - don't process further
                return new Response(
                  JSON.stringify({ 
                    success: true, 
                    action: 'disconnected',
                    reason: 'duplicate_phone_number',
                    message: `Phone ${phoneNumber} is already connected on instance ${existingInstance.instance_name}. This instance was auto-disconnected to prevent conflicts.`,
                  }),
                  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
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
          
          // If instance just connected, configure settings and reassociate orphan clients/conversations
          if (dbStatus === 'connected') {
            // CRITICAL: Auto-configure groupsIgnore to prevent AI from responding in groups
            // This is a defense-in-depth measure in case the setting was not applied during creation
            try {
              const apiUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
              const settingsPayload = {
                groupsIgnore: true,
                alwaysOnline: false,
                readMessages: false,
                readStatus: false,
                syncFullHistory: false,
              };
              
              const settingsResponse = await fetch(`${apiUrl}/settings/set/${instance.instance_name}`, {
                method: 'POST',
                headers: {
                  'apikey': instance.api_key || '',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(settingsPayload),
              });
              
              if (settingsResponse.ok) {
                logDebug('CONNECTION', `✅ Auto-configured groupsIgnore=true for instance ${instance.instance_name}`, { requestId });
              } else {
                const settingsError = await settingsResponse.text();
                logDebug('CONNECTION', `⚠️ Failed to configure groupsIgnore for ${instance.instance_name}: ${settingsError}`, { requestId });
              }
            } catch (settingsErr) {
              logDebug('CONNECTION', `⚠️ Error configuring groupsIgnore (non-fatal): ${settingsErr}`, { requestId });
            }
            
            // Reassociate orphan records
            logDebug('CONNECTION', `Reassociating orphan records for instance ${instance.id}`, { requestId });
            const { data: reassocResult, error: reassocError } = await supabaseClient
              .rpc('reassociate_orphan_records', { _instance_id: instance.id });
            
            if (reassocError) {
              logDebug('ERROR', `Failed to reassociate orphans: ${reassocError.message}`, { requestId });
            } else if (reassocResult) {
              logDebug('CONNECTION', `Orphan reassociation result`, { requestId, ...reassocResult });
            }
          }
        }
        break;
      }

      case 'qrcode.updated': {
        logDebug('QRCODE', `QR code updated for instance`, { requestId, instance: body.instance });
        
        // IMPORTANT: do not downgrade a connected instance back to "connecting".
        // Evolution may emit qrcode.updated even after the session is open.
        await supabaseClient
          .from('whatsapp_instances')
          .update({ 
            status: 'connecting', 
            updated_at: new Date().toISOString() 
          })
          .eq('id', instance.id)
          .neq('status', 'connected');
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

        // ========================================
        // CRITICAL: BLOCK ALL GROUP MESSAGES
        // Groups have @g.us suffix, individuals have @s.whatsapp.net
        // This prevents AI from responding in groups and creating group conversations
        // ========================================
        const isGroupMessage = remoteJid.includes('@g.us') || remoteJid.includes('@broadcast');
        if (isGroupMessage) {
          logDebug('MESSAGE', `🚫 IGNORING GROUP/BROADCAST MESSAGE - Groups are blocked`, { 
            requestId, 
            remoteJid,
            isGroup: remoteJid.includes('@g.us'),
            isBroadcast: remoteJid.includes('@broadcast'),
            instanceName: instance?.instance_name 
          });
          return new Response(
            JSON.stringify({ 
              success: true, 
              action: 'ignored',
              reason: 'group_message_blocked',
              message: 'Messages from groups and broadcasts are not processed'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        logDebug('MESSAGE', `Processing message`, { requestId, phoneNumber, isFromMe });

        // Get or create conversation
        // CRITICAL: Must filter by whatsapp_instance_id to keep conversations separated per instance
        // This prevents messages from different WhatsApp numbers (instances) from being mixed
        const phoneEnding = phoneNumber.slice(-8); // Last 8 digits for matching
        logDebug('DB', `Looking up conversation for remote_jid: ${remoteJid} (ending: ${phoneEnding}) on instance: ${instance.id}`, { requestId });
        
        // First try exact match by remote_jid AND instance
        // IMPORTANT: Prioritize non-archived conversations first to avoid conflicts after unification
        let { data: conversation, error: convError } = await supabaseClient
          .from('conversations')
          .select('*')
          .eq('remote_jid', remoteJid)
          .eq('law_firm_id', lawFirmId)
          .eq('whatsapp_instance_id', instance.id)
          .is('archived_at', null)
          .maybeSingle();
        
        // If no active conversation found, check for archived ones that CAN be reactivated
        // IMPORTANT: Conversations with archived_reason = 'instance_unification' are PERMANENTLY INACTIVE
        // They were archived during instance change unification and should NEVER receive new messages
        if (!conversation && !convError) {
          const { data: archivedConv } = await supabaseClient
            .from('conversations')
            .select('*')
            .eq('remote_jid', remoteJid)
            .eq('law_firm_id', lawFirmId)
            .eq('whatsapp_instance_id', instance.id)
            .not('archived_at', 'is', null)
            .or('archived_reason.is.null,archived_reason.neq.instance_unification') // Exclude permanently inactive
            .order('archived_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (archivedConv) {
            logDebug('DB', `Found archived conversation (reactivatable), will reactivate`, { requestId, foundId: archivedConv.id, archivedAt: archivedConv.archived_at, reason: archivedConv.archived_reason });
            conversation = archivedConv;
          }
        }
        
        // If still not found, try flexible matching by phone ending BUT STILL filtered by instance
        // Prioritize non-archived first
        if (!conversation && !convError) {
          const { data: flexConv } = await supabaseClient
            .from('conversations')
            .select('*')
            .eq('law_firm_id', lawFirmId)
            .eq('whatsapp_instance_id', instance.id)
            .is('archived_at', null)
            .or(`contact_phone.ilike.%${phoneEnding},remote_jid.ilike.%${phoneEnding}@%`)
            .limit(1)
            .maybeSingle();
          
          if (flexConv) {
            logDebug('DB', `Found conversation via flexible phone match (same instance)`, { requestId, foundId: flexConv.id, instanceId: instance.id });
            // Update the remote_jid to the correct format for future exact matches
            await supabaseClient
              .from('conversations')
              .update({ remote_jid: remoteJid, contact_phone: phoneNumber })
              .eq('id', flexConv.id);
            conversation = { ...flexConv, remote_jid: remoteJid, contact_phone: phoneNumber };
          }
        }
        
        // Last resort: check for archived flexible match (excluding permanently inactive)
        if (!conversation && !convError) {
          const { data: archivedFlexConv } = await supabaseClient
            .from('conversations')
            .select('*')
            .eq('law_firm_id', lawFirmId)
            .eq('whatsapp_instance_id', instance.id)
            .not('archived_at', 'is', null)
            .or('archived_reason.is.null,archived_reason.neq.instance_unification') // Exclude permanently inactive
            .or(`contact_phone.ilike.%${phoneEnding},remote_jid.ilike.%${phoneEnding}@%`)
            .order('archived_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (archivedFlexConv) {
            // Double-check it's not a permanently inactive conversation
            if (archivedFlexConv.archived_reason === 'instance_unification') {
              logDebug('DB', `Skipping permanently inactive conversation`, { requestId, foundId: archivedFlexConv.id });
            } else {
              logDebug('DB', `Found archived conversation via flexible phone match (reactivatable), will reactivate`, { requestId, foundId: archivedFlexConv.id, instanceId: instance.id, reason: archivedFlexConv.archived_reason });
              await supabaseClient
                .from('conversations')
                .update({ remote_jid: remoteJid, contact_phone: phoneNumber })
                .eq('id', archivedFlexConv.id);
              conversation = { ...archivedFlexConv, remote_jid: remoteJid, contact_phone: phoneNumber };
            }
          }
        }

        if (!conversation) {
          // Conversation doesn't exist, create it
          // IMPORTANT: Only trust pushName for inbound messages. For outbound (fromMe), pushName is usually our own name.
          const contactName = (!isFromMe && data.pushName) ? data.pushName : phoneNumber;
          logDebug('DB', `Creating new conversation for: ${contactName}`, { requestId });
          
          // Use instance defaults for handler
          // UNIFIED LOGIC: default_automation_id and default_assigned_to are mutually exclusive
          // - If default_automation_id is set → AI handles (assigned_to will be null)
          // - If default_assigned_to is set → Human handles (automation_id will be null)
          // - If neither → Goes to queue (human handler, no assigned_to)
          const hasDefaultAutomation = !!instance.default_automation_id;
          const hasDefaultHuman = !!instance.default_assigned_to;
          
          let defaultHandler: string;
          let defaultAutomationId: string | null = null;
          let defaultAssignedTo: string | null = null;
          
          if (hasDefaultAutomation) {
            // AI agent takes priority (this is the new unified behavior)
            defaultHandler = 'ai';
            defaultAutomationId = instance.default_automation_id;
            defaultAssignedTo = null; // AI doesn't need human assigned
          } else if (hasDefaultHuman) {
            // Human attendant selected
            defaultHandler = 'human';
            defaultAutomationId = null;
            defaultAssignedTo = instance.default_assigned_to;
          } else {
            // No default - goes to queue
            defaultHandler = 'human';
            defaultAutomationId = null;
            defaultAssignedTo = null;
          }
          
          logDebug('DB', `Creating conversation with unified handler logic`, { 
            requestId,
            hasDefaultAutomation,
            hasDefaultHuman,
            defaultHandler,
            defaultAutomationId,
            defaultAssignedTo
          });
          
          const { data: newConv, error: createError } = await supabaseClient
            .from('conversations')
            .insert({
              law_firm_id: lawFirmId,
              remote_jid: remoteJid,
              contact_name: contactName,
              contact_phone: phoneNumber,
              status: 'novo_contato',
              current_handler: defaultHandler,
              current_automation_id: defaultAutomationId,
              assigned_to: defaultAssignedTo,
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
          // IMPORTANT: Search for client by phone AND whatsapp_instance_id
          // This allows the same phone number to have separate clients per instance
          const { data: existingClientSameInstance } = await supabaseClient
            .from('clients')
            .select('id')
            .eq('law_firm_id', lawFirmId)
            .eq('whatsapp_instance_id', instance.id)
            .or(`phone.eq.${phoneNumber},phone.ilike.%${phoneEnding}`)
            .limit(1)
            .maybeSingle();
          
          if (existingClientSameInstance) {
            // Found client for same instance, link to conversation
            await supabaseClient
              .from('conversations')
              .update({ client_id: existingClientSameInstance.id })
              .eq('id', conversation.id);
            logDebug('DB', `Linked existing client (same instance) to conversation`, { 
              requestId, 
              clientId: existingClientSameInstance.id,
              instanceId: instance.id
            });
          } else {
            // No client for this instance - create new one
            // Each instance can have its own client record for the same phone number
            const { data: newClient, error: clientError } = await supabaseClient
              .from('clients')
              .insert({
                law_firm_id: lawFirmId,
                name: contactName,
                phone: phoneNumber,
                department_id: instance.default_department_id || null,
                custom_status_id: instance.default_status_id || null,
                whatsapp_instance_id: instance.id,
              })
              .select()
              .single();
            
            if (clientError) {
              logDebug('ERROR', `Failed to create client`, { requestId, error: clientError });
            } else {
              logDebug('DB', `Created new client for instance`, { 
                requestId, 
                clientId: newClient.id,
                instanceId: instance.id,
                departmentId: instance.default_department_id,
                statusId: instance.default_status_id
              });
              
              // Link client to conversation
              await supabaseClient
                .from('conversations')
                .update({ client_id: newClient.id })
                .eq('id', conversation.id);
            }
          }
        } else if (convError) {
          logDebug('ERROR', `Error fetching conversation`, { requestId, error: convError });
          break;
        } else {
          logDebug('DB', `Found existing conversation`, { requestId, conversationId: conversation.id });
          
          // IMPORTANT: If conversation exists but has no client_id, create/link client now
          // This can happen if client creation failed previously due to unique constraint
          if (!conversation.client_id) {
            logDebug('DB', `Conversation missing client_id, attempting to create/link client`, { requestId, conversationId: conversation.id });
            
            const contactName = conversation.contact_name || phoneNumber;
            
            // Search for existing client for this phone AND instance
            const { data: existingClientForInstance } = await supabaseClient
              .from('clients')
              .select('id')
              .eq('law_firm_id', lawFirmId)
              .eq('whatsapp_instance_id', instance.id)
              .or(`phone.eq.${phoneNumber},phone.ilike.%${phoneEnding}`)
              .limit(1)
              .maybeSingle();
            
            if (existingClientForInstance) {
              // Link existing client to conversation
              await supabaseClient
                .from('conversations')
                .update({ client_id: existingClientForInstance.id })
                .eq('id', conversation.id);
              conversation.client_id = existingClientForInstance.id;
              logDebug('DB', `Linked existing client to orphan conversation`, { 
                requestId, 
                clientId: existingClientForInstance.id,
                conversationId: conversation.id
              });
            } else {
              // Create new client for this instance
              const { data: newClient, error: clientError } = await supabaseClient
                .from('clients')
                .insert({
                  law_firm_id: lawFirmId,
                  name: contactName,
                  phone: phoneNumber,
                  department_id: instance.default_department_id || null,
                  custom_status_id: instance.default_status_id || null,
                  whatsapp_instance_id: instance.id,
                })
                .select()
                .single();
              
              if (clientError) {
                logDebug('ERROR', `Failed to create client for orphan conversation`, { requestId, error: clientError });
              } else {
                await supabaseClient
                  .from('conversations')
                  .update({ client_id: newClient.id })
                  .eq('id', conversation.id);
                conversation.client_id = newClient.id;
                logDebug('DB', `Created and linked new client to orphan conversation`, { 
                  requestId, 
                  clientId: newClient.id,
                  conversationId: conversation.id,
                  instanceId: instance.id
                });
              }
            }
          }
        }

        // Extract message content
        let messageContent = '';
        let messageType = 'text';
        let mediaUrl = '';
        let mediaMimeType = '';
        let quotedWhatsAppMessageId: string | null = null;

        // Extract reply/quote context.
        // IMPORTANT: For some Evolution payloads, the quoted reference is at `data.contextInfo` (sibling of `message`).
        const replyContext: ContextInfo | MessageContextInfo | null =
          data.contextInfo ||
          data.message?.extendedTextMessage?.contextInfo ||
          data.message?.imageMessage?.contextInfo ||
          data.message?.audioMessage?.contextInfo ||
          data.message?.videoMessage?.contextInfo ||
          data.message?.documentMessage?.contextInfo ||
          data.message?.stickerMessage?.contextInfo ||
          data.message?.messageContextInfo ||
          null;

        const stanzaId =
          (data.contextInfo?.stanzaId ??
            data.message?.extendedTextMessage?.contextInfo?.stanzaId ??
            data.message?.imageMessage?.contextInfo?.stanzaId ??
            data.message?.audioMessage?.contextInfo?.stanzaId ??
            data.message?.videoMessage?.contextInfo?.stanzaId ??
            data.message?.documentMessage?.contextInfo?.stanzaId ??
            data.message?.stickerMessage?.contextInfo?.stanzaId ??
            (data.message?.messageContextInfo as unknown as MessageContextInfo | undefined)?.stanzaId ??
            (data.message?.messageContextInfo as unknown as MessageContextInfo | undefined)?.quotedStanzaId) ||
          null;

        if (stanzaId) {
          quotedWhatsAppMessageId = stanzaId;
          logDebug('MESSAGE', `Message is a reply to WhatsApp message ID: ${quotedWhatsAppMessageId}`, { requestId });
        } else if (replyContext && Object.keys(replyContext).length > 0) {
          logDebug('MESSAGE', `Reply context present but no stanzaId (debug)`, {
            requestId,
            replyContextKeys: Object.keys(replyContext).slice(0, 12).join(','),
            hasQuotedMessage: !!(data.contextInfo as ContextInfo | undefined)?.quotedMessage,
          });
        }

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

        // For outgoing messages (fromMe), check if there's a pending message we should UPDATE instead of INSERT
        // This prevents duplication when send_message_async inserts with tempMessageId and webhook arrives later
        let savedMessage: any = null;
        let msgError: any = null;

        if (isFromMe) {
          // Look for a pending message with same content inserted recently (within 2 minutes)
          // that has a UUID-like whatsapp_message_id (tempMessageId pattern)
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          
          const { data: pendingMsg } = await supabaseClient
            .from('messages')
            .select('id, whatsapp_message_id')
            .eq('conversation_id', conversation.id)
            .eq('is_from_me', true)
            .eq('content', messageContent)
            .gte('created_at', twoMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Check if the existing message has a UUID-like ID (36 chars with hyphens = temp ID from send_message_async)
          const looksLikeTempId = pendingMsg?.whatsapp_message_id && 
            pendingMsg.whatsapp_message_id.length === 36 && 
            pendingMsg.whatsapp_message_id.includes('-');
          
          if (pendingMsg && looksLikeTempId) {
            // UPDATE the existing pending message with the real WhatsApp ID
            const { error: updateErr } = await supabaseClient
              .from('messages')
              .update({ 
                whatsapp_message_id: data.key.id,
                media_url: mediaUrl || null,
                media_mime_type: mediaMimeType || null,
              })
              .eq('id', pendingMsg.id);
            
            if (!updateErr) {
              logDebug('MESSAGE', `Updated pending message with real WhatsApp ID`, { 
                requestId, 
                dbMessageId: pendingMsg.id, 
                oldWhatsAppId: pendingMsg.whatsapp_message_id,
                newWhatsAppId: data.key.id 
              });
              savedMessage = { id: pendingMsg.id };
            } else {
              msgError = updateErr;
              logDebug('ERROR', `Failed to update pending message`, { requestId, error: updateErr });
            }
          }
        }

        // If we didn't update a pending message, insert a new one
        if (!savedMessage) {
          // Resolve quoted message to get reply_to_message_id
          let replyToMessageId: string | null = null;
          if (quotedWhatsAppMessageId) {
            // Search for the original message in the same conversation
            const { data: quotedMsg } = await supabaseClient
              .from('messages')
              .select('id')
              .eq('conversation_id', conversation.id)
              .eq('whatsapp_message_id', quotedWhatsAppMessageId)
              .limit(1)
              .maybeSingle();
            
            if (quotedMsg) {
              replyToMessageId = quotedMsg.id;
              logDebug('MESSAGE', `Resolved quoted message`, { 
                requestId, 
                quotedWhatsAppId: quotedWhatsAppMessageId, 
                replyToMessageId 
              });
            } else {
              logDebug('MESSAGE', `Could not find quoted message in DB`, { 
                requestId, 
                quotedWhatsAppId: quotedWhatsAppMessageId 
              });
            }
          }

          const insertResult = await supabaseClient
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
              reply_to_message_id: replyToMessageId,
            })
            .select()
            .single();
          
          savedMessage = insertResult.data;
          msgError = insertResult.error;
        }

        if (msgError) {
          logDebug('ERROR', `Failed to save message`, { requestId, error: msgError, code: msgError.code });
        } else {
          logDebug('MESSAGE', `Message saved successfully`, { requestId, dbMessageId: savedMessage?.id, whatsappId: data.key.id });
        }

        // Update conversation last_message_at
        // IMPORTANT: Do NOT overwrite contact_name on outbound messages (fromMe), because pushName is our own display name.
        // IMPORTANT: Do NOT overwrite contact_name if conversation already has a linked client (manual name edit protection)
        // IMPORTANT: If conversation is archived (archived_at is not null), unarchive it when a new message arrives
        const isArchived = conversation.archived_at !== null;
        
        // Only update contact_name from pushName if:
        // 1. Message is from client (not from us)
        // 2. Conversation does NOT have a linked client (client_id is null)
        // This protects manual name edits made by users
        const shouldUpdateContactName = !isFromMe && !conversation.client_id && data.pushName;
        
        const updatePayload: Record<string, unknown> = {
          last_message_at: new Date().toISOString(),
          contact_name: shouldUpdateContactName ? data.pushName : conversation.contact_name,
        };

        // If archived, unarchive and restore to appropriate handler
        if (isArchived) {
          updatePayload.archived_at = null;
          updatePayload.archived_reason = null;
          
          // Restore handler based on archived_next_responsible settings
          if (conversation.archived_next_responsible_type === 'ai' && conversation.archived_next_responsible_id) {
            updatePayload.current_handler = 'ai';
            updatePayload.current_automation_id = conversation.archived_next_responsible_id;
            updatePayload.assigned_to = null;
          } else if (conversation.archived_next_responsible_type === 'human' && conversation.archived_next_responsible_id) {
            updatePayload.current_handler = 'human';
            updatePayload.assigned_to = conversation.archived_next_responsible_id;
            updatePayload.current_automation_id = null;
          } else {
            // No next responsible defined, check instance defaults (AI takes priority)
            if (instance.default_automation_id) {
              updatePayload.current_handler = 'ai';
              updatePayload.current_automation_id = instance.default_automation_id;
              updatePayload.assigned_to = null;
            } else if (instance.default_assigned_to) {
              updatePayload.current_handler = 'human';
              updatePayload.assigned_to = instance.default_assigned_to;
              updatePayload.current_automation_id = null;
            } else {
              // No defaults, go to queue
              updatePayload.current_handler = 'human';
              updatePayload.assigned_to = null;
              updatePayload.current_automation_id = null;
            }
          }
          
          // Clear archived metadata
          updatePayload.archived_next_responsible_type = null;
          updatePayload.archived_next_responsible_id = null;
          
          logDebug('UNARCHIVE', `Unarchiving conversation due to new message`, { 
            requestId, 
            conversationId: conversation.id,
            newHandler: updatePayload.current_handler,
            restoredTo: updatePayload.assigned_to || updatePayload.current_automation_id
          });
        }

        const { error: updateConvError } = await supabaseClient
          .from('conversations')
          .update(updatePayload)
          .eq('id', conversation.id);

        if (updateConvError) {
          logDebug('ERROR', `Failed to update conversation`, { requestId, error: updateConvError });
        } else {
          logDebug('DB', `Updated conversation${isArchived ? ' (unarchived)' : ''}`, { requestId, conversationId: conversation.id });
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
            // Use debounce queue to batch multiple messages before AI processing
            // This prevents duplicate responses when client sends multiple messages rapidly
            const DEBOUNCE_SECONDS = 10; // Wait 10 seconds after last message before processing
            
            await queueMessageForAIProcessing(supabaseClient, {
              lawFirmId,
              conversationId: conversation.id,
              messageContent,
              messageType,
              contactName: data.pushName || phoneNumber,
              contactPhone: phoneNumber,
              remoteJid,
              instanceId: instance.id,
              instanceName: instance.instance_name,
              clientId: conversation.client_id || undefined,
            }, DEBOUNCE_SECONDS, requestId);
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
        const nowIso = new Date().toISOString();

        for (const ackData of ackMessages) {
          // Get message ID and ack status
          // Evolution sends WhatsApp message id as `keyId`
          const messageId = (ackData as any).keyId || ackData.id || ackData.key?.id;
          const ack =
            ackData.ack ??
            (ackData.status === 'READ'
              ? 4
              : ackData.status === 'DELIVERY_ACK'
                ? 3
                : null);

          if (!messageId) {
            logDebug('ACK', `No message ID in ACK data, skipping`, { requestId });
            continue;
          }

          logDebug('ACK', `Processing ACK for message`, {
            requestId,
            messageId,
            ack,
            status: ackData.status,
          });

          // ACK values: 0=error, 1=pending, 2=sent, 3=delivered, 4=read, 5=played
          if (ack === 3 || ackData.status === 'DELIVERY_ACK') {
            // Message delivered (2 grey ticks)
            logDebug('ACK', `Marking message as delivered: ${messageId}`, { requestId });

            const { error: updateError } = await supabaseClient
              .from('messages')
              .update({ status: 'delivered', delivered_at: nowIso })
              .eq('whatsapp_message_id', messageId)
              .is('read_at', null); // avoid downgrading if already read

            if (updateError) {
              logDebug('ERROR', `Failed to update message delivered status`, {
                requestId,
                error: updateError,
              });
            } else {
              logDebug('ACK', `Message marked as delivered successfully`, { requestId, messageId });
            }
          } else if (ack === 4 || ack === 5 || ackData.status === 'READ') {
            // Message read (2 blue ticks)
            logDebug('ACK', `Marking message as read: ${messageId}`, { requestId });

            const { error: updateError } = await supabaseClient
              .from('messages')
              .update({ status: 'read', read_at: nowIso, delivered_at: nowIso })
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
        const nowIso = new Date().toISOString();

        for (const ackData of ackMessages) {
          const messageId = (ackData as any).keyId || ackData.id || ackData.key?.id;
          const ack = ackData.ack;

          if (!messageId || ack === undefined) {
            logDebug('ACK', `Missing message ID or ack value, skipping`, { requestId });
            continue;
          }

          logDebug('ACK', `Processing ACK`, { requestId, messageId, ack });

          if (ack === 3) {
            const { error } = await supabaseClient
              .from('messages')
              .update({ status: 'delivered', delivered_at: nowIso })
              .eq('whatsapp_message_id', messageId)
              .is('read_at', null);

            if (error) {
              logDebug('ERROR', `Failed to update delivered status`, { requestId, error });
            } else {
              logDebug('ACK', `Message marked as delivered`, { requestId, messageId });
            }
          } else if (ack >= 4) {
            // Read or played
            const { error } = await supabaseClient
              .from('messages')
              .update({ status: 'read', read_at: nowIso, delivered_at: nowIso })
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
        
        // Handle message revocation (when sender deletes message for everyone)
        try {
          const deleteData = body.data as Record<string, unknown>;
          const messageObj = deleteData?.message as Record<string, unknown> | undefined;
          const keyObj = deleteData?.key as Record<string, unknown> | undefined;
          
          const messageId = (messageObj?.id as string) || 
                           (keyObj?.id as string) ||
                           (deleteData?.messageId as string) ||
                           (deleteData?.id as string);
          
          if (messageId) {
            logDebug('MESSAGE', `Marking message as revoked`, { requestId, messageId });
            
            const { error: revokeError } = await supabaseClient
              .from('messages')
              .update({ 
                is_revoked: true, 
                revoked_at: new Date().toISOString() 
              })
              .eq('whatsapp_message_id', messageId);
            
            if (revokeError) {
              logDebug('MESSAGE', `Failed to mark message as revoked`, { 
                requestId, 
                messageId, 
                error: revokeError 
              });
            } else {
              logDebug('MESSAGE', `Message marked as revoked successfully`, { 
                requestId, 
                messageId 
              });
            }
          } else {
            logDebug('MESSAGE', `Could not extract message ID from delete event`, { 
              requestId, 
              deleteData 
            });
          }
        } catch (deleteErr) {
          logDebug('MESSAGE', `Error processing message delete`, { 
            requestId, 
            error: String(deleteErr) 
          });
        }
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