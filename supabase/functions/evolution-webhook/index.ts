import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      .select('*, law_firms(id, name)')
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
      instanceName: instance.instance_name
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
          const contactName = data.pushName || phoneNumber;
          logDebug('DB', `Creating new conversation for: ${contactName}`, { requestId });
          
          const { data: newConv, error: createError } = await supabaseClient
            .from('conversations')
            .insert({
              law_firm_id: lawFirmId,
              remote_jid: remoteJid,
              contact_name: contactName,
              contact_phone: phoneNumber,
              status: 'novo_contato',
              current_handler: 'ai',
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
          logDebug('DB', `Created new conversation`, { requestId, conversationId: conversation.id });
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

        // Save message
        logDebug('DB', `Saving message to database`, { requestId, messageId: data.key.id });
        
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
          // Check if it's a duplicate message
          if (msgError.code === '23505') {
            logDebug('MESSAGE', `Duplicate message ignored`, { requestId, messageId: data.key.id });
          } else {
            logDebug('ERROR', `Failed to save message`, { requestId, error: msgError, code: msgError.code });
          }
        } else {
          logDebug('MESSAGE', `Message saved successfully`, { requestId, dbMessageId: savedMessage?.id, whatsappId: data.key.id });
        }

        // Update conversation last_message_at
        const { error: updateConvError } = await supabaseClient
          .from('conversations')
          .update({ 
            last_message_at: new Date().toISOString(),
            contact_name: data.pushName || conversation.contact_name,
          })
          .eq('id', conversation.id);

        if (updateConvError) {
          logDebug('ERROR', `Failed to update conversation last_message_at`, { requestId, error: updateConvError });
        } else {
          logDebug('DB', `Updated conversation last_message_at`, { requestId, conversationId: conversation.id });
        }
        break;
      }

      case 'messages.update': {
        logDebug('MESSAGE', `Message update event received`, { requestId, data: body.data });
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