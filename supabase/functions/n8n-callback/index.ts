import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-n8n-signature',
};

// n8n callback payload structure
interface N8nCallbackPayload {
  conversationId: string;
  replyText?: string;
  departmentSuggested?: string;
  needsHuman?: boolean;
  summaryForLawyer?: string;
  statusSuggested?: string;
  tags?: string[];
  // Metadata
  workflowId?: string;
  executionId?: string;
}

// Logging helper
function logDebug(section: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [n8n Callback] [${section}] ${message}${dataStr}`);
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

    const body: N8nCallbackPayload = await req.json();
    logDebug('PAYLOAD', `Received callback`, { 
      requestId, 
      conversationId: body.conversationId,
      hasReply: !!body.replyText,
      needsHuman: body.needsHuman,
      departmentSuggested: body.departmentSuggested
    });

    // Validate required fields
    if (!body.conversationId) {
      logDebug('ERROR', `Missing conversationId`, { requestId });
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch conversation with instance info
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('*, whatsapp_instances(*)')
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      logDebug('ERROR', `Conversation not found`, { requestId, error: convError });
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logDebug('DB', `Found conversation`, { 
      requestId, 
      remoteJid: conversation.remote_jid,
      instanceId: conversation.whatsapp_instance_id
    });

    // Update conversation with n8n response data
    const conversationUpdate: Record<string, unknown> = {
      n8n_last_response_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (body.needsHuman !== undefined) {
      conversationUpdate.needs_human_handoff = body.needsHuman;
      if (body.needsHuman) {
        conversationUpdate.current_handler = 'human';
      }
    }

    if (body.summaryForLawyer) {
      conversationUpdate.ai_summary = body.summaryForLawyer;
    }

    if (body.departmentSuggested) {
      // Look up department by name or ID
      const { data: dept } = await supabaseClient
        .from('departments')
        .select('id')
        .eq('law_firm_id', conversation.law_firm_id)
        .or(`id.eq.${body.departmentSuggested},name.ilike.%${body.departmentSuggested}%`)
        .limit(1)
        .single();

      if (dept) {
        conversationUpdate.department_id = dept.id;
        logDebug('DB', `Updating department`, { requestId, departmentId: dept.id });
      }
    }

    if (body.statusSuggested) {
      // Validate status is a valid enum value
      const validStatuses = ['novo_contato', 'triagem_ia', 'aguardando_documentos', 'em_analise', 'em_andamento', 'encerrado'];
      if (validStatuses.includes(body.statusSuggested)) {
        conversationUpdate.status = body.statusSuggested;
      }
    }

    if (body.tags && body.tags.length > 0) {
      conversationUpdate.tags = body.tags;
    }

    // Update conversation
    const { error: updateError } = await supabaseClient
      .from('conversations')
      .update(conversationUpdate)
      .eq('id', body.conversationId);

    if (updateError) {
      logDebug('ERROR', `Failed to update conversation`, { requestId, error: updateError });
    } else {
      logDebug('DB', `Updated conversation`, { requestId, updates: Object.keys(conversationUpdate) });
    }

    // Send reply via WhatsApp if provided
    let messageSent = false;
    let whatsappMessageId: string | null = null;

    if (body.replyText && body.replyText.trim() && conversation.whatsapp_instances) {
      const instance = conversation.whatsapp_instances;
      logDebug('WHATSAPP', `Sending reply via Evolution API`, { 
        requestId, 
        instanceName: instance.instance_name,
        replyLength: body.replyText.length
      });

      try {
        // Call Evolution API to send message
        const evolutionUrl = `${instance.api_url}/message/sendText/${instance.instance_name}`;
        
        const evolutionResponse = await fetch(evolutionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': instance.api_key || '',
          },
          body: JSON.stringify({
            number: conversation.remote_jid,
            text: body.replyText,
          }),
        });

        const evolutionData = await evolutionResponse.json();
        logDebug('WHATSAPP', `Evolution API response`, { 
          requestId, 
          status: evolutionResponse.status,
          data: evolutionData
        });

        if (evolutionResponse.ok && evolutionData.key?.id) {
          whatsappMessageId = evolutionData.key.id;
          messageSent = true;

          // Save message to database
          const { error: msgError } = await supabaseClient
            .from('messages')
            .insert({
              conversation_id: body.conversationId,
              whatsapp_message_id: whatsappMessageId,
              content: body.replyText,
              message_type: 'text',
              is_from_me: true,
              sender_type: 'ai',
              ai_generated: true,
              status: 'sent',
            });

          if (msgError) {
            logDebug('ERROR', `Failed to save message`, { requestId, error: msgError });
          } else {
            logDebug('DB', `Message saved`, { requestId, whatsappMessageId });
          }

          // Update conversation last_message_at
          await supabaseClient
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', body.conversationId);
        } else {
          logDebug('ERROR', `Evolution API error`, { requestId, response: evolutionData });
        }
      } catch (sendError) {
        logDebug('ERROR', `Failed to send WhatsApp message`, { 
          requestId, 
          error: sendError instanceof Error ? sendError.message : sendError 
        });
      }
    }

    // Log callback for auditing
    try {
      await supabaseClient
        .from('webhook_logs')
        .insert({
          direction: 'incoming',
          payload: body as unknown as Record<string, unknown>,
          response: { messageSent, whatsappMessageId },
          status_code: 200,
        });
    } catch (logError) {
      logDebug('AUDIT', `Failed to log callback (non-fatal)`, { requestId, error: logError });
    }

    logDebug('REQUEST', `Callback processed successfully`, { 
      requestId, 
      messageSent,
      needsHuman: body.needsHuman
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        requestId,
        messageSent,
        whatsappMessageId,
        conversationUpdated: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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
