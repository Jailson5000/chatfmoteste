import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Payload sent to n8n
interface N8nTriggerPayload {
  conversationId: string;
  leadPhone: string;
  leadName: string;
  department?: string;
  departmentId?: string;
  messages: Array<{
    id: string;
    content: string;
    type: string;
    isFromMe: boolean;
    senderType: string;
    createdAt: string;
  }>;
  rules: {
    noLegalAdvice: boolean;
    handoffRequired: boolean;
    canChangeStatus: boolean;
    canMoveDepartment: boolean;
  };
  automation: {
    id: string;
    name: string;
    prompt: string;
  };
  callbackUrl: string;
}

// Logging helper
function logDebug(section: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [n8n Trigger] [${section}] ${message}${dataStr}`);
}

serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  logDebug('REQUEST', `Received ${req.method} request`, { requestId });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
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

    const { conversationId, automationId, messageLimit = 20 } = await req.json();
    logDebug('PAYLOAD', `Triggering n8n`, { requestId, conversationId, automationId });

    // Validate required fields
    if (!conversationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch conversation with department
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('*, departments(id, name)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      logDebug('ERROR', `Conversation not found`, { requestId, error: convError });
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch recent messages for context
    const { data: messages, error: msgError } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(messageLimit);

    if (msgError) {
      logDebug('ERROR', `Failed to fetch messages`, { requestId, error: msgError });
    }

    // Fetch automation config
    let automation = null;
    if (automationId) {
      const { data: autoData } = await supabaseClient
        .from('automations')
        .select('*')
        .eq('id', automationId)
        .single();
      automation = autoData;
    } else {
      // Find active automation for this trigger
      const { data: autoData } = await supabaseClient
        .from('automations')
        .select('*')
        .eq('law_firm_id', conversation.law_firm_id)
        .eq('is_active', true)
        .eq('trigger_type', 'new_conversation')
        .limit(1)
        .single();
      automation = autoData;
    }

    if (!automation) {
      logDebug('ERROR', `No active automation found`, { requestId });
      return new Response(
        JSON.stringify({ success: false, error: 'No active automation found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!automation.webhook_url) {
      logDebug('ERROR', `Automation has no webhook URL`, { requestId, automationId: automation.id });
      return new Response(
        JSON.stringify({ success: false, error: 'Automation webhook URL not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare payload for n8n
    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/n8n-callback`;
    
    const n8nPayload: N8nTriggerPayload = {
      conversationId: conversation.id,
      leadPhone: conversation.contact_phone || conversation.remote_jid?.split('@')[0] || '',
      leadName: conversation.contact_name || 'Desconhecido',
      department: conversation.departments?.name,
      departmentId: conversation.department_id,
      messages: (messages || []).reverse().map((msg) => ({
        id: msg.id,
        content: msg.content || '',
        type: msg.message_type,
        isFromMe: msg.is_from_me,
        senderType: msg.sender_type,
        createdAt: msg.created_at,
      })),
      rules: {
        noLegalAdvice: true,
        handoffRequired: true,
        canChangeStatus: automation.trigger_config?.canChangeStatus ?? true,
        canMoveDepartment: automation.trigger_config?.canMoveDepartment ?? true,
      },
      automation: {
        id: automation.id,
        name: automation.name,
        prompt: automation.ai_prompt || '',
      },
      callbackUrl,
    };

    logDebug('N8N', `Sending to n8n webhook`, { 
      requestId, 
      webhookUrl: automation.webhook_url,
      messageCount: n8nPayload.messages.length
    });

    // Send to n8n with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const n8nResponse = await fetch(automation.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(n8nPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const n8nStatus = n8nResponse.status;
      let n8nData = null;

      try {
        n8nData = await n8nResponse.json();
      } catch {
        // n8n might not return JSON
        n8nData = await n8nResponse.text();
      }

      logDebug('N8N', `n8n response`, { requestId, status: n8nStatus, data: n8nData });

      // Update automation stats
      if (n8nResponse.ok) {
        // Success - we'll track this when callback comes back
        logDebug('N8N', `Successfully triggered n8n workflow`, { requestId });
      } else {
        logDebug('ERROR', `n8n returned error`, { requestId, status: n8nStatus });
      }

      // Log the trigger
      await supabaseClient
        .from('webhook_logs')
        .insert({
          automation_id: automation.id,
          direction: 'outgoing',
          payload: n8nPayload as unknown as Record<string, unknown>,
          response: { status: n8nStatus, data: n8nData },
          status_code: n8nStatus,
        });

      return new Response(
        JSON.stringify({ 
          success: n8nResponse.ok,
          requestId,
          n8nStatus,
          triggered: true,
          automationId: automation.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      logDebug('ERROR', isTimeout ? `n8n timeout` : `n8n fetch error`, { 
        requestId, 
        error: fetchError instanceof Error ? fetchError.message : fetchError 
      });

      // Log the error
      await supabaseClient
        .from('webhook_logs')
        .insert({
          automation_id: automation.id,
          direction: 'outgoing',
          payload: n8nPayload as unknown as Record<string, unknown>,
          error_message: isTimeout ? 'Timeout after 30 seconds' : String(fetchError),
          status_code: isTimeout ? 408 : 500,
        });

      // If timeout/error, flag for human handoff
      await supabaseClient
        .from('conversations')
        .update({ 
          needs_human_handoff: true,
          current_handler: 'human',
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      return new Response(
        JSON.stringify({ 
          success: false,
          error: isTimeout ? 'n8n timeout - conversation flagged for human handoff' : 'Failed to trigger n8n',
          requestId,
          needsHuman: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    logDebug('ERROR', `Unhandled error`, { error: error instanceof Error ? error.message : error });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
