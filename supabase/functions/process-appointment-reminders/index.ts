import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { humanDelay, DELAY_CONFIG } from "../_shared/human-delay.ts";

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
  pre_message_sent_at: string | null;
  conversation_id: string | null;
  service: {
    id: string;
    name: string;
    duration_minutes: number;
    pre_message_enabled: boolean | null;
    pre_message_text: string | null;
    pre_message_hours_before: number | null;
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

    // Get all law firms with their reminder settings
    const { data: lawFirms, error: lawFirmsError } = await supabase
      .from("law_firms")
      .select("id, reminder_hours_before, confirmation_hours_before");

    if (lawFirmsError) {
      console.error("[appointment-reminders] Error fetching law firms:", lawFirmsError);
      throw lawFirmsError;
    }

    // Create a map of law firm settings
    const lawFirmSettings = new Map<string, { reminderHours: number; confirmationHours: number }>();
    for (const lf of lawFirms || []) {
      lawFirmSettings.set(lf.id, {
        reminderHours: lf.reminder_hours_before ?? 24,
        confirmationHours: lf.confirmation_hours_before ?? 2,
      });
    }

    const now = new Date();
    const results = {
      reminders_sent: 0,
      confirmations_sent: 0,
      pre_messages_sent: 0,
      errors: [] as string[],
    };

    // Process reminders for each law firm with their custom settings
    for (const [lawFirmId, settings] of lawFirmSettings) {
      const reminderWindowEnd = new Date(now.getTime() + settings.reminderHours * 60 * 60 * 1000);
      const reminderWindowStart = new Date(now.getTime() + (settings.reminderHours - 1) * 60 * 60 * 1000);

      const { data: pendingReminders, error: reminderError } = await supabase
        .from("appointments")
        .select("id, law_firm_id, start_time, end_time, client_name, client_phone, status, reminder_sent_at, confirmation_sent_at, pre_message_sent_at, conversation_id, service:services(id, name, duration_minutes, pre_message_enabled, pre_message_text, pre_message_hours_before)")
        .eq("law_firm_id", lawFirmId)
        .in("status", ["scheduled", "confirmed"])
        .is("reminder_sent_at", null)
        .gte("start_time", reminderWindowStart.toISOString())
        .lte("start_time", reminderWindowEnd.toISOString())
        .not("client_phone", "is", null);

      if (reminderError) {
        console.error(`[appointment-reminders] Error fetching reminders for ${lawFirmId}:`, reminderError);
        continue;
      }

      // Process reminders
      for (const appointment of (pendingReminders || []) as unknown as Appointment[]) {
        try {
          const sent = await sendWhatsAppMessage(supabase, appointment, "reminder");
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

      // Process confirmations with custom settings
      const confirmationWindowEnd = new Date(now.getTime() + settings.confirmationHours * 60 * 60 * 1000);
      const confirmationWindowStart = new Date(now.getTime() + (settings.confirmationHours - 1) * 60 * 60 * 1000);

      const { data: pendingConfirmations, error: confirmError } = await supabase
        .from("appointments")
        .select("id, law_firm_id, start_time, end_time, client_name, client_phone, status, reminder_sent_at, confirmation_sent_at, pre_message_sent_at, conversation_id, service:services(id, name, duration_minutes, pre_message_enabled, pre_message_text, pre_message_hours_before)")
        .eq("law_firm_id", lawFirmId)
        .eq("status", "scheduled")
        .is("confirmation_sent_at", null)
        .gte("start_time", confirmationWindowStart.toISOString())
        .lte("start_time", confirmationWindowEnd.toISOString())
        .not("client_phone", "is", null);

      if (confirmError) {
        console.error(`[appointment-reminders] Error fetching confirmations for ${lawFirmId}:`, confirmError);
        continue;
      }

      // Process confirmations
      for (const appointment of (pendingConfirmations || []) as unknown as Appointment[]) {
        try {
          const sent = await sendWhatsAppMessage(supabase, appointment, "confirmation");
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

      // Process service-specific pre-messages
      // Get all services with pre_message_enabled for this law firm
      const { data: servicesWithPreMsg } = await supabase
        .from("services")
        .select("id, pre_message_hours_before")
        .eq("law_firm_id", lawFirmId)
        .eq("pre_message_enabled", true)
        .eq("is_active", true);

      for (const service of (servicesWithPreMsg || [])) {
        const preHours = service.pre_message_hours_before || 48;
        const preWindowEnd = new Date(now.getTime() + preHours * 60 * 60 * 1000);
        const preWindowStart = new Date(now.getTime() + (preHours - 1) * 60 * 60 * 1000);

        const { data: pendingPreMessages, error: preError } = await supabase
          .from("appointments")
          .select("id, law_firm_id, start_time, end_time, client_name, client_phone, status, reminder_sent_at, confirmation_sent_at, pre_message_sent_at, conversation_id, service:services(id, name, duration_minutes, pre_message_enabled, pre_message_text, pre_message_hours_before)")
          .eq("law_firm_id", lawFirmId)
          .eq("service_id", service.id)
          .in("status", ["scheduled", "confirmed"])
          .is("pre_message_sent_at", null)
          .gte("start_time", preWindowStart.toISOString())
          .lte("start_time", preWindowEnd.toISOString())
          .not("client_phone", "is", null);

        if (preError) {
          console.error(`[appointment-reminders] Error fetching pre-messages for service ${service.id}:`, preError);
          continue;
        }

        for (const appointment of (pendingPreMessages || []) as unknown as Appointment[]) {
          try {
            const sent = await sendWhatsAppMessage(supabase, appointment, "pre_message");
            if (sent) {
              await supabase
                .from("appointments")
                .update({ pre_message_sent_at: new Date().toISOString() })
                .eq("id", appointment.id);
              results.pre_messages_sent++;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            results.errors.push(`PreMessage ${appointment.id}: ${msg}`);
          }
        }
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
  type: "reminder" | "confirmation" | "pre_message"
): Promise<boolean> {
  if (!appointment.client_phone) {
    console.log(`[appointment-reminders] No phone for appointment ${appointment.id}`);
    return false;
  }

  // Get law firm settings including timezone and custom templates
  const { data: lawFirm } = await supabase
    .from("law_firms")
    .select("name, timezone, reminder_message_template, confirmation_message_template")
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
  const timeZone = lawFirm?.timezone || "America/Sao_Paulo";
  
  const dateStr = startDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
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
  const timeRangeStr = `${startTimeStr} às ${endTimeStr}`;

  const serviceName = appointment.service?.name || "Agendamento";
  const companyName = lawFirm?.name || "Empresa";
  const clientName = appointment.client_name?.split(" ")[0] || "Cliente";

  // Default messages
  const defaultReminderMessage = `Olá {nome}! 👋\n\n` +
    `Lembramos que você tem um agendamento amanhã:\n\n` +
    `📅 *{data}*\n` +
    `🕐 *{horario}*\n` +
    `📋 *{servico}*\n\n` +
    `Local: {empresa}\n\n` +
    `Aguardamos você! Caso precise reagendar, entre em contato.`;

  const defaultConfirmationMessage = `Olá {nome}! 👋\n\n` +
    `Seu agendamento é em breve:\n\n` +
    `📅 *{data}*\n` +
    `🕐 *{horario}*\n` +
    `📋 *{servico}*\n\n` +
    `Por favor, *confirme sua presença* respondendo:\n` +
    `✅ *SIM* - Confirmo\n` +
    `❌ *NÃO* - Não poderei comparecer\n\n` +
    `Aguardamos sua confirmação!`;

  // Use custom template if available, otherwise use default
  let messageTemplate: string;
  if (type === "reminder") {
    messageTemplate = lawFirm?.reminder_message_template || defaultReminderMessage;
  } else if (type === "confirmation") {
    messageTemplate = lawFirm?.confirmation_message_template || defaultConfirmationMessage;
  } else if (type === "pre_message") {
    // For pre_message, use the service-specific message
    if (!appointment.service?.pre_message_enabled || !appointment.service?.pre_message_text) {
      console.log(`[appointment-reminders] No pre-message configured for service ${appointment.service?.id}`);
      return false;
    }
    messageTemplate = appointment.service.pre_message_text;
  } else {
    return false;
  }

  // Replace variables in the template
  const message = messageTemplate
    .replace(/{nome}/g, clientName)
    .replace(/{data}/g, dateStr)
    .replace(/{horario}/g, timeRangeStr)
    .replace(/{servico}/g, serviceName)
    .replace(/{empresa}/g, companyName);

  // Send via Evolution API
  const phone = appointment.client_phone.replace(/\D/g, "");
  const remoteJid = phone.startsWith("55") ? `${phone}@s.whatsapp.net` : `55${phone}@s.whatsapp.net`;

  const apiUrl = (instance.api_url as string).replace(/\/$/, "");

  // Apply human-like jitter before sending (5-10s for reminders)
  await humanDelay(DELAY_CONFIG.REMINDER.min, DELAY_CONFIG.REMINDER.max, '[REMINDER]');

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

  // Save message to conversation for system sync
  let conversationId = appointment.conversation_id;
  
  if (!conversationId) {
    // Try to find conversation by phone
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("law_firm_id", appointment.law_firm_id)
      .ilike("remote_jid", `%${phone}%`)
      .limit(1)
      .maybeSingle();
    
    if (conv) {
      conversationId = conv.id;
    }
  }

  if (conversationId) {
    try {
      await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          law_firm_id: appointment.law_firm_id,
          content: message,
          direction: "outgoing",
          sender_type: "ai",
          sender_name: "Sistema",
          status: "sent",
          remote_jid: remoteJid,
        });
      console.log(`[appointment-reminders] Message saved to conversation ${conversationId}`);
    } catch (saveErr) {
      console.error("[appointment-reminders] Failed to save message:", saveErr);
    }
  }

  return true;
}
