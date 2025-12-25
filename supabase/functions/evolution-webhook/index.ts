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

serve(async (req) => {
  console.log(`[Evolution Webhook] Received ${req.method} request`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    console.log(`[Evolution Webhook] Rejected non-POST request: ${req.method}`);
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
    console.log(`[Evolution Webhook] Raw body:`, rawBody);
    
    let body: EvolutionEvent;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error(`[Evolution Webhook] Failed to parse JSON:`, parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const normalizedEvent = normalizeEventName(body.event);
    console.log(`[Evolution Webhook] Event: ${body.event} (normalized: ${normalizedEvent}), Instance: ${body.instance}`);

    // Find the WhatsApp instance by instance_name
    const { data: instance, error: instanceError } = await supabaseClient
      .from('whatsapp_instances')
      .select('*, law_firms(id, name)')
      .eq('instance_name', body.instance)
      .single();

    if (instanceError || !instance) {
      console.log(`[Evolution Webhook] Instance not found: ${body.instance}, error:`, instanceError);
      // Return 200 to avoid Evolution API retrying
      return new Response(
        JSON.stringify({ success: true, message: 'Instance not found, event ignored' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Evolution Webhook] Found instance: ${instance.id} for law firm: ${instance.law_firm_id}`);
    const lawFirmId = instance.law_firm_id;

    // Handle events (support both formats: CONNECTION_UPDATE and connection.update)
    switch (normalizedEvent) {
      case 'connection.update': {
        const data = body.data as ConnectionUpdateData;
        console.log(`[Evolution Webhook] Connection update: ${data.state}`);
        
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
          console.error(`[Evolution Webhook] Failed to update status:`, updateError);
        } else {
          console.log(`[Evolution Webhook] Updated instance ${instance.instance_name} status to ${dbStatus}`);
        }
        break;
      }

      case 'qrcode.updated': {
        console.log(`[Evolution Webhook] QR code updated for instance: ${body.instance}`);
        
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
        console.log(`[Evolution Webhook] New message - remoteJid: ${data.key?.remoteJid}, fromMe: ${data.key?.fromMe}`);
        
        if (!data.key?.remoteJid) {
          console.log(`[Evolution Webhook] No remoteJid in message, skipping`);
          break;
        }

        // Extract phone number from remoteJid (format: 5511999999999@s.whatsapp.net)
        const remoteJid = data.key.remoteJid;
        const phoneNumber = remoteJid.split('@')[0];
        const isFromMe = data.key.fromMe;

        console.log(`[Evolution Webhook] Processing message from ${phoneNumber}, isFromMe: ${isFromMe}`);

        // Get or create conversation
        let { data: conversation, error: convError } = await supabaseClient
          .from('conversations')
          .select('*')
          .eq('remote_jid', remoteJid)
          .eq('law_firm_id', lawFirmId)
          .single();

        if (convError && convError.code === 'PGRST116') {
          // Conversation doesn't exist, create it
          const contactName = data.pushName || phoneNumber;
          console.log(`[Evolution Webhook] Creating new conversation for: ${contactName}`);
          
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
            console.error(`[Evolution Webhook] Failed to create conversation:`, createError);
            break;
          }
          conversation = newConv;
          console.log(`[Evolution Webhook] Created new conversation: ${conversation.id}`);
        } else if (convError) {
          console.error(`[Evolution Webhook] Error fetching conversation:`, convError);
          break;
        } else {
          console.log(`[Evolution Webhook] Found existing conversation: ${conversation.id}`);
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

        console.log(`[Evolution Webhook] Message content: "${messageContent.substring(0, 50)}...", type: ${messageType}`);

        // Save message
        const { error: msgError } = await supabaseClient
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
          });

        if (msgError) {
          // Check if it's a duplicate message
          if (msgError.code === '23505') {
            console.log(`[Evolution Webhook] Duplicate message ignored: ${data.key.id}`);
          } else {
            console.error(`[Evolution Webhook] Failed to save message:`, msgError);
          }
        } else {
          console.log(`[Evolution Webhook] Saved message: ${data.key.id}`);
        }

        // Update conversation last_message_at
        await supabaseClient
          .from('conversations')
          .update({ 
            last_message_at: new Date().toISOString(),
            contact_name: data.pushName || conversation.contact_name,
          })
          .eq('id', conversation.id);

        console.log(`[Evolution Webhook] Updated conversation last_message_at`);
        break;
      }

      case 'messages.update': {
        console.log(`[Evolution Webhook] Message update event received`);
        break;
      }

      case 'messages.delete': {
        console.log(`[Evolution Webhook] Message delete event received`);
        break;
      }

      case 'send.message': {
        console.log(`[Evolution Webhook] Send message event received`);
        break;
      }

      default:
        console.log(`[Evolution Webhook] Unhandled event: ${body.event} (normalized: ${normalizedEvent})`);
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
    } catch (logError) {
      console.log(`[Evolution Webhook] Failed to log webhook (non-fatal):`, logError);
    }

    return new Response(
      JSON.stringify({ success: true, event: body.event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Evolution Webhook] Error:', error);
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
