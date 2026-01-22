import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Action = "get" | "confirm" | "cancel" | "reschedule" | "get_slots";

interface RequestBody {
  token?: string;
  action?: Action;
  new_date?: string;
  new_time?: string;
  date?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[agenda-pro-confirmation] Missing SUPABASE env vars");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    const url = new URL(req.url);
    let token = url.searchParams.get("token") ?? undefined;
    let action = (url.searchParams.get("action") as Action | null) ?? undefined;
    let new_date: string | undefined;
    let new_time: string | undefined;
    let date: string | undefined;

    if (req.method !== "GET") {
      const body = (await req.json().catch(() => ({}))) as RequestBody;
      token = body.token ?? token;
      action = body.action ?? action;
      new_date = body.new_date;
      new_time = body.new_time;
      date = body.date;
    }

    if (!token) {
      return new Response(JSON.stringify({ error: "token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeAction: Action = action ?? "get";
    console.log(`[agenda-pro-confirmation] action=${safeAction} token=${token.slice(0, 8)}...`);

    const selectAppointment = async () => {
      return await supabase
        .from("agenda_pro_appointments")
        .select(`
          id,
          start_time,
          end_time,
          status,
          confirmed_at,
          cancelled_at,
          law_firm_id,
          professional_id,
          service_id,
          client_name,
          client_phone,
          agenda_pro_services(id, name, duration_minutes),
          agenda_pro_professionals(id, name, phone, email),
          agenda_pro_clients(name, phone)
        `)
        .eq("confirmation_token", token)
        .maybeSingle();
    };

    const { data: appointment, error: fetchError } = await selectAppointment();
    if (fetchError) {
      console.error("[agenda-pro-confirmation] Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch appointment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found or token invalid" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get available slots for a date
    if (safeAction === "get_slots" && date) {
      const service = Array.isArray(appointment.agenda_pro_services) 
        ? appointment.agenda_pro_services[0] 
        : appointment.agenda_pro_services;
      const durationMinutes = service?.duration_minutes || 30;

      // Get business settings for working hours
      const { data: settings } = await supabase
        .from("agenda_pro_settings")
        .select("working_hours, slot_interval_minutes, min_booking_notice_hours")
        .eq("law_firm_id", appointment.law_firm_id)
        .single();

      const workingHours = settings?.working_hours as Record<string, { start: string; end: string; enabled: boolean }> || {
        "0": { start: "08:00", end: "18:00", enabled: false },
        "1": { start: "08:00", end: "18:00", enabled: true },
        "2": { start: "08:00", end: "18:00", enabled: true },
        "3": { start: "08:00", end: "18:00", enabled: true },
        "4": { start: "08:00", end: "18:00", enabled: true },
        "5": { start: "08:00", end: "18:00", enabled: true },
        "6": { start: "08:00", end: "12:00", enabled: false },
      };
      const slotInterval = settings?.slot_interval_minutes || 30;
      const minNoticeHours = settings?.min_booking_notice_hours || 2;

      const selectedDate = new Date(date + "T00:00:00");
      const dayOfWeek = selectedDate.getDay().toString();
      const daySettings = workingHours[dayOfWeek];

      if (!daySettings?.enabled) {
        return new Response(JSON.stringify({ slots: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get existing appointments for this date and professional
      const startOfDay = date + "T00:00:00";
      const endOfDay = date + "T23:59:59";
      
      const { data: existingApts } = await supabase
        .from("agenda_pro_appointments")
        .select("start_time, end_time")
        .eq("law_firm_id", appointment.law_firm_id)
        .eq("professional_id", appointment.professional_id)
        .gte("start_time", startOfDay)
        .lte("start_time", endOfDay)
        .in("status", ["pending", "confirmed"])
        .neq("id", appointment.id); // Exclude current appointment

      const bookedSlots = (existingApts || []).map((apt: any) => ({
        start: new Date(apt.start_time).getTime(),
        end: new Date(apt.end_time).getTime(),
      }));

      // Generate time slots
      const [startHour, startMin] = daySettings.start.split(":").map(Number);
      const [endHour, endMin] = daySettings.end.split(":").map(Number);
      
      const slots: { time: string; available: boolean }[] = [];
      const now = new Date();
      const minBookingTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);

      let currentTime = new Date(selectedDate);
      currentTime.setHours(startHour, startMin, 0, 0);
      
      const endTime = new Date(selectedDate);
      endTime.setHours(endHour, endMin, 0, 0);

      while (currentTime < endTime) {
        const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60 * 1000);
        
        // Check if slot end exceeds working hours
        if (slotEnd > endTime) break;

        const timeStr = currentTime.toTimeString().slice(0, 5);
        
        // Check availability
        let available = currentTime >= minBookingTime;
        
        if (available) {
          const slotStart = currentTime.getTime();
          const slotEndMs = slotEnd.getTime();
          
          // Check for conflicts with existing appointments
          for (const booked of bookedSlots) {
            if (slotStart < booked.end && slotEndMs > booked.start) {
              available = false;
              break;
            }
          }
        }

        slots.push({ time: timeStr, available });
        
        currentTime = new Date(currentTime.getTime() + slotInterval * 60 * 1000);
      }

      return new Response(JSON.stringify({ slots }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper to log activity
    const logActivity = async (action: string, details?: Record<string, any>) => {
      await supabase.from("agenda_pro_activity_log").insert({
        law_firm_id: appointment.law_firm_id,
        appointment_id: appointment.id,
        user_id: null, // No user context in public link
        action,
        details: details || null,
      });
    };

    // Confirm appointment
    if (safeAction === "confirm") {
      const { error: updateError } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmed_via: "link",
        })
        .eq("confirmation_token", token);

      if (updateError) {
        console.error("[agenda-pro-confirmation] Confirm update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to confirm" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log activity
      await logActivity("confirmed", { source: "link" });

      // Notify professional about confirmation
      await notifyProfessional(supabase, resend, appointment, "confirmed");
    }

    // Cancel appointment
    if (safeAction === "cancel") {
      const { error: updateError } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "Cancelled via confirmation link",
        })
        .eq("confirmation_token", token);

      if (updateError) {
        console.error("[agenda-pro-confirmation] Cancel update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to cancel" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log activity
      await logActivity("cancelled", { source: "link", reason: "Cancelled via confirmation link" });

      // Notify professional about cancellation
      await notifyProfessional(supabase, resend, appointment, "cancelled");
    }

    // Reschedule appointment
    if (safeAction === "reschedule" && new_date && new_time) {
      const service = Array.isArray(appointment.agenda_pro_services) 
        ? appointment.agenda_pro_services[0] 
        : appointment.agenda_pro_services;
      const durationMinutes = service?.duration_minutes || 30;

      const [hours, minutes] = new_time.split(":").map(Number);
      const newStart = new Date(new_date + "T00:00:00");
      newStart.setHours(hours, minutes, 0, 0);
      
      const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);

      const oldStartTime = appointment.start_time;

      const { error: updateError } = await supabase
        .from("agenda_pro_appointments")
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          status: "scheduled", // Reset to scheduled for new confirmation
          confirmed_at: null,
          reminder_sent_at: null, // Reset reminders
          pre_message_sent_at: null,
        })
        .eq("confirmation_token", token);

      if (updateError) {
        console.error("[agenda-pro-confirmation] Reschedule update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to reschedule" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log activity
      await logActivity("rescheduled", { 
        source: "link", 
        from: oldStartTime, 
        to: newStart.toISOString() 
      });

      // Notify professional about reschedule
      await notifyProfessional(supabase, resend, { ...appointment, start_time: newStart.toISOString() }, "rescheduled");

      // Send notification to client about new date
      try {
        await supabase.functions.invoke("agenda-pro-notification", {
          body: { appointment_id: appointment.id, type: "updated" },
        });
      } catch (e) {
        console.error("[agenda-pro-confirmation] Failed to send update notification:", e);
      }
    }

    // Re-fetch after mutation to return updated status
    const { data: finalAppointment } = safeAction === "get" ? { data: appointment } : await selectAppointment();

    const { data: settings } = await supabase
      .from("agenda_pro_settings")
      .select("business_name, logo_url")
      .eq("law_firm_id", finalAppointment?.law_firm_id ?? appointment.law_firm_id)
      .maybeSingle();

    const apt = finalAppointment ?? appointment;
    const serviceData = Array.isArray(apt.agenda_pro_services)
      ? apt.agenda_pro_services[0]
      : apt.agenda_pro_services;
    const professionalData = Array.isArray(apt.agenda_pro_professionals)
      ? apt.agenda_pro_professionals[0]
      : apt.agenda_pro_professionals;

    const response = {
      appointment: {
        id: apt.id,
        start_time: apt.start_time,
        end_time: apt.end_time,
        status: apt.status,
        confirmed_at: apt.confirmed_at,
        law_firm_id: apt.law_firm_id,
        professional_id: apt.professional_id,
        service_id: apt.service_id,
        service: serviceData ? { name: serviceData.name, duration_minutes: serviceData.duration_minutes } : null,
        professional: professionalData ? { name: professionalData.name } : null,
        settings: settings
          ? { business_name: settings.business_name ?? "", logo_url: settings.logo_url ?? null }
          : null,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[agenda-pro-confirmation] Unhandled error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper function to notify professional about status changes
async function notifyProfessional(
  supabase: any,
  resend: any,
  appointment: any,
  statusType: "confirmed" | "cancelled" | "rescheduled"
) {
  try {
    const professional = Array.isArray(appointment.agenda_pro_professionals)
      ? appointment.agenda_pro_professionals[0]
      : appointment.agenda_pro_professionals;

    if (!professional) {
      console.log("[agenda-pro-confirmation] No professional data, skipping notification");
      return;
    }

    // Get client info
    const clientData = Array.isArray(appointment.agenda_pro_clients)
      ? appointment.agenda_pro_clients[0]
      : appointment.agenda_pro_clients;
    
    const clientName = clientData?.name || appointment.client_name || "Cliente";
    const serviceData = Array.isArray(appointment.agenda_pro_services)
      ? appointment.agenda_pro_services[0]
      : appointment.agenda_pro_services;
    const serviceName = serviceData?.name || "Serviço";
    
    const startTime = new Date(appointment.start_time);
    
    const dateStr = startTime.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    const timeStr = startTime.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let message = "";
    let emailSubject = "";
    let emailContent = "";
    
    if (statusType === "confirmed") {
      message = `✅ *Presença Confirmada*\n\n` +
        `O cliente *${clientName}* confirmou presença:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}`;
      emailSubject = `✅ Presença Confirmada - ${clientName}`;
      emailContent = `
        <h2 style="color: #22c55e;">Presença Confirmada</h2>
        <p>O cliente <strong>${clientName}</strong> confirmou presença para o agendamento:</p>
        <ul>
          <li><strong>Data:</strong> ${dateStr}</li>
          <li><strong>Horário:</strong> ${timeStr}</li>
          <li><strong>Serviço:</strong> ${serviceName}</li>
        </ul>
      `;
    } else if (statusType === "cancelled") {
      message = `❌ *Agendamento Cancelado*\n\n` +
        `O cliente *${clientName}* cancelou o agendamento:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}`;
      emailSubject = `❌ Agendamento Cancelado - ${clientName}`;
      emailContent = `
        <h2 style="color: #ef4444;">Agendamento Cancelado</h2>
        <p>O cliente <strong>${clientName}</strong> cancelou o agendamento:</p>
        <ul>
          <li><strong>Data:</strong> ${dateStr}</li>
          <li><strong>Horário:</strong> ${timeStr}</li>
          <li><strong>Serviço:</strong> ${serviceName}</li>
        </ul>
      `;
    } else if (statusType === "rescheduled") {
      message = `📅 *Agendamento Reagendado*\n\n` +
        `O cliente *${clientName}* reagendou para:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}`;
      emailSubject = `📅 Agendamento Reagendado - ${clientName}`;
      emailContent = `
        <h2 style="color: #8b5cf6;">Agendamento Reagendado</h2>
        <p>O cliente <strong>${clientName}</strong> reagendou para:</p>
        <ul>
          <li><strong>Nova Data:</strong> ${dateStr}</li>
          <li><strong>Novo Horário:</strong> ${timeStr}</li>
          <li><strong>Serviço:</strong> ${serviceName}</li>
        </ul>
      `;
    }

    // Send WhatsApp notification if professional has phone
    if (professional.phone) {
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, api_url, api_key")
        .eq("law_firm_id", appointment.law_firm_id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();

      if (instance) {
        const profPhone = professional.phone.replace(/\D/g, "");
        const profJid = profPhone.startsWith("55") ? `${profPhone}@s.whatsapp.net` : `55${profPhone}@s.whatsapp.net`;
        const apiUrl = (instance.api_url as string).replace(/\/$/, "");

        try {
          await fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: instance.api_key as string,
            },
            body: JSON.stringify({
              number: profJid,
              text: message,
            }),
          });
          console.log(`[agenda-pro-confirmation] WhatsApp sent to professional: ${statusType}`);
        } catch (whatsappError) {
          console.error("[agenda-pro-confirmation] WhatsApp error:", whatsappError);
        }
      }
    }

    // Send Email notification if professional has email and Resend is configured
    if (professional.email && resend) {
      try {
        // Get business settings for branding
        const { data: bizSettings } = await supabase
          .from("agenda_pro_settings")
          .select("business_name")
          .eq("law_firm_id", appointment.law_firm_id)
          .maybeSingle();
        
        const businessName = bizSettings?.business_name || "Agenda Pro";

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
              ul { list-style: none; padding: 0; }
              li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
              li:last-child { border-bottom: none; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 20px;">${businessName}</h1>
              </div>
              <div class="content">
                ${emailContent}
              </div>
              <div class="footer">
                <p>Esta é uma notificação automática do sistema de agendamentos.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await resend.emails.send({
          from: `${businessName} <onboarding@resend.dev>`,
          to: [professional.email],
          subject: emailSubject,
          html: emailHtml,
        });

        console.log(`[agenda-pro-confirmation] Email sent to professional: ${professional.email}`);
      } catch (emailError) {
        console.error("[agenda-pro-confirmation] Email error:", emailError);
      }
    }
  } catch (e) {
    console.error("[agenda-pro-confirmation] Error notifying professional:", e);
  }
}
