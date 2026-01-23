import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Get all pending scheduled messages that are due
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
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("[process-scheduled-messages] Error fetching messages:", fetchError);
      throw fetchError;
    }

    console.log(`[process-scheduled-messages] Found ${pendingMessages?.length || 0} pending messages to process`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const message of pendingMessages || []) {
      results.processed++;

      try {
        const appointment = message.agenda_pro_appointments as any;
        
        // Skip if appointment was cancelled
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
            .update({ status: "skipped" })
            .eq("id", message.id);
          results.skipped++;
          continue;
        }

        // If we have an appointment, call the notification function
        if (message.appointment_id && appointment) {
          const notificationType = message.message_type === "pre_message" ? "pre_message" : "reminder";
          
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
              .update({ status: "sent", sent_at: nowIso })
              .eq("id", message.id);
            
            results.success++;
            console.log(`[process-scheduled-messages] Sent ${message.message_type} for ${message.id}`);
          } else {
            const errorData = await response.text();
            throw new Error(`Notification failed: ${errorData}`);
          }
        } else {
          // Custom message without appointment - send directly via WhatsApp
          if (message.channel === "whatsapp" && clientPhone) {
            // Get WhatsApp instance for this law firm
            const { data: instance } = await supabase
              .from("whatsapp_instances")
              .select("id, instance_name, connection_status")
              .eq("law_firm_id", message.law_firm_id)
              .eq("connection_status", "open")
              .limit(1)
              .single();

            if (instance) {
              const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
              const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

              if (evolutionApiUrl && evolutionApiKey) {
                const formattedPhone = clientPhone.replace(/\D/g, "");
                const phoneWithCountry = formattedPhone.startsWith("55") ? formattedPhone : `55${formattedPhone}`;

                const whatsappResponse = await fetch(
                  `${evolutionApiUrl}/message/sendText/${instance.instance_name}`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "apikey": evolutionApiKey,
                    },
                    body: JSON.stringify({
                      number: phoneWithCountry,
                      text: message.message_content,
                    }),
                  }
                );

                if (whatsappResponse.ok) {
                  await supabase
                    .from("agenda_pro_scheduled_messages")
                    .update({ status: "sent", sent_at: nowIso })
                    .eq("id", message.id);
                  
                  results.success++;
                  console.log(`[process-scheduled-messages] Sent custom message ${message.id} to ${phoneWithCountry}`);
                } else {
                  const errorText = await whatsappResponse.text();
                  throw new Error(`WhatsApp API error: ${errorText}`);
                }
              } else {
                throw new Error("Evolution API not configured");
              }
            } else {
              throw new Error("No active WhatsApp instance found");
            }
          } else {
            throw new Error(`Unsupported channel: ${message.channel}`);
          }
        }
      } catch (err) {
        results.failed++;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`${message.id}: ${errorMsg}`);
        console.error(`[process-scheduled-messages] Error processing ${message.id}:`, err);

        // Update status to failed
        await supabase
          .from("agenda_pro_scheduled_messages")
          .update({ status: "failed" })
          .eq("id", message.id);
      }
    }

    console.log("[process-scheduled-messages] Processing complete:", results);

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
