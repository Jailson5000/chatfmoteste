import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

    // Get law firm info
    const { data: lawFirm } = await supabase
      .from("law_firms")
      .select("name")
      .eq("id", appointment.law_firm_id)
      .single();

    // Format date/time
    const startDate = new Date(appointment.start_time);
    const dateStr = startDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const timeStr = startDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

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
        `🕐 *${timeStr}*\n` +
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
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeStr}</p>
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
        `🕐 ${timeStr}\n` +
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
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeStr}</p>
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
        `🕐 *Novo horário:* ${timeStr}\n` +
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
            <p style="margin: 8px 0;"><strong>🕐 Novo Horário:</strong> ${timeStr}</p>
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
        // Get WhatsApp instance for this law firm (prioritize connected ones)
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("id, instance_name, api_url, api_key")
          .eq("law_firm_id", appointment.law_firm_id)
          .eq("status", "connected")
          .limit(1)
          .single();

        if (instance) {
          const phone = appointment.client_phone.replace(/\D/g, "");
          const remoteJid = phone.startsWith("55") ? `${phone}@s.whatsapp.net` : `55${phone}@s.whatsapp.net`;

          const apiUrl = (instance.api_url as string).replace(/\/$/, "");
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
