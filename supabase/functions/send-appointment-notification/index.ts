import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { humanDelay, DELAY_CONFIG } from "../_shared/human-delay.ts";

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { appointment_id, type } = await req.json();

    if (!appointment_id) {
      return new Response(
        JSON.stringify({ error: "appointment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-appointment-notification] Processing ${type} notification for appointment ${appointment_id}`);

    // Get appointment with service details
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select("*, service:services(id, name, duration_minutes)")
      .eq("id", appointment_id)
      .single();

    if (aptError || !appointment) {
      console.error("[send-appointment-notification] Appointment not found:", aptError);
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get law firm info including timezone
    const { data: lawFirm } = await supabase
      .from("law_firms")
      .select("name, timezone")
      .eq("id", appointment.law_firm_id)
      .single();

    // Format date/time with company timezone (default: São Paulo)
    const startDate = new Date(appointment.start_time);
    const endDate = new Date(appointment.end_time);
    const timeZone = lawFirm?.timezone || "America/Sao_Paulo";
    
    const dateStr = startDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone,
    });
    const startTimeStr = startDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    const endTimeStr = endDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    // Full time range: "08:05 às 10:35"
    const timeRangeStr = `${startTimeStr} às ${endTimeStr}`;

    const serviceName = appointment.service?.name || "Agendamento";
    const companyName = lawFirm?.name || "Empresa";
    const clientName = appointment.client_name?.split(" ")[0] || "Cliente";

    let whatsappMessage: string;
    let emailSubject: string;
    let emailHtml: string;

    if (type === "created") {
      whatsappMessage = `Olá ${clientName}! 👋\n\n` +
        `Seu agendamento foi confirmado com sucesso! ✅\n\n` +
        `📅 *${dateStr}*\n` +
        `🕐 *${timeRangeStr}*\n` +
        `📋 *${serviceName}*\n` +
        `📍 *${companyName}*\n\n` +
        `Você receberá um lembrete 24h antes.\n\n` +
        `Caso precise reagendar ou cancelar, entre em contato conosco.\n\n` +
        `Aguardamos você! 😊`;

      emailSubject = `✅ Agendamento Confirmado - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #10b981;">Agendamento Confirmado! ✅</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Seu agendamento foi confirmado com sucesso!</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
            <p style="margin: 8px 0;"><strong>📍 Local:</strong> ${companyName}</p>
          </div>
          <p>Você receberá um lembrete 24h antes do seu agendamento.</p>
          <p>Caso precise reagendar ou cancelar, entre em contato conosco.</p>
          <p style="margin-top: 30px;">Aguardamos você! 😊</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;
    } else if (type === "cancelled") {
      whatsappMessage = `Olá ${clientName}!\n\n` +
        `Seu agendamento foi cancelado:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeRangeStr}\n` +
        `📋 ${serviceName}\n\n` +
        `Se desejar reagendar, entre em contato conosco.\n\n` +
        `${companyName}`;

      emailSubject = `❌ Agendamento Cancelado - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #ef4444;">Agendamento Cancelado</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Seu agendamento foi cancelado:</p>
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
          </div>
          <p>Se desejar reagendar, entre em contato conosco.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;
    } else if (type === "updated") {
      whatsappMessage = `Olá ${clientName}!\n\n` +
        `Seu agendamento foi reagendado! 📅\n\n` +
        `📅 *Nova data:* ${dateStr}\n` +
        `🕐 *Novo horário:* ${timeRangeStr}\n` +
        `📋 *${serviceName}*\n` +
        `📍 *${companyName}*\n\n` +
        `Caso tenha dúvidas, entre em contato.\n\n` +
        `Aguardamos você! 😊`;

      emailSubject = `📅 Agendamento Reagendado - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #3b82f6;">Agendamento Reagendado 📅</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Seu agendamento foi reagendado para uma nova data!</p>
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Nova Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Novo Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
            <p style="margin: 8px 0;"><strong>📍 Local:</strong> ${companyName}</p>
          </div>
          <p>Caso tenha dúvidas, entre em contato conosco.</p>
          <p style="margin-top: 30px;">Aguardamos você! 😊</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      whatsapp: { sent: false, error: null as string | null },
      email: { sent: false, error: null as string | null },
    };

    // Send WhatsApp notification
    if (appointment.client_phone) {
      try {
        // First try to get the instance specified in the appointment
        let instance = null;
        
        if (appointment.whatsapp_instance_id) {
          // Try to get specific instance regardless of status (user chose it)
          const { data: specificInstance } = await supabase
            .from("whatsapp_instances")
            .select("id, instance_name, api_url, api_key, status")
            .eq("id", appointment.whatsapp_instance_id)
            .single();
          instance = specificInstance;
          console.log(`[send-appointment-notification] Specific instance: ${specificInstance?.instance_name}, status: ${specificInstance?.status}`);
        }
        
        // Fallback to any instance for this law firm (prefer connected, but try others)
        if (!instance) {
          // First try connected
          const { data: connectedInstance } = await supabase
            .from("whatsapp_instances")
            .select("id, instance_name, api_url, api_key, status")
            .eq("law_firm_id", appointment.law_firm_id)
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();
          
          if (connectedInstance) {
            instance = connectedInstance;
          } else {
            // Fallback to any instance (connecting, awaiting_qr, etc.)
            const { data: anyInstance } = await supabase
              .from("whatsapp_instances")
              .select("id, instance_name, api_url, api_key, status")
              .eq("law_firm_id", appointment.law_firm_id)
              .limit(1)
              .maybeSingle();
            instance = anyInstance;
          }
          console.log(`[send-appointment-notification] Fallback instance: ${instance?.instance_name}, status: ${instance?.status}`);
        }

        if (instance) {
          const phone = appointment.client_phone.replace(/\D/g, "");
          const remoteJid = phone.startsWith("55") ? `${phone}@s.whatsapp.net` : `55${phone}@s.whatsapp.net`;

          const apiUrl = (instance.api_url as string).replace(/\/$/, "");

          // Apply human-like jitter before sending (5-10s for notifications)
          await humanDelay(DELAY_CONFIG.REMINDER.min, DELAY_CONFIG.REMINDER.max, '[NOTIFICATION]');

          const response = await fetch(
            `${apiUrl}/message/sendText/${instance.instance_name}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: instance.api_key as string,
              },
              body: JSON.stringify({
                number: remoteJid,
                text: whatsappMessage,
              }),
            }
          );

          if (response.ok) {
            results.whatsapp.sent = true;
            console.log(`[send-appointment-notification] WhatsApp sent for ${appointment_id}`);
            
            // Save the message to the conversation for system sync
            if (appointment.conversation_id) {
              try {
                await supabase
                  .from("messages")
                  .insert({
                    conversation_id: appointment.conversation_id,
                    law_firm_id: appointment.law_firm_id,
                    content: whatsappMessage,
                    direction: "outgoing",
                    sender_type: "ai",
                    sender_name: "Sistema",
                    status: "sent",
                    remote_jid: remoteJid,
                  });
                console.log(`[send-appointment-notification] Message saved to conversation ${appointment.conversation_id}`);
              } catch (saveErr) {
                console.error("[send-appointment-notification] Failed to save message to conversation:", saveErr);
              }
            } else {
              // Try to find conversation by phone
              const { data: conv } = await supabase
                .from("conversations")
                .select("id")
                .eq("law_firm_id", appointment.law_firm_id)
                .ilike("remote_jid", `%${phone}%`)
                .limit(1)
                .maybeSingle();
              
              if (conv) {
                try {
                  await supabase
                    .from("messages")
                    .insert({
                      conversation_id: conv.id,
                      law_firm_id: appointment.law_firm_id,
                      content: whatsappMessage,
                      direction: "outgoing",
                      sender_type: "ai",
                      sender_name: "Sistema",
                      status: "sent",
                      remote_jid: remoteJid,
                    });
                  console.log(`[send-appointment-notification] Message saved to found conversation ${conv.id}`);
                } catch (saveErr) {
                  console.error("[send-appointment-notification] Failed to save message:", saveErr);
                }
              }
            }
          } else {
            const errorData = await response.text();
            results.whatsapp.error = errorData;
            console.error("[send-appointment-notification] WhatsApp failed:", errorData);
          }
        } else {
          results.whatsapp.error = "No connected WhatsApp instance";
          console.log("[send-appointment-notification] No connected WhatsApp instance");
        }
      } catch (err) {
        results.whatsapp.error = err instanceof Error ? err.message : "Unknown error";
        console.error("[send-appointment-notification] WhatsApp error:", err);
      }
    } else {
      console.log("[send-appointment-notification] No client phone, skipping WhatsApp");
    }

    // Send Email notification
    if (appointment.client_email) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const { error: emailError } = await resend.emails.send({
            from: "Suporte <suporte@miauchat.com.br>",
            to: [appointment.client_email],
            subject: emailSubject,
            html: emailHtml,
          });

          if (emailError) {
            results.email.error = emailError.message;
            console.error("[send-appointment-notification] Email failed:", emailError);
          } else {
            results.email.sent = true;
            console.log(`[send-appointment-notification] Email sent to ${appointment.client_email}`);
          }
        } else {
          results.email.error = "RESEND_API_KEY not configured";
          console.log("[send-appointment-notification] RESEND_API_KEY not configured");
        }
      } catch (err) {
        results.email.error = err instanceof Error ? err.message : "Unknown error";
        console.error("[send-appointment-notification] Email error:", err);
      }
    } else {
      console.log("[send-appointment-notification] No client email, skipping email");
    }

    console.log(`[send-appointment-notification] Completed ${type} notification for ${appointment_id}:`, results);

    return new Response(
      JSON.stringify({ success: true, type, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-appointment-notification] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
