import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get the app URL for confirmation links
// Priority: BOOKING_URL (subdomain for bookings) > APP_URL > default (white-label)
const APP_URL = Deno.env.get("BOOKING_URL") || Deno.env.get("APP_URL") || "https://agendar.miauchat.com.br";

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

    console.log(`[agenda-pro-notification] Processing ${type} notification for appointment ${appointment_id}`);

    // Get appointment with all related data
    const { data: appointment, error: aptError } = await supabase
      .from("agenda_pro_appointments")
      .select(`
        *,
        agenda_pro_services(id, name, duration_minutes),
        agenda_pro_professionals(name),
        agenda_pro_clients(name, phone, email)
      `)
      .eq("id", appointment_id)
      .single();

    if (aptError || !appointment) {
      console.error("[agenda-pro-notification] Appointment not found:", aptError);
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get settings for business name and reminder config
    const { data: settings } = await supabase
      .from("agenda_pro_settings")
      .select("business_name, send_whatsapp_confirmation, send_email_confirmation, reminder_hours_before, reminder_2_enabled, reminder_2_value, reminder_2_unit")
      .eq("law_firm_id", appointment.law_firm_id)
      .single();

    // Get law firm info for fallback name and timezone
    const { data: lawFirm } = await supabase
      .from("law_firms")
      .select("name, timezone")
      .eq("id", appointment.law_firm_id)
      .single();

    // Format date/time with company timezone
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
    const timeRangeStr = `${startTimeStr} às ${endTimeStr}`;

    const serviceName = appointment.agenda_pro_services?.name || "Atendimento";
    const professionalName = appointment.agenda_pro_professionals?.name;
    const companyName = settings?.business_name || lawFirm?.name || "Empresa";
    const clientName = appointment.agenda_pro_clients?.name?.split(" ")[0] || appointment.client_name?.split(" ")[0] || "Cliente";
    const clientPhone = appointment.agenda_pro_clients?.phone || appointment.client_phone;
    const clientEmail = appointment.agenda_pro_clients?.email || appointment.client_email;

    // Generate confirmation link
    const confirmationLink = `${APP_URL}/confirmar?token=${appointment.confirmation_token}`;

    // Check which reminders will actually be sent based on time until appointment
    const now = new Date();
    const minutesUntilAppointment = (startDate.getTime() - now.getTime()) / (1000 * 60);
    
    // First reminder (configurable hours, default 24h)
    const reminder1Hours = settings?.reminder_hours_before || 24;
    const reminder1Minutes = reminder1Hours * 60;
    const willReceiveReminder1 = minutesUntilAppointment > reminder1Minutes;
    
    // Second reminder (configurable minutes or hours)
    const reminder2Enabled = settings?.reminder_2_enabled !== false; // default true
    const reminder2Value = settings?.reminder_2_value || 55;
    const reminder2Unit = settings?.reminder_2_unit || "minutes";
    const reminder2Minutes = reminder2Unit === "hours" ? reminder2Value * 60 : reminder2Value;
    const willReceiveReminder2 = reminder2Enabled && minutesUntilAppointment > reminder2Minutes;
    
    // Build reminder message conditionally - show the most relevant reminder info
    let reminderNote = "";
    if (willReceiveReminder1 && willReceiveReminder2) {
      // Both reminders will be sent
      const reminder2Text = reminder2Unit === "hours" 
        ? `${reminder2Value}h` 
        : `${reminder2Value}min`;
      reminderNote = `\nVocê receberá lembretes ${reminder1Hours}h e ${reminder2Text} antes.\n`;
    } else if (willReceiveReminder1) {
      // Only first reminder
      reminderNote = `\nVocê receberá um lembrete ${reminder1Hours}h antes.\n`;
    } else if (willReceiveReminder2) {
      // Only second reminder (appointment is soon)
      const reminder2Text = reminder2Unit === "hours" 
        ? `${reminder2Value}h` 
        : `${reminder2Value}min`;
      reminderNote = `\nVocê receberá um lembrete ${reminder2Text} antes.\n`;
    }
    // If neither, reminderNote stays empty

    let whatsappMessage: string;
    let emailSubject: string;
    let emailHtml: string;

    if (type === "created") {
      whatsappMessage = `Olá ${clientName}! 👋\n\n` +
        `Seu agendamento foi realizado com sucesso! ✅\n\n` +
        `📅 *${dateStr}*\n` +
        `🕐 *${timeRangeStr}*\n` +
        `📋 *${serviceName}*\n` +
        (professionalName ? `👤 *${professionalName}*\n` : "") +
        `📍 *${companyName}*\n\n` +
        `🔗 *Confirme sua presença:*\n${confirmationLink}` +
        reminderNote +
        `\nAguardamos você! 😊`;

      emailSubject = `✅ Confirme seu agendamento - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #10b981;">Agendamento Realizado! ✅</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Seu agendamento foi realizado com sucesso!</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
            ${professionalName ? `<p style="margin: 8px 0;"><strong>👤 Profissional:</strong> ${professionalName}</p>` : ""}
            <p style="margin: 8px 0;"><strong>📍 Local:</strong> ${companyName}</p>
          </div>
          <p><strong>Confirme sua presença clicando no botão abaixo:</strong></p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationLink}" style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Confirmar Presença
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Ou copie e cole este link no navegador:<br>
            <a href="${confirmationLink}">${confirmationLink}</a>
          </p>
          ${reminderNote ? `<p>${reminderNote.trim()}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;

      // Update appointment to mark confirmation link as sent
      await supabase
        .from("agenda_pro_appointments")
        .update({ confirmation_link_sent_at: new Date().toISOString() })
        .eq("id", appointment_id);

    } else if (type === "reminder") {
      whatsappMessage = `Olá ${clientName}! 🔔\n\n` +
        `Lembrete do seu agendamento:\n\n` +
        `📅 *${dateStr}*\n` +
        `🕐 *${timeRangeStr}*\n` +
        `📋 *${serviceName}*\n` +
        (professionalName ? `👤 *${professionalName}*\n` : "") +
        `📍 *${companyName}*\n\n` +
        `🔗 *Confirme sua presença:*\n${confirmationLink}\n\n` +
        `Aguardamos você! 😊`;

      emailSubject = `🔔 Lembrete: Agendamento em ${dateStr} - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #3b82f6;">Lembrete de Agendamento 🔔</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Passando para lembrar do seu agendamento!</p>
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
            ${professionalName ? `<p style="margin: 8px 0;"><strong>👤 Profissional:</strong> ${professionalName}</p>` : ""}
            <p style="margin: 8px 0;"><strong>📍 Local:</strong> ${companyName}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationLink}" style="background-color: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Confirmar Presença
            </a>
          </div>
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
        `🔗 *Confirme sua presença:*\n${confirmationLink}\n\n` +
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
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationLink}" style="background-color: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Confirmar Presença
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;

    } else if (type === "no_show") {
      // No-show message asking if client wants to reschedule
      whatsappMessage = `Olá ${clientName}! 😔\n\n` +
        `Sentimos sua falta no atendimento de hoje:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeRangeStr}\n` +
        `📋 ${serviceName}\n\n` +
        `Gostaria de reagendar? 📅\n\n` +
        `🔗 *Clique aqui para reagendar:*\n${confirmationLink}\n\n` +
        `Estamos à disposição!\n${companyName}`;

      emailSubject = `😔 Sentimos sua falta - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #f97316;">Sentimos sua falta! 😔</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Notamos que você não pôde comparecer ao seu atendimento:</p>
          <div style="background-color: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
          </div>
          <p><strong>Gostaria de reagendar?</strong></p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationLink}" style="background-color: #f97316; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Reagendar Atendimento
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;

    } else if (type === "pre_message") {
      whatsappMessage = `Olá ${clientName}! 🔔\n\n` +
        `Seu atendimento está chegando! Confira os detalhes:\n\n` +
        `📅 *${dateStr}*\n` +
        `🕐 *${timeRangeStr}*\n` +
        `📋 *${serviceName}*\n` +
        (professionalName ? `👤 *${professionalName}*\n` : "") +
        `📍 *${companyName}*\n\n` +
        `🔗 *Confirme sua presença:*\n${confirmationLink}\n\n` +
        `Nos vemos em breve! 😊\n${companyName}`;

      emailSubject = `🔔 Preparação para seu atendimento - ${companyName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #8b5cf6;">Seu atendimento está chegando! 🔔</h1>
          <p>Olá <strong>${clientName}</strong>,</p>
          <p>Estamos preparando tudo para o seu atendimento!</p>
          <div style="background-color: #f5f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
            <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
            <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
            ${professionalName ? `<p style="margin: 8px 0;"><strong>👤 Profissional:</strong> ${professionalName}</p>` : ""}
            <p style="margin: 8px 0;"><strong>📍 Local:</strong> ${companyName}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationLink}" style="background-color: #8b5cf6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Confirmar Presença
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
        </div>
      `;

      // Update appointment to mark pre_message as sent
      await supabase
        .from("agenda_pro_appointments")
        .update({ pre_message_sent_at: new Date().toISOString() })
        .eq("id", appointment_id);

    } else {
      return new Response(
        JSON.stringify({ error: "Invalid notification type. Use: created, reminder, cancelled, updated, no_show, pre_message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      whatsapp: { sent: false, error: null as string | null },
      email: { sent: false, error: null as string | null },
      ownerNotification: { sent: false, error: null as string | null },
      conversationCreated: { created: false, conversationId: null as string | null, error: null as string | null },
    };

    // Send WhatsApp notification to client
    if (clientPhone && settings?.send_whatsapp_confirmation !== false) {
      try {
        // Get connected WhatsApp instance for this law firm
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("id, instance_name, api_url, api_key, status, default_automation_id, default_assigned_to, default_department_id")
          .eq("law_firm_id", appointment.law_firm_id)
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();

        if (instance) {
          const phone = clientPhone.replace(/\D/g, "");
          const remoteJid = phone.startsWith("55") ? `${phone}@s.whatsapp.net` : `55${phone}@s.whatsapp.net`;
          const apiUrl = (instance.api_url as string).replace(/\/$/, "");
          const isUazapi = apiUrl.toLowerCase().includes("uazapi");

          const sendEndpoint = isUazapi
            ? `${apiUrl}/send/text`
            : `${apiUrl}/message/sendText/${instance.instance_name}`;
          const sendHeaders: Record<string, string> = isUazapi
            ? { "Content-Type": "application/json", token: instance.api_key as string }
            : { "Content-Type": "application/json", apikey: instance.api_key as string };

          const response = await fetch(sendEndpoint, {
            method: "POST",
            headers: sendHeaders,
            body: JSON.stringify({
              number: isUazapi ? remoteJid.replace("@s.whatsapp.net", "") : remoteJid,
              text: whatsappMessage,
            }),
          });

          if (response.ok) {
            results.whatsapp.sent = true;
            console.log(`[agenda-pro-notification] WhatsApp sent to client for ${appointment_id}`);

            // === CREATE/UPDATE CONVERSATION AND MESSAGE IN MAIN SYSTEM ===
            try {
              const fullClientName = appointment.agenda_pro_clients?.name || appointment.client_name || "Cliente";
              
              // === ROBUST CONVERSATION LOOKUP ===
              // Brazilian mobile numbers have variations with/without the "9" prefix
              // We prioritize searching by the last 8 digits which are unique
              const last8Digits = phone.slice(-8);
              
              // Generate possible remote_jid variations
              const possibleJids: string[] = [remoteJid];
              
              // If phone has the mobile "9" prefix (9 digits after DDD), also try without it
              if (phone.length >= 11) {
                const ddd = phone.startsWith("55") ? phone.slice(2, 4) : phone.slice(0, 2);
                const numberPart = phone.startsWith("55") ? phone.slice(4) : phone.slice(2);
                
                // If number starts with 9 (mobile), try without it
                if (numberPart.startsWith("9") && numberPart.length === 9) {
                  const without9 = `55${ddd}${numberPart.slice(1)}@s.whatsapp.net`;
                  possibleJids.push(without9);
                }
                // If number doesn't start with 9 but is 8 digits, try with 9
                else if (!numberPart.startsWith("9") && numberPart.length === 8) {
                  const with9 = `55${ddd}9${numberPart}@s.whatsapp.net`;
                  possibleJids.push(with9);
                }
              }
              
              console.log(`[agenda-pro-notification] Looking for conversation with JIDs: ${possibleJids.join(", ")} or phone ending in ${last8Digits}`);
              
              let existingConv: { id: string; client_id: string | null; contact_name: string | null; remote_jid: string | null } | null = null;
              
              // PRIORITY 1: Search by last 8 digits in remote_jid (most reliable for Brazilian numbers)
              const { data: convByJidSuffix } = await supabase
                .from("conversations")
                .select("id, client_id, contact_name, remote_jid")
                .eq("law_firm_id", appointment.law_firm_id)
                .eq("whatsapp_instance_id", instance.id)
                .ilike("remote_jid", `%${last8Digits}@s.whatsapp.net`)
                .order("last_message_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              
              if (convByJidSuffix) {
                existingConv = convByJidSuffix;
                console.log(`[agenda-pro-notification] Found existing conversation by remote_jid suffix: ${convByJidSuffix.remote_jid}`);
              }
              
              // PRIORITY 2: Try exact remote_jid matches
              if (!existingConv) {
                for (const jid of possibleJids) {
                  const { data: conv } = await supabase
                    .from("conversations")
                    .select("id, client_id, contact_name, remote_jid")
                    .eq("law_firm_id", appointment.law_firm_id)
                    .eq("remote_jid", jid)
                    .eq("whatsapp_instance_id", instance.id)
                    .maybeSingle();
                  
                  if (conv) {
                    existingConv = conv;
                    console.log(`[agenda-pro-notification] Found existing conversation by JID: ${jid}`);
                    break;
                  }
                }
              }
              
              // PRIORITY 3: Search by contact_phone suffix
              if (!existingConv) {
                const { data: convByPhone } = await supabase
                  .from("conversations")
                  .select("id, client_id, contact_name, remote_jid")
                  .eq("law_firm_id", appointment.law_firm_id)
                  .eq("whatsapp_instance_id", instance.id)
                  .ilike("contact_phone", `%${last8Digits}`)
                  .order("last_message_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                
                if (convByPhone) {
                  existingConv = convByPhone;
                  console.log(`[agenda-pro-notification] Found existing conversation by phone suffix: ${last8Digits}`);
                }
              }
              
              // PRIORITY 4: Check by linked client phone in clients table
              if (!existingConv) {
                const { data: clientMatch } = await supabase
                  .from("clients")
                  .select("id")
                  .eq("law_firm_id", appointment.law_firm_id)
                  .ilike("phone", `%${last8Digits}`)
                  .order("created_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();
                
                if (clientMatch) {
                  const { data: convByClient } = await supabase
                    .from("conversations")
                    .select("id, client_id, contact_name, remote_jid")
                    .eq("law_firm_id", appointment.law_firm_id)
                    .eq("client_id", clientMatch.id)
                    .eq("whatsapp_instance_id", instance.id)
                    .order("last_message_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  
                  if (convByClient) {
                    existingConv = convByClient;
                    console.log(`[agenda-pro-notification] Found existing conversation by client_id: ${clientMatch.id}`);
                  }
                }
              }

              let conversationId: string;
              let clientId: string | null = null;

              if (existingConv) {
                // Update existing conversation - DO NOT create a new one
                conversationId = existingConv.id;
                clientId = existingConv.client_id;
                
                // Unarchive if archived and update last_message_at
                await supabase
                  .from("conversations")
                  .update({
                    last_message_at: new Date().toISOString(),
                    archived_at: null,
                    archived_reason: null,
                  })
                  .eq("id", conversationId);

                console.log(`[agenda-pro-notification] Updated existing conversation ${conversationId} (contact: ${existingConv.contact_name})`);
              } else {
                // No existing conversation found - create new one
                const { data: newConv, error: convError } = await supabase
                  .from("conversations")
                  .insert({
                    law_firm_id: appointment.law_firm_id,
                    remote_jid: remoteJid,
                    contact_name: fullClientName,
                    contact_phone: phone,
                    status: "novo_contato",
                    current_handler: "human", // Goes to queue
                    current_automation_id: null,
                    assigned_to: null, // Not assigned = appears in Fila
                    department_id: instance.default_department_id || null,
                    whatsapp_instance_id: instance.id,
                    last_message_at: new Date().toISOString(),
                    origin: "agenda_pro",
                    origin_metadata: {
                      appointment_id: appointment.id,
                      service_name: serviceName,
                      professional_name: professionalName,
                      notification_type: type,
                    },
                  })
                  .select("id")
                  .single();

                if (convError) {
                  console.error("[agenda-pro-notification] Error creating conversation:", convError);
                  results.conversationCreated.error = convError.message;
                } else {
                  conversationId = newConv.id;
                  results.conversationCreated.created = true;
                  results.conversationCreated.conversationId = conversationId;
                  console.log(`[agenda-pro-notification] Created NEW conversation ${conversationId}`);

                  // Create or link client in main clients table
                  const { data: existingClient } = await supabase
                    .from("clients")
                    .select("id")
                    .eq("law_firm_id", appointment.law_firm_id)
                    .ilike("phone", `%${last8Digits}`)
                    .maybeSingle();

                  if (existingClient) {
                    clientId = existingClient.id;
                  } else {
                    // Create new client
                    const { data: newClient } = await supabase
                      .from("clients")
                      .insert({
                        law_firm_id: appointment.law_firm_id,
                        name: fullClientName,
                        phone: phone,
                        email: clientEmail || null,
                        whatsapp_instance_id: instance.id,
                        is_agenda_client: true,
                      })
                      .select("id")
                      .single();

                    if (newClient) {
                      clientId = newClient.id;
                      console.log(`[agenda-pro-notification] Created client ${clientId}`);
                    }
                  }

                  // Link client to conversation
                  if (clientId) {
                    await supabase
                      .from("conversations")
                      .update({ client_id: clientId })
                      .eq("id", conversationId);
                  }
                }
              }

              // Insert message record
              if (conversationId!) {
                const whatsappResponse = await response.json().catch(() => ({}));
                const messageId = whatsappResponse?.key?.id || `agenda-pro-${Date.now()}`;

                await supabase
                  .from("messages")
                  .insert({
                    conversation_id: conversationId,
                    whatsapp_message_id: messageId,
                    content: whatsappMessage,
                    message_type: "text",
                    is_from_me: true,
                    sender_type: "system",
                    ai_generated: false,
                  });

                console.log(`[agenda-pro-notification] Inserted message for conversation ${conversationId}`);
              }
            } catch (convErr) {
              console.error("[agenda-pro-notification] Error creating conversation/message:", convErr);
              results.conversationCreated.error = convErr instanceof Error ? convErr.message : "Unknown error";
            }
            // === END CONVERSATION CREATION ===

          } else {
            const errorData = await response.text();
            results.whatsapp.error = errorData;
            console.error("[agenda-pro-notification] WhatsApp failed:", errorData);
          }

          // Send notification to business owner/professional for new appointments
          // Accept both "online" (legacy) and "public_booking" (current) sources
          if (type === "created" && (appointment.source === "online" || appointment.source === "public_booking")) {
            try {
              // Get professional phone for notification
              const { data: professional } = await supabase
                .from("agenda_pro_professionals")
                .select("phone, email, name, notify_new_appointment")
                .eq("id", appointment.professional_id)
                .single();

              if (professional?.phone && professional.notify_new_appointment !== false) {
                const profPhone = professional.phone.replace(/\D/g, "");
                const profJid = profPhone.startsWith("55") ? `${profPhone}@s.whatsapp.net` : `55${profPhone}@s.whatsapp.net`;
                const profLast8Digits = profPhone.slice(-8);
                
                const ownerMessage = `🔔 *Novo Agendamento Online!*\n\n` +
                  `👤 *Cliente:* ${clientName} (${clientPhone})\n` +
                  `📅 *Data:* ${dateStr}\n` +
                  `🕐 *Horário:* ${timeRangeStr}\n` +
                  `📋 *Serviço:* ${serviceName}\n\n` +
                  `Acesse o sistema para mais detalhes.`;

                const ownerEndpoint = isUazapi
                  ? `${apiUrl}/send/text`
                  : `${apiUrl}/message/sendText/${instance.instance_name}`;
                const ownerHeaders: Record<string, string> = isUazapi
                  ? { "Content-Type": "application/json", token: instance.api_key as string }
                  : { "Content-Type": "application/json", apikey: instance.api_key as string };

                const ownerResponse = await fetch(ownerEndpoint, {
                  method: "POST",
                  headers: ownerHeaders,
                  body: JSON.stringify({
                    number: isUazapi ? profJid.replace("@s.whatsapp.net", "") : profJid,
                    text: ownerMessage,
                  }),
                });

                if (ownerResponse.ok) {
                  results.ownerNotification.sent = true;
                  console.log(`[agenda-pro-notification] Owner notification sent for ${appointment_id}`);
                  
                  // === SAVE PROFESSIONAL MESSAGE TO SYSTEM ===
                  try {
                    // Find or create conversation for the professional
                    let profConvId: string | null = null;
                    
                    // Search by last 8 digits in remote_jid (most reliable)
                    const { data: profConvByJid } = await supabase
                      .from("conversations")
                      .select("id, contact_name, remote_jid")
                      .eq("law_firm_id", appointment.law_firm_id)
                      .eq("whatsapp_instance_id", instance.id)
                      .ilike("remote_jid", `%${profLast8Digits}@s.whatsapp.net`)
                      .order("last_message_at", { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    
                    if (profConvByJid) {
                      profConvId = profConvByJid.id;
                      console.log(`[agenda-pro-notification] Found professional conversation: ${profConvByJid.contact_name}`);
                      
                      // Update last_message_at and unarchive
                      await supabase
                        .from("conversations")
                        .update({
                          last_message_at: new Date().toISOString(),
                          archived_at: null,
                          archived_reason: null,
                        })
                        .eq("id", profConvId);
                    } else {
                      // Search by contact_phone suffix
                      const { data: profConvByPhone } = await supabase
                        .from("conversations")
                        .select("id, contact_name")
                        .eq("law_firm_id", appointment.law_firm_id)
                        .eq("whatsapp_instance_id", instance.id)
                        .ilike("contact_phone", `%${profLast8Digits}`)
                        .order("last_message_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      
                      if (profConvByPhone) {
                        profConvId = profConvByPhone.id;
                        console.log(`[agenda-pro-notification] Found professional conversation by phone: ${profConvByPhone.contact_name}`);
                        
                        await supabase
                          .from("conversations")
                          .update({
                            last_message_at: new Date().toISOString(),
                            archived_at: null,
                            archived_reason: null,
                          })
                          .eq("id", profConvId);
                      }
                    }
                    
                    // If no conversation found, create one for the professional
                    if (!profConvId) {
                      const { data: newProfConv } = await supabase
                        .from("conversations")
                        .insert({
                          law_firm_id: appointment.law_firm_id,
                          remote_jid: profJid,
                          contact_name: professional.name || "Profissional",
                          contact_phone: profPhone,
                          status: "em_atendimento",
                          current_handler: "human",
                          whatsapp_instance_id: instance.id,
                          last_message_at: new Date().toISOString(),
                          origin: "system_notification",
                          origin_metadata: {
                            type: "professional_notification",
                            professional_id: appointment.professional_id,
                          },
                        })
                        .select("id")
                        .single();
                      
                      if (newProfConv) {
                        profConvId = newProfConv.id;
                        console.log(`[agenda-pro-notification] Created new professional conversation: ${profConvId}`);
                      }
                    }
                    
                    // Save the message to the conversation
                    if (profConvId) {
                      const ownerMsgResponse = await ownerResponse.clone().json().catch(() => ({}));
                      const ownerMsgId = ownerMsgResponse?.key?.id || `agenda-notify-prof-${Date.now()}`;
                      
                      await supabase
                        .from("messages")
                        .insert({
                          conversation_id: profConvId,
                          whatsapp_message_id: ownerMsgId,
                          content: ownerMessage,
                          message_type: "text",
                          is_from_me: true,
                          sender_type: "system",
                          ai_generated: false,
                        });
                      
                      console.log(`[agenda-pro-notification] Professional message saved to conversation ${profConvId}`);
                    }
                  } catch (profMsgErr) {
                    console.error("[agenda-pro-notification] Error saving professional message:", profMsgErr);
                  }
                  // === END PROFESSIONAL MESSAGE SAVE ===
                }
              }

              // Also try to notify company admin email
              const { data: company } = await supabase
                .from("companies")
                .select("email")
                .eq("law_firm_id", appointment.law_firm_id)
                .single();

              if (company?.email) {
                const resendApiKey = Deno.env.get("RESEND_API_KEY");
                if (resendApiKey) {
                  const resend = new Resend(resendApiKey);
                  await resend.emails.send({
                    from: "Suporte <suporte@miauchat.com.br>",
                    to: [company.email],
                    subject: `🔔 Novo Agendamento Online - ${clientName}`,
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #3b82f6;">🔔 Novo Agendamento Online</h1>
                        <p>Você recebeu um novo agendamento pelo sistema online!</p>
                        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                          <p style="margin: 8px 0;"><strong>👤 Cliente:</strong> ${appointment.agenda_pro_clients?.name || appointment.client_name}</p>
                          <p style="margin: 8px 0;"><strong>📱 Telefone:</strong> ${clientPhone}</p>
                          ${clientEmail ? `<p style="margin: 8px 0;"><strong>📧 Email:</strong> ${clientEmail}</p>` : ""}
                          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${dateStr}</p>
                          <p style="margin: 8px 0;"><strong>🕐 Horário:</strong> ${timeRangeStr}</p>
                          <p style="margin: 8px 0;"><strong>📋 Serviço:</strong> ${serviceName}</p>
                          ${professionalName ? `<p style="margin: 8px 0;"><strong>👤 Profissional:</strong> ${professionalName}</p>` : ""}
                        </div>
                        <p>Acesse o sistema para gerenciar este agendamento.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                        <p style="color: #6b7280; font-size: 14px;">${companyName}</p>
                      </div>
                    `,
                  });
                  console.log(`[agenda-pro-notification] Owner email sent to ${company.email}`);
                }
              }
            } catch (ownerErr) {
              console.error("[agenda-pro-notification] Owner notification error:", ownerErr);
              results.ownerNotification.error = ownerErr instanceof Error ? ownerErr.message : "Unknown error";
            }
          }
        } else {
          results.whatsapp.error = "No connected WhatsApp instance";
          console.log("[agenda-pro-notification] No connected WhatsApp instance");
        }
      } catch (err) {
        results.whatsapp.error = err instanceof Error ? err.message : "Unknown error";
        console.error("[agenda-pro-notification] WhatsApp error:", err);
      }
    }

    // Send Email notification to client
    if (clientEmail && settings?.send_email_confirmation === true) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const { error: emailError } = await resend.emails.send({
            from: "Suporte <suporte@miauchat.com.br>",
            to: [clientEmail],
            subject: emailSubject,
            html: emailHtml,
          });

          if (emailError) {
            results.email.error = emailError.message;
            console.error("[agenda-pro-notification] Email failed:", emailError);
          } else {
            results.email.sent = true;
            console.log(`[agenda-pro-notification] Email sent to ${clientEmail}`);
          }
        } else {
          results.email.error = "RESEND_API_KEY not configured";
        }
      } catch (err) {
        results.email.error = err instanceof Error ? err.message : "Unknown error";
        console.error("[agenda-pro-notification] Email error:", err);
      }
    }

    console.log(`[agenda-pro-notification] Completed ${type} notification for ${appointment_id}:`, results);

    return new Response(
      JSON.stringify({ success: true, type, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[agenda-pro-notification] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
