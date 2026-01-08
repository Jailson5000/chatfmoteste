import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { law_firm_id } = await req.json();

    console.log(`[google-calendar-sync] Starting sync for law_firm: ${law_firm_id}`);

    // Get the integration
    const { data: integration, error: intError } = await supabase
      .from("google_calendar_integrations")
      .select("*")
      .eq("law_firm_id", law_firm_id)
      .eq("is_active", true)
      .single();

    if (intError || !integration) {
      console.error("[google-calendar-sync] Integration not found:", intError);
      return new Response(
        JSON.stringify({ error: "Integração não encontrada ou inativa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    const tokenExpiresAt = new Date(integration.token_expires_at);
    
    if (tokenExpiresAt <= new Date()) {
      console.log("[google-calendar-sync] Token expired, refreshing...");
      
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          refresh_token: integration.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("[google-calendar-sync] Token refresh failed:", tokenData);
        return new Response(
          JSON.stringify({ error: "Falha ao renovar token. Reconecte o Google Calendar." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = tokenData.access_token;
      const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

      // Update token in database
      await supabase
        .from("google_calendar_integrations")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
    }

    // Fetch events from Google Calendar
    const calendarId = integration.default_calendar_id || "primary";
    const now = new Date();
    // Go back 30 days to catch edits on past events and forward 90 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const calendarUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    calendarUrl.searchParams.set("timeMin", thirtyDaysAgo.toISOString());
    calendarUrl.searchParams.set("timeMax", threeMonthsLater.toISOString());
    calendarUrl.searchParams.set("singleEvents", "true");
    calendarUrl.searchParams.set("orderBy", "startTime");
    calendarUrl.searchParams.set("maxResults", "500");
    // showDeleted=true allows us to see cancelled events and remove them locally
    calendarUrl.searchParams.set("showDeleted", "true");

    const eventsResponse = await fetch(calendarUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const eventsData = await eventsResponse.json();

    if (eventsData.error) {
      console.error("[google-calendar-sync] Failed to fetch events:", eventsData);
      return new Response(
        JSON.stringify({ error: "Falha ao buscar eventos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[google-calendar-sync] Found ${eventsData.items?.length || 0} events from Google`);

    // Upsert events to database
    const events = eventsData.items || [];
    let syncedCount = 0;
    let deletedCount = 0;

    for (const event of events) {
      // Handle cancelled/deleted events by removing them locally
      if (event.status === "cancelled") {
        const { error: deleteError, count } = await supabase
          .from("google_calendar_events")
          .delete()
          .eq("law_firm_id", law_firm_id)
          .eq("google_event_id", event.id);
        
        if (!deleteError && count && count > 0) {
          deletedCount++;
          console.log(`[google-calendar-sync] Deleted cancelled event: ${event.id}`);
        }
        continue;
      }

      const startTime = event.start?.dateTime || event.start?.date;
      const endTime = event.end?.dateTime || event.end?.date;
      const isAllDay = !event.start?.dateTime;

      const eventData = {
        law_firm_id,
        integration_id: integration.id,
        google_event_id: event.id,
        calendar_id: calendarId,
        title: event.summary || "Sem título",
        description: event.description || null,
        location: event.location || null,
        start_time: startTime,
        end_time: endTime,
        is_all_day: isAllDay,
        timezone: event.start?.timeZone || "America/Sao_Paulo",
        html_link: event.htmlLink || null,
        meet_link: event.hangoutLink || null,
        status: event.status || "confirmed",
        etag: event.etag || null,
        attendees: event.attendees || [],
        recurrence_rule: event.recurrence?.[0] || null,
        recurring_event_id: event.recurringEventId || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("google_calendar_events")
        .upsert(eventData, {
          onConflict: "law_firm_id,google_event_id",
        });

      if (!upsertError) {
        syncedCount++;
      } else {
        console.error(`[google-calendar-sync] Failed to upsert event ${event.id}:`, upsertError);
      }
    }

    // Sync appointments to Google Calendar (create events for appointments without google_event_id)
    let appointmentsSynced = 0;
    const { data: unlinkedAppointments } = await supabase
      .from("appointments")
      .select("*, service:services(name, duration_minutes)")
      .eq("law_firm_id", law_firm_id)
      .is("google_event_id", null)
      .in("status", ["scheduled", "confirmed"])
      .gte("start_time", new Date().toISOString());

    for (const apt of (unlinkedAppointments || [])) {
      try {
        const serviceName = apt.service?.name || "Agendamento";
        const clientInfo = apt.client_name ? ` - ${apt.client_name}` : "";

        const eventBody = {
          summary: `${serviceName}${clientInfo}`,
          description: [
            apt.client_name && `Cliente: ${apt.client_name}`,
            apt.client_phone && `Telefone: ${apt.client_phone}`,
            apt.notes && `Observações: ${apt.notes}`,
          ].filter(Boolean).join("\n"),
          start: { dateTime: apt.start_time, timeZone: "America/Sao_Paulo" },
          end: { dateTime: apt.end_time, timeZone: "America/Sao_Paulo" },
        };

        const createResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventBody),
          }
        );

        if (createResponse.ok) {
          const createdEvent = await createResponse.json();
          await supabase
            .from("appointments")
            .update({ google_event_id: createdEvent.id })
            .eq("id", apt.id);
          appointmentsSynced++;
        }
      } catch (err) {
        console.error(`[google-calendar-sync] Failed to sync appointment ${apt.id}:`, err);
      }
    }

    // Update last sync time
    await supabase
      .from("google_calendar_integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    // Log the sync
    await supabase.from("google_calendar_ai_logs").insert({
      law_firm_id,
      integration_id: integration.id,
      action_type: "sync",
      performed_by: "system",
      response_summary: `Sincronizados ${syncedCount} eventos, removidos ${deletedCount} cancelados, ${appointmentsSynced} agendamentos vinculados`,
    });

    console.log(`[google-calendar-sync] Sync complete. Events: ${syncedCount}, Deleted: ${deletedCount}, Appointments: ${appointmentsSynced}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced_events: syncedCount,
        deleted_events: deletedCount,
        appointments_synced: appointmentsSynced,
        total_events: events.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[google-calendar-sync] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
