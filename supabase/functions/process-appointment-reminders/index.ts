import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Appointment {
  id: string;
  law_firm_id: string;
  start_time: string;
  end_time: string;
  client_name: string | null;
  client_phone: string | null;
  status: string;
  reminder_sent_at: string | null;
  confirmation_sent_at: string | null;
  service: {
    id: string;
    name: string;
    duration_minutes: number;
  } | null;
}

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  is_default: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[appointment-reminders] Starting reminder processing...");

    // Get appointments that need reminders (24h before, reminder not sent yet)
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    const { data: pendingReminders, error: reminderError } = await supabase
      .from("appointments")
      .select("id, law_firm_id, start_time, end_time, client_name, client_phone, status, reminder_sent_at, confirmation_sent_at, service:services(id, name, duration_minutes)")
      .in("status", ["scheduled", "confirmed"])
      .is("reminder_sent_at", null)
      .gte("start_time", in23Hours.toISOString())
      .lte("start_time", in24Hours.toISOString())
      .not("client_phone", "is", null);

    if (reminderError) {
      console.error("[appointment-reminders] Error fetching reminders:", reminderError);
      throw reminderError;
    }

    console.log(`[appointment-reminders] Found ${pendingReminders?.length || 0} appointments needing reminders`);

    // Get appointments needing confirmation (2h before, confirmation not sent)
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 1 * 60 * 60 * 1000);

    const { data: pendingConfirmations, error: confirmError } = await supabase
      .from("appointments")
      .select("id, law_firm_id, start_time, end_time, client_name, client_phone, status, reminder_sent_at, confirmation_sent_at, service:services(id, name, duration_minutes)")
      .eq("status", "scheduled")
      .is("confirmation_sent_at", null)
      .gte("start_time", in1Hour.toISOString())
      .lte("start_time", in2Hours.toISOString())
      .not("client_phone", "is", null);

    if (confirmError) {
      console.error("[appointment-reminders] Error fetching confirmations:", confirmError);
      throw confirmError;
    }

    console.log(`[appointment-reminders] Found ${pendingConfirmations?.length || 0} appointments needing confirmation`);

    const results = {
      reminders_sent: 0,
      confirmations_sent: 0,
      errors: [] as string[],
    };

    // Process reminders (24h before)
    for (const appointment of (pendingReminders || []) as unknown as Appointment[]) {
      try {
        const sent = await sendWhatsAppMessage(
          supabase,
          appointment,
          "reminder"
        );

        if (sent) {
          await supabase
            .from("appointments")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", appointment.id);
          results.reminders_sent++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`Reminder ${appointment.id}: ${msg}`);
      }
    }

    // Process confirmations (2h before)
    for (const appointment of (pendingConfirmations || []) as unknown as Appointment[]) {
      try {
        const sent = await sendWhatsAppMessage(
          supabase,
          appointment,
          "confirmation"
        );

        if (sent) {
          await supabase
            .from("appointments")
            .update({ confirmation_sent_at: new Date().toISOString() })
            .eq("id", appointment.id);
          results.confirmations_sent++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`Confirmation ${appointment.id}: ${msg}`);
      }
    }

    console.log("[appointment-reminders] Processing complete:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[appointment-reminders] Critical error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendWhatsAppMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  appointment: Appointment,
  type: "reminder" | "confirmation"
): Promise<boolean> {
  if (!appointment.client_phone) {
    console.log(`[appointment-reminders] No phone for appointment ${appointment.id}`);
    return false;
  }

  // Get law firm settings
  const { data: lawFirm } = await supabase
    .from("law_firms")
    .select("name")
    .eq("id", appointment.law_firm_id)
    .single();

  // Get default WhatsApp instance for this law firm
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("id, instance_name, api_url, api_key")
    .eq("law_firm_id", appointment.law_firm_id)
    .eq("is_default", true)
    .eq("status", "connected")
    .single();

  if (!instance) {
    console.log(`[appointment-reminders] No connected WhatsApp instance for law_firm ${appointment.law_firm_id}`);
    return false;
  }

  const startDate = new Date(appointment.start_time);
  const endDate = new Date(appointment.end_time);
  const dateStr = startDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const startTimeStr = startDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTimeStr = endDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeRangeStr = `${startTimeStr} às ${endTimeStr}`;

  const serviceName = appointment.service?.name || "Agendamento";
  const companyName = lawFirm?.name || "Empresa";
  const clientName = appointment.client_name?.split(" ")[0] || "Cliente";

  let message: string;

  if (type === "reminder") {
    message = `Olá ${clientName}! 👋\n\n` +
      `Lembramos que você tem um agendamento amanhã:\n\n` +
      `📅 *${dateStr}*\n` +
      `🕐 *${timeRangeStr}*\n` +
      `📋 *${serviceName}*\n\n` +
      `Local: ${companyName}\n\n` +
      `Aguardamos você! Caso precise reagendar, entre em contato.`;
  } else {
    message = `Olá ${clientName}! 👋\n\n` +
      `Seu agendamento é em breve:\n\n` +
      `📅 *${dateStr}*\n` +
      `🕐 *${timeRangeStr}*\n` +
      `📋 *${serviceName}*\n\n` +
      `Por favor, *confirme sua presença* respondendo:\n` +
      `✅ *SIM* - Confirmo\n` +
      `❌ *NÃO* - Não poderei comparecer\n\n` +
      `Aguardamos sua confirmação!`;
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
    console.error(`[appointment-reminders] Failed to send ${type}:`, errorData);
    return false;
  }

  console.log(`[appointment-reminders] Sent ${type} for appointment ${appointment.id}`);
  return true;
}
