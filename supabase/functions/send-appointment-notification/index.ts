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

    if (!appointment.client_phone) {
      console.log("[send-appointment-notification] No client phone, skipping");
      return new Response(
        JSON.stringify({ success: false, reason: "No client phone" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get law firm info
    const { data: lawFirm } = await supabase
      .from("law_firms")
      .select("name")
      .eq("id", appointment.law_firm_id)
      .single();

    // Get default WhatsApp instance
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, api_url, api_key")
      .eq("law_firm_id", appointment.law_firm_id)
      .eq("is_default", true)
      .eq("status", "connected")
      .single();

    if (!instance) {
      console.log("[send-appointment-notification] No connected WhatsApp instance");
      return new Response(
        JSON.stringify({ success: false, reason: "No WhatsApp instance connected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    let message: string;

    if (type === "created") {
      message = `Olá ${clientName}! 👋\n\n` +
        `Seu agendamento foi confirmado com sucesso! ✅\n\n` +
        `📅 *${dateStr}*\n` +
        `🕐 *${timeStr}*\n` +
        `📋 *${serviceName}*\n` +
        `📍 *${companyName}*\n\n` +
        `Você receberá um lembrete 24h antes.\n\n` +
        `Caso precise reagendar ou cancelar, entre em contato conosco.\n\n` +
        `Aguardamos você! 😊`;
    } else if (type === "cancelled") {
      message = `Olá ${clientName}!\n\n` +
        `Seu agendamento foi cancelado:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}\n\n` +
        `Se desejar reagendar, entre em contato conosco.\n\n` +
        `${companyName}`;
    } else if (type === "updated") {
      message = `Olá ${clientName}!\n\n` +
        `Seu agendamento foi atualizado:\n\n` +
        `📅 *${dateStr}*\n` +
        `🕐 *${timeStr}*\n` +
        `📋 *${serviceName}*\n` +
        `📍 *${companyName}*\n\n` +
        `Caso tenha dúvidas, entre em contato.\n\n` +
        `Aguardamos você! 😊`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Evolution API
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
          text: message,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[send-appointment-notification] Failed to send:", errorData);
      return new Response(
        JSON.stringify({ success: false, error: errorData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-appointment-notification] Sent ${type} notification for appointment ${appointment_id}`);

    return new Response(
      JSON.stringify({ success: true, type }),
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
