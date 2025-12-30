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
}

// Get AI provider configuration - checks plan and tenant settings
async function getAIProviderConfig(
  supabaseClient: any, 
  lawFirmId: string
): Promise<{ 
  provider: string; 
  capabilities: Record<string, boolean>;
  openaiApiKey: string | null;
  isEnterprise: boolean;
}> {
  try {
    // First, check if this law firm has Enterprise plan
    const { data: company } = await supabaseClient
      .from('companies')
      .select('plan_id, plans(name)')
      .eq('law_firm_id', lawFirmId)
      .single();

    const planName = (company?.plans as any)?.name || '';
    const isEnterprise = planName.toLowerCase() === 'enterprise';

    // If not Enterprise, always use internal AI
    if (!isEnterprise) {
      logDebug('AI_PROVIDER', 'Non-Enterprise plan - forcing internal AI', { lawFirmId, planName });
      return {
        provider: 'internal',
        capabilities: { auto_reply: true, summary: true, transcription: true, classification: true },
        openaiApiKey: null,
        isEnterprise: false,
      };
    }

    // Enterprise plan - check tenant-specific AI settings
    const { data: settings } = await supabaseClient
      .from('law_firm_settings')
      .select('ai_provider, ai_capabilities, openai_api_key')
      .eq('law_firm_id', lawFirmId)
      .single();

    const aiProvider = settings?.ai_provider || 'internal';
    const capabilities = settings?.ai_capabilities || {
      auto_reply: true,
      summary: true,
      transcription: true,
      classification: true,
    };

    logDebug('AI_PROVIDER', 'Enterprise plan - using tenant settings', { 
      lawFirmId, 
      provider: aiProvider,
      hasOpenAIKey: Boolean(settings?.openai_api_key)
    });

    return {
      provider: aiProvider,
      capabilities,
      openaiApiKey: settings?.openai_api_key || null,
      isEnterprise: true,
    };
  } catch (error) {
    logDebug('AI_PROVIDER', 'Error fetching AI provider config, defaulting to internal', { error });
    return { 
      provider: 'internal', 
      capabilities: { auto_reply: true, summary: true, transcription: true, classification: true },
      openaiApiKey: null,
      isEnterprise: false,
    };
  }
}

// Process messages with internal MiauChat AI (calls ai-chat edge function)
async function processWithInternalAI(
  supabaseClient: any, 
  context: AutomationContext, 
  aiConfig: { provider: string; capabilities: Record<string, boolean>; openaiApiKey?: string | null; isEnterprise?: boolean }
) {
  if (!aiConfig.capabilities.auto_reply) {
    logDebug('AI_PROVIDER', 'auto_reply capability disabled, skipping internal AI');
    return;
  }

  logDebug('AI_PROVIDER', 'Processing with MiauChat AI (internal)', { conversationId: context.conversationId });

  try {
    // Get automation prompt if available
    const { data: automations } = await supabaseClient
      .from('automations')
      .select('ai_prompt, ai_temperature')
      .eq('law_firm_id', context.lawFirmId)
      .eq('is_active', true)
      .limit(1);

    const automation = automations?.[0];
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Call internal ai-chat edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        conversationId: context.conversationId,
        message: context.messageContent,
        customPrompt: automation?.ai_prompt,
        temperature: automation?.ai_temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('AI_PROVIDER', 'Internal AI call failed', { status: response.status, error: errorText });
      return;
    }

    const result = await response.json();
    logDebug('AI_PROVIDER', 'Internal AI response received', { hasResponse: !!result.response });

    // Log the AI processing
    await supabaseClient
      .from('webhook_logs')
      .insert({
        direction: 'internal',
        payload: {
          provider: 'miauchat_ai',
          conversation_id: context.conversationId,
          message: context.messageContent,
        },
        status_code: 200,
      });

  } catch (error) {
    logDebug('AI_PROVIDER', 'Error processing with internal AI', { error: error instanceof Error ? error.message : error });
  }
}

// Process messages with OpenAI using company's own API key
async function processWithOpenAI(
  supabaseClient: any, 
  context: AutomationContext, 
  aiConfig: { provider: string; capabilities: Record<string, boolean>; openaiApiKey: string | null; isEnterprise: boolean }
) {
  if (!aiConfig.capabilities.auto_reply) {
    logDebug('AI_PROVIDER', 'auto_reply capability disabled, skipping OpenAI');
    return;
  }

  if (!aiConfig.openaiApiKey) {
    logDebug('AI_PROVIDER', 'OpenAI API key not configured, cannot process');
    return;
  }

  logDebug('AI_PROVIDER', 'Processing with OpenAI (company API key)', { conversationId: context.conversationId });

  try {
    // Get automation prompt if available
    const { data: automations } = await supabaseClient
      .from('automations')
      .select('ai_prompt, ai_temperature')
      .eq('law_firm_id', context.lawFirmId)
      .eq('is_active', true)
      .limit(1);

    const automation = automations?.[0];
    
    // Get recent messages for context
    const { data: recentMessages } = await supabaseClient
      .from('messages')
      .select('content, is_from_me, message_type, created_at')
      .eq('conversation_id', context.conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build messages array for OpenAI
    const systemPrompt = automation?.ai_prompt || 
      `Você é um assistente jurídico profissional. Responda de forma clara e objetiva.
       Nome do contato: ${context.contactName}
       Telefone: ${context.contactPhone}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(recentMessages?.reverse() || []).map((msg: any) => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content || ''
      })),
      { role: 'user', content: context.messageContent }
    ];

    // Call OpenAI API directly with company's key
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: automation?.ai_temperature || 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug('AI_PROVIDER', 'OpenAI API call failed', { status: response.status, error: errorText });
      return;
    }

    const result = await response.json();
    const aiResponse = result.choices?.[0]?.message?.content;

    if (aiResponse) {
      logDebug('AI_PROVIDER', 'OpenAI response received', { responseLength: aiResponse.length });

      // Log the AI processing
      await supabaseClient
        .from('webhook_logs')
        .insert({
          direction: 'internal',
          payload: {
            provider: 'openai_company',
            conversation_id: context.conversationId,
            message: context.messageContent,
            model: 'gpt-4o-mini',
          },
          status_code: 200,
        });
    }

  } catch (error) {
    logDebug('AI_PROVIDER', 'Error processing with OpenAI', { error: error instanceof Error ? error.message : error });
  }
}

// Process automations - respects AI_PROVIDER setting per tenant
async function processAutomations(supabaseClient: any, context: AutomationContext) {
  // Check AI provider configuration for this tenant
  const aiConfig = await getAIProviderConfig(supabaseClient, context.lawFirmId);
  
  // If provider is 'internal', skip n8n entirely
  if (aiConfig.provider === 'internal') {
    logDebug('AI_PROVIDER', 'Provider is INTERNAL - skipping n8n, will use MiauChat AI');
    await processWithInternalAI(supabaseClient, context, aiConfig);
    return;
  }

  // If provider is 'openai', use OpenAI with company's API key
  if (aiConfig.provider === 'openai') {
    logDebug('AI_PROVIDER', 'Provider is OPENAI - using company API key');
    await processWithOpenAI(supabaseClient, context, aiConfig);
    return;
  }
  
  // If provider is 'n8n', proceed with n8n
  logDebug('AI_PROVIDER', `Provider is ${aiConfig.provider.toUpperCase()} - routing to n8n`);
  
  const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  const n8nToken = Deno.env.get("N8N_INTERNAL_TOKEN");

  if (!n8nWebhookUrl) {
    logDebug('AUTOMATION', 'N8N_WEBHOOK_URL not configured');
    
    // If hybrid mode, fallback to internal AI
    if (aiConfig.provider === 'hybrid') {
      logDebug('AI_PROVIDER', 'Hybrid mode - falling back to internal AI');
      await processWithInternalAI(supabaseClient, context, aiConfig);
    } else {
      // N8N mode but not configured - log warning, don't fallback
      logDebug('AI_PROVIDER', 'N8N mode but not configured - NO FALLBACK (by design)');
    }
    return;
  }

  try {
    // Get active automations for this law firm
    const { data: automations, error: autoError } = await supabaseClient
      .from('automations')
      .select('*')
      .eq('law_firm_id', context.lawFirmId)
      .eq('is_active', true);

    if (autoError || !automations || automations.length === 0) {
      logDebug('AUTOMATION', 'No active automations found', { error: autoError });
      return;
    }

    logDebug('AUTOMATION', `Found ${automations.length} active automations`);

    for (const automation of automations) {
      const shouldTrigger = evaluateAutomationRules(automation, context);
      
      if (shouldTrigger) {
        logDebug('AUTOMATION', `Triggering automation: ${automation.name}`, { automationId: automation.id });
        
        // Get conversation details for context
        const { data: conversation } = await supabaseClient
          .from('conversations')
          .select(`
            *,
            client:clients(id, name, phone, email, document)
          `)
          .eq('id', context.conversationId)
          .single();

        // Get recent messages for context
        const { data: recentMessages } = await supabaseClient
          .from('messages')
          .select('content, is_from_me, message_type, created_at, sender_type')
          .eq('conversation_id', context.conversationId)
          .order('created_at', { ascending: false })
          .limit(15);

        // Build payload - contact_phone at root level for easy n8n access
        const currentHandler = String(conversation?.current_handler ?? 'ai').trim();
        const payload = {
          event: automation.trigger_type || 'new_message',
          // Root level fields for easy n8n access
          session_id: context.conversationId, // Use as Session ID in n8n Memory node
          contact_phone: context.contactPhone,
          contact_name: context.contactName,
          remote_jid: context.remoteJid,
          // Root-level fields for Switch rules in n8n
          fromMe: false, // this function only triggers for inbound messages
          current_handler: currentHandler,
          // Root-level chat input (string) to avoid n8n Memory "input key" issues
          input: context.messageContent,
          automation: {
            id: automation.id,
            name: automation.name,
            ai_prompt: automation.ai_prompt,
            ai_temperature: automation.ai_temperature,
          },
          timestamp: new Date().toISOString(),
          law_firm_id: context.lawFirmId,
          conversation: {
            id: context.conversationId,
            remote_jid: context.remoteJid,
            contact_name: context.contactName,
            contact_phone: context.contactPhone,
            status: conversation?.status || 'novo_contato',
            current_handler: currentHandler,
            ai_summary: conversation?.ai_summary,
            needs_human_handoff: conversation?.needs_human_handoff,
          },
          client: conversation?.client || null,
          whatsapp_instance: {
            id: context.instanceId,
            instance_name: context.instanceName,
          },
          message: {
            content: context.messageContent,
            type: context.messageType,
          },
          context: {
            recent_messages: recentMessages?.reverse() || [],
          },
        };

        // Send to N8N
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (n8nToken) {
          headers["Authorization"] = `Bearer ${n8nToken}`;
        }

        // Use webhook_url from automation if set, otherwise use global N8N_WEBHOOK_URL
        const targetUrl = automation.webhook_url || n8nWebhookUrl;

        try {
          const response = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });

          logDebug('AUTOMATION', `N8N response: ${response.status}`, { automationId: automation.id });

          // Log the webhook call
          await supabaseClient
            .from('webhook_logs')
            .insert({
              automation_id: automation.id,
              direction: 'outgoing',
              payload: payload,
              response: response.ok ? { status: response.status } : null,
              status_code: response.status,
              error_message: response.ok ? null : `HTTP ${response.status}`,
            });

          // Update conversation n8n_last_response_at
          await supabaseClient
            .from('conversations')
            .update({ n8n_last_response_at: new Date().toISOString() })
            .eq('id', context.conversationId);

        } catch (fetchError) {
          logDebug('AUTOMATION', `Failed to call N8N webhook`, { error: fetchError });
          
          await supabaseClient
            .from('webhook_logs')
            .insert({
              automation_id: automation.id,
              direction: 'outgoing',
              payload: payload,
              status_code: 0,
              error_message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
            });
        }
      }
    }
  } catch (error) {
    logDebug('AUTOMATION', `Error processing automations`, { error: error instanceof Error ? error.message : error });
  }
}

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

        // Update instance status
        const { error: updateError } = await supabaseClient
          .from('whatsapp_instances')
          .update({ 
            status: dbStatus, 
            updated_at: new Date().toISOString() 
          })
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
          
          // Transcribe audio for AI processing
          if (!data.key.fromMe) {
            try {
              logDebug('AUDIO', 'Attempting to transcribe audio for AI', { requestId, messageId: data.key.id });
              
              // Get audio via Evolution API
              const evolutionBaseUrl = Deno.env.get('EVOLUTION_BASE_URL') ?? '';
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