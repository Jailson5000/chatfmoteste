import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MINUTES = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[process-scheduled-messages] Starting scheduled messages processing...");

    const now = new Date();
    const nowIso = now.toISOString();

    // Get pending messages that are due OR failed messages that can be retried
    const { data: pendingMessages, error: fetchError } = await supabase
      .from("agenda_pro_scheduled_messages")
      .select(`
        id,
        law_firm_id,
        appointment_id,
        client_id,
        message_type,
        message_content,
        channel,
        scheduled_at,
        status,
        retry_count,
        last_attempt_at,
        agenda_pro_appointments(
          id,
          client_name,
          client_phone,
          client_email,
          start_time,
          status,
          professional_id,
          service_id,
          agenda_pro_clients(phone, email, name),
          agenda_pro_professionals(name, phone, email),
          agenda_pro_services(name)
        ),
        agenda_pro_clients(name, phone, email)
      `)
      .or(`status.eq.pending,and(status.eq.failed,retry_count.lt.${MAX_RETRY_COUNT})`)
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("[process-scheduled-messages] Error fetching messages:", fetchError);
      throw fetchError;
    }

    // Filter out failed messages that haven't waited long enough for retry
    const messagesToProcess = (pendingMessages || []).filter(msg => {
      if (msg.status === "failed" && msg.last_attempt_at) {
        const lastAttempt = new Date(msg.last_attempt_at);
        const retryAfter = new Date(lastAttempt.getTime() + RETRY_DELAY_MINUTES * 60 * 1000);
        if (now < retryAfter) {
          return false; // Not ready for retry yet
        }
      }
      return true;
    });

    console.log(`[process-scheduled-messages] Found ${pendingMessages?.length || 0} messages, ${messagesToProcess.length} ready to process`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      retried: 0,
      errors: [] as string[],
    };

    for (const message of messagesToProcess) {
      results.processed++;
      const isRetry = message.status === "failed";
      if (isRetry) results.retried++;

      try {
        const appointment = message.agenda_pro_appointments as any;
        
        // Skip if appointment was cancelled or completed
        if (appointment?.status === "cancelled" || appointment?.status === "completed") {
          console.log(`[process-scheduled-messages] Skipping ${message.id} - appointment is ${appointment?.status}`);
          await supabase
            .from("agenda_pro_scheduled_messages")
            .update({ status: "skipped", cancelled_at: nowIso })
            .eq("id", message.id);
          results.skipped++;
          continue;
        }

        // Get contact info from appointment or client
        const clientData = appointment?.agenda_pro_clients;
        const directClient = message.agenda_pro_clients as any;
        
        const clientPhone = appointment?.client_phone || clientData?.phone || directClient?.phone;
        const clientEmail = appointment?.client_email || clientData?.email || directClient?.email;
        const clientName = appointment?.client_name || clientData?.name || directClient?.name || "Cliente";

        if (!clientPhone && !clientEmail) {
          console.log(`[process-scheduled-messages] Skipping ${message.id} - no contact info`);
          await supabase
            .from("agenda_pro_scheduled_messages")
            .update({ 
              status: "skipped",
              last_error: "Sem informações de contato (telefone ou email)"
            })
            .eq("id", message.id);
          results.skipped++;
          continue;
        }

        // If we have an appointment, call the notification function
        if (message.appointment_id && appointment) {
          const notificationType = message.message_type === "pre_message" ? "pre_message" : "reminder";
          
          console.log(`[process-scheduled-messages] Sending ${notificationType} for appointment ${message.appointment_id} (attempt ${(message.retry_count || 0) + 1})`);
          
          const response = await fetch(`${supabaseUrl}/functions/v1/agenda-pro-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              appointment_id: message.appointment_id,
              type: notificationType,
            }),
          });

          if (response.ok) {
            await supabase
              .from("agenda_pro_scheduled_messages")
              .update({ 
                status: "sent", 
                sent_at: nowIso,
                last_attempt_at: nowIso,
                last_error: null
              })
              .eq("id", message.id);
            
            results.success++;
            console.log(`[process-scheduled-messages] ✅ Sent ${message.message_type} for ${message.id}`);
          } else {
            const errorData = await response.text();
            throw new Error(`Notification failed: ${errorData}`);
          }
        } else {
          // Custom message without appointment - send directly via WhatsApp
          if (message.channel === "whatsapp" && clientPhone) {
            // Get WhatsApp instance for this law firm (with api_url and api_key)
            const { data: instance, error: instanceError } = await supabase
              .from("whatsapp_instances")
              .select("id, instance_name, status, api_url, api_key")
              .eq("law_firm_id", message.law_firm_id)
              .eq("status", "connected")
              .limit(1)
              .maybeSingle();

            if (instanceError) {
              throw new Error(`Database error: ${instanceError.message}`);
            }

            if (instance && instance.api_url && instance.api_key) {
              const formattedPhone = clientPhone.replace(/\D/g, "");
              const phoneWithCountry = formattedPhone.startsWith("55") ? formattedPhone : `55${formattedPhone}`;
              const apiUrl = (instance.api_url as string).replace(/\/+$/, "");
              const apiKey = instance.api_key as string;
              const isUazapi = apiUrl.toLowerCase().includes("uazapi");

              console.log(`[process-scheduled-messages] Sending custom message to ${phoneWithCountry} via ${isUazapi ? 'uazapi' : 'evolution'} (attempt ${(message.retry_count || 0) + 1})`);

              let sendEndpoint: string;
              let sendHeaders: Record<string, string>;

              if (isUazapi) {
                sendEndpoint = `${apiUrl}/send/text`;
                sendHeaders = { "Content-Type": "application/json", token: apiKey };
              } else {
                sendEndpoint = `${apiUrl}/message/sendText/${instance.instance_name}`;
                sendHeaders = { "Content-Type": "application/json", apikey: apiKey };
              }

              const whatsappResponse = await fetch(sendEndpoint, {
                method: "POST",
                headers: sendHeaders,
                body: JSON.stringify({
                  number: phoneWithCountry,
                  text: message.message_content,
                }),
              });

              if (whatsappResponse.ok) {
                await supabase
                  .from("agenda_pro_scheduled_messages")
                  .update({ 
                    status: "sent", 
                    sent_at: nowIso,
                    last_attempt_at: nowIso,
                    last_error: null
                  })
                  .eq("id", message.id);
                
                results.success++;
                console.log(`[process-scheduled-messages] ✅ Sent custom message ${message.id} to ${phoneWithCountry}`);
              } else {
                const errorText = await whatsappResponse.text();
                throw new Error(`WhatsApp API error: ${errorText}`);
              }
            } else {
              throw new Error("No active WhatsApp instance with API credentials found for this company");
            }
          } else if (message.channel === "email" && clientEmail) {
            // Email channel - would be handled by a different service
            throw new Error("Email channel not implemented yet");
          } else {
            throw new Error(`Unsupported channel "${message.channel}" or missing contact (phone: ${!!clientPhone}, email: ${!!clientEmail})`);
          }
        }
      } catch (err) {
        results.failed++;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`${message.id}: ${errorMsg}`);
        console.error(`[process-scheduled-messages] ❌ Error processing ${message.id}:`, errorMsg);

        const newRetryCount = (message.retry_count || 0) + 1;
        const isFinalAttempt = newRetryCount >= MAX_RETRY_COUNT;

        // Update with error info and retry count
        await supabase
          .from("agenda_pro_scheduled_messages")
          .update({ 
            status: isFinalAttempt ? "failed" : "failed",
            retry_count: newRetryCount,
            last_error: errorMsg.substring(0, 500), // Limit error message length
            last_attempt_at: nowIso
          })
          .eq("id", message.id);

        if (isFinalAttempt) {
          console.log(`[process-scheduled-messages] ⚠️ Message ${message.id} permanently failed after ${MAX_RETRY_COUNT} attempts`);
        } else {
          console.log(`[process-scheduled-messages] 🔄 Message ${message.id} will retry (attempt ${newRetryCount}/${MAX_RETRY_COUNT})`);
        }
      }
    }

    console.log("[process-scheduled-messages] Processing complete:", JSON.stringify(results));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-scheduled-messages] Critical error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
