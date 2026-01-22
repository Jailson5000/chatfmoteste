import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[agenda-pro-confirmation] Missing SUPABASE env vars");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
          agenda_pro_services(id, name, duration_minutes),
          agenda_pro_professionals(id, name, phone, email)
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

      // Notify professional about confirmation
      await notifyProfessional(supabase, appointment, "confirmed");
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

      // Notify professional about cancellation
      await notifyProfessional(supabase, appointment, "cancelled");
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

      const { error: updateError } = await supabase
        .from("agenda_pro_appointments")
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          status: "pending", // Reset to pending for new confirmation
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

      // Notify professional about reschedule
      await notifyProfessional(supabase, { ...appointment, start_time: newStart.toISOString() }, "rescheduled");

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
  appointment: any,
  statusType: "confirmed" | "cancelled" | "rescheduled"
) {
  try {
    const professional = Array.isArray(appointment.agenda_pro_professionals)
      ? appointment.agenda_pro_professionals[0]
      : appointment.agenda_pro_professionals;

    if (!professional?.phone) {
      console.log("[agenda-pro-confirmation] Professional has no phone, skipping notification");
      return;
    }

    // Get client info
    const { data: apt } = await supabase
      .from("agenda_pro_appointments")
      .select(`
        client_name,
        client_phone,
        start_time,
        agenda_pro_clients(name, phone),
        agenda_pro_services(name)
      `)
      .eq("id", appointment.id)
      .single();

    if (!apt) return;

    const clientName = apt.agenda_pro_clients?.name || apt.client_name || "Cliente";
    const serviceName = apt.agenda_pro_services?.name || "Serviço";
    const startTime = new Date(apt.start_time);
    
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
    if (statusType === "confirmed") {
      message = `✅ *Presença Confirmada*\n\n` +
        `O cliente *${clientName}* confirmou presença:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}`;
    } else if (statusType === "cancelled") {
      message = `❌ *Agendamento Cancelado*\n\n` +
        `O cliente *${clientName}* cancelou o agendamento:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}`;
    } else if (statusType === "rescheduled") {
      message = `📅 *Agendamento Reagendado*\n\n` +
        `O cliente *${clientName}* reagendou para:\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}\n` +
        `📋 ${serviceName}`;
    }

    // Get WhatsApp instance
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

      console.log(`[agenda-pro-confirmation] Professional notified: ${statusType}`);
    }
  } catch (e) {
    console.error("[agenda-pro-confirmation] Error notifying professional:", e);
  }
}
