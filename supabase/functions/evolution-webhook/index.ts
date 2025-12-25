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

        // Trigger n8n automation if:
        // 1. Message is NOT from me (incoming from client)
        // 2. Conversation handler is 'ai' (not handed off to human)
        // 3. needs_human_handoff is false
        if (!isFromMe && conversation.current_handler === 'ai' && !conversation.needs_human_handoff) {
          logDebug('N8N', `Checking for active automations`, { requestId, conversationId: conversation.id });

          // Find active automation for this conversation
          const { data: automations, error: autoError } = await supabaseClient
            .from('automations')
            .select('*')
            .eq('law_firm_id', lawFirmId)
            .eq('is_active', true)
            .or('trigger_type.eq.new_conversation,trigger_type.eq.keyword');

          if (autoError) {
            logDebug('ERROR', `Failed to fetch automations`, { requestId, error: autoError });
          } else if (automations && automations.length > 0) {
            // Find matching automation
            let matchedAutomation = null;

            for (const auto of automations) {
              if (auto.trigger_type === 'new_conversation') {
                // Check if this is a new conversation (no previous messages from system)
                const { count } = await supabaseClient
                  .from('messages')
                  .select('*', { count: 'exact', head: true })
                  .eq('conversation_id', conversation.id)
                  .eq('is_from_me', true);

                if (count === 0 || count === null) {
                  matchedAutomation = auto;
                  break;
                }
              } else if (auto.trigger_type === 'keyword' && auto.trigger_config?.keywords) {
                // Check for keyword match
                const keywords = auto.trigger_config.keywords as string[];
                const msgLower = messageContent.toLowerCase();
                if (keywords.some(kw => msgLower.includes(kw.toLowerCase()))) {
                  matchedAutomation = auto;
                  break;
                }
              } else if (auto.trigger_type === 'department_entry' && auto.trigger_config?.departmentId) {
                // Check if conversation is in the specified department
                if (conversation.department_id === auto.trigger_config.departmentId) {
                  matchedAutomation = auto;
                  break;
                }
              }
            }

            if (matchedAutomation && matchedAutomation.webhook_url) {
              logDebug('N8N', `Matched automation, triggering n8n`, { 
                requestId, 
                automationId: matchedAutomation.id,
                automationName: matchedAutomation.name,
                webhookUrl: matchedAutomation.webhook_url
              });

              // Fetch recent messages for context
              const { data: recentMessages } = await supabaseClient
                .from('messages')
                .select('*')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(20);

              // Fetch department name
              let departmentName = null;
              if (conversation.department_id) {
                const { data: dept } = await supabaseClient
                  .from('departments')
                  .select('name')
                  .eq('id', conversation.department_id)
                  .single();
                departmentName = dept?.name;
              }

              // Prepare n8n payload
              const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/n8n-callback`;
              
              const n8nPayload = {
                conversationId: conversation.id,
                leadPhone: phoneNumber,
                leadName: conversation.contact_name || data.pushName || phoneNumber,
                department: departmentName,
                departmentId: conversation.department_id,
                messages: (recentMessages || []).reverse().map((msg: any) => ({
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
                  canChangeStatus: matchedAutomation.trigger_config?.canChangeStatus ?? true,
                  canMoveDepartment: matchedAutomation.trigger_config?.canMoveDepartment ?? true,
                },
                automation: {
                  id: matchedAutomation.id,
                  name: matchedAutomation.name,
                  prompt: matchedAutomation.ai_prompt || '',
                },
                callbackUrl,
              };

              // Send to n8n asynchronously (don't wait for response)
              // Use EdgeRuntime.waitUntil for background processing
              const sendToN8n = async () => {
                try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 25000);

                  const n8nResponse = await fetch(matchedAutomation.webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(n8nPayload),
                    signal: controller.signal,
                  });

                  clearTimeout(timeoutId);

                  const n8nStatus = n8nResponse.status;
                  logDebug('N8N', `n8n response`, { requestId, status: n8nStatus });

                  // Log the trigger
                  await supabaseClient
                    .from('webhook_logs')
                    .insert({
                      automation_id: matchedAutomation.id,
                      direction: 'outgoing',
                      payload: n8nPayload as unknown as Record<string, unknown>,
                      status_code: n8nStatus,
                    });

                  // Update automation stats - ignore if RPC doesn't exist
                  if (n8nResponse.ok) {
                    try {
                      await supabaseClient.rpc('increment_automation_success', { 
                        automation_id: matchedAutomation.id 
                      });
                    } catch {
                      // RPC may not exist, ignore
                    }
                  }
                } catch (n8nError) {
                  const isTimeout = n8nError instanceof Error && n8nError.name === 'AbortError';
                  logDebug('ERROR', isTimeout ? `n8n timeout` : `n8n error`, { 
                    requestId, 
                    error: n8nError instanceof Error ? n8nError.message : n8nError 
                  });

                  // Flag for human handoff on timeout/error
                  await supabaseClient
                    .from('conversations')
                    .update({ 
                      needs_human_handoff: true,
                      current_handler: 'human',
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', conversation.id);

                  // Log error
                  await supabaseClient
                    .from('webhook_logs')
                    .insert({
                      automation_id: matchedAutomation.id,
                      direction: 'outgoing',
                      payload: n8nPayload as unknown as Record<string, unknown>,
                      error_message: isTimeout ? 'Timeout' : String(n8nError),
                      status_code: isTimeout ? 408 : 500,
                    });
                }
              };

              // Run in background - don't await
              sendToN8n();
              logDebug('N8N', `n8n trigger dispatched to background`, { requestId });
            } else {
              logDebug('N8N', `No matching automation found`, { requestId });
            }
          }
        } else {
          logDebug('N8N', `Skipping n8n trigger`, { 
            requestId, 
            isFromMe, 
            handler: conversation.current_handler,
            needsHuman: conversation.needs_human_handoff
          });
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