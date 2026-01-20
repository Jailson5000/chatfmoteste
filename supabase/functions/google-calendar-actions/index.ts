import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken, encryptToken, isEncrypted } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

interface CalendarActionRequest {
  action: "create_event" | "update_event" | "delete_event" | "list_events" | "check_availability";
  law_firm_id: string;
  conversation_id?: string;
  client_id?: string;
  agent_id?: string;
  event_data?: {
    title?: string;
    description?: string;
    start_time?: string; // ISO 8601
    end_time?: string;   // ISO 8601
    duration_minutes?: number;
    location?: string;
    attendees?: string[];
    event_id?: string; // For update/delete
  };
  query?: {
    time_min?: string;
    time_max?: string;
    date?: string; // For checking availability on specific date
  };
}

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

function hasTimeZoneOffset(value: string): boolean {
  return /[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value) || /[+-]\d{4}$/.test(value);
}

function ensureTimeParts(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  return v;
}

function getOffsetString(date: Date, timeZone: string): string {
  // Works without relying on host timezone
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMinutes = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function toTimeZoneRFC3339(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const m: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value;
  }

  const offset = getOffsetString(date, timeZone);
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}${offset}`;
}

function normalizeSaoPauloDateTime(value: string): { date: Date; rfc3339: string } | null {
  const normalized = ensureTimeParts(value);
  const candidate = hasTimeZoneOffset(normalized)
    ? normalized
    : `${normalized}${getOffsetString(new Date(), DEFAULT_TIME_ZONE)}`;

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return null;

  return {
    date,
    rfc3339: toTimeZoneRFC3339(date, DEFAULT_TIME_ZONE),
  };
}

// Refresh access token if expired (handles encrypted tokens)
async function refreshTokenIfNeeded(
  supabase: any,
  integration: any
): Promise<string | null> {
  // Decrypt tokens (handle both encrypted and legacy plaintext tokens)
  let accessToken = integration.access_token;
  let refreshToken = integration.refresh_token;
  
  if (isEncrypted(accessToken)) {
    accessToken = await decryptToken(accessToken);
  }
  if (isEncrypted(refreshToken)) {
    refreshToken = await decryptToken(refreshToken);
  }

  const tokenExpiresAt = new Date(integration.token_expires_at);
  
  if (tokenExpiresAt <= new Date()) {
    console.log("[google-calendar-actions] Token expired, refreshing...");
    
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("[google-calendar-actions] Token refresh failed:", tokenData);
      return null;
    }

    accessToken = tokenData.access_token;
    const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Encrypt and update token in database
    const encryptedAccessToken = await encryptToken(accessToken);
    await supabase
      .from("google_calendar_integrations")
      .update({
        access_token: encryptedAccessToken,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);
  }
  
  return accessToken;
}

// Log AI action for audit
async function logAIAction(
  supabase: any,
  lawFirmId: string,
  integrationId: string,
  actionType: string,
  data: {
    conversationId?: string;
    clientId?: string;
    agentId?: string;
    eventId?: string;
    eventTitle?: string;
    eventStart?: string;
    eventEnd?: string;
    requestDescription?: string;
    responseSummary?: string;
    success: boolean;
    errorMessage?: string;
  }
) {
  await supabase.from("google_calendar_ai_logs").insert({
    law_firm_id: lawFirmId,
    integration_id: integrationId,
    action_type: actionType,
    performed_by: "ai_agent",
    conversation_id: data.conversationId,
    client_id: data.clientId,
    ai_agent_id: data.agentId,
    event_id: data.eventId,
    event_title: data.eventTitle,
    event_start: data.eventStart,
    event_end: data.eventEnd,
    request_description: data.requestDescription,
    response_summary: data.responseSummary,
    success: data.success,
    error_message: data.errorMessage,
  });
}

// CREATE EVENT
async function createEvent(
  accessToken: string,
  calendarId: string,
  eventData: CalendarActionRequest["event_data"]
): Promise<{ success: boolean; event?: any; error?: string }> {
  if (!eventData?.title || !eventData?.start_time) {
    return { success: false, error: "Título e horário de início são obrigatórios" };
  }

  const start = normalizeSaoPauloDateTime(eventData.start_time);
  if (!start) {
    return { success: false, error: "start_time inválido. Use ISO 8601 (ex: 2026-01-09T10:00:00)" };
  }

  const durationMinutes = eventData.duration_minutes ?? 60;

  let end = eventData.end_time ? normalizeSaoPauloDateTime(eventData.end_time) : null;
  if (!end) {
    const endDate = new Date(start.date.getTime() + durationMinutes * 60000);
    end = { date: endDate, rfc3339: toTimeZoneRFC3339(endDate, DEFAULT_TIME_ZONE) };
  }

  if (end.date <= start.date) {
    return { success: false, error: "Horário final deve ser após o horário inicial" };
  }

  const event = {
    summary: eventData.title,
    description: eventData.description || "",
    location: eventData.location || "",
    start: {
      dateTime: start.rfc3339,
      timeZone: DEFAULT_TIME_ZONE,
    },
    end: {
      dateTime: end.rfc3339,
      timeZone: DEFAULT_TIME_ZONE,
    },
    attendees: eventData.attendees?.map((email) => ({ email })) || [],
    reminders: {
      useDefault: true,
    },
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("[google-calendar-actions] Create event failed:", data);
    return { success: false, error: data.error?.message || "Falha ao criar evento" };
  }

  return { success: true, event: data };
}

// UPDATE EVENT
async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventData: CalendarActionRequest["event_data"]
): Promise<{ success: boolean; event?: any; error?: string }> {
  if (!eventData?.event_id) {
    return { success: false, error: "ID do evento é obrigatório para atualização" };
  }

  // First get the existing event
  const getResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventData.event_id}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!getResponse.ok) {
    return { success: false, error: "Evento não encontrado" };
  }

  const existingEvent = await getResponse.json();

  // Merge updates
  const updatedEvent = {
    ...existingEvent,
    summary: eventData.title || existingEvent.summary,
    description: eventData.description || existingEvent.description,
    location: eventData.location || existingEvent.location,
  };

  const start = eventData.start_time ? normalizeSaoPauloDateTime(eventData.start_time) : null;
  if (eventData.start_time && !start) {
    return { success: false, error: "start_time inválido" };
  }

  const end = eventData.end_time ? normalizeSaoPauloDateTime(eventData.end_time) : null;
  if (eventData.end_time && !end) {
    return { success: false, error: "end_time inválido" };
  }

  if (start) {
    updatedEvent.start = {
      dateTime: start.rfc3339,
      timeZone: DEFAULT_TIME_ZONE,
    };
  }

  if (end) {
    updatedEvent.end = {
      dateTime: end.rfc3339,
      timeZone: DEFAULT_TIME_ZONE,
    };
  } else if (start && eventData.duration_minutes) {
    const endDate = new Date(start.date.getTime() + eventData.duration_minutes * 60000);
    updatedEvent.end = {
      dateTime: toTimeZoneRFC3339(endDate, DEFAULT_TIME_ZONE),
      timeZone: DEFAULT_TIME_ZONE,
    };
  }

  if (updatedEvent.start?.dateTime && updatedEvent.end?.dateTime) {
    const s = new Date(updatedEvent.start.dateTime);
    const e = new Date(updatedEvent.end.dateTime);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e <= s) {
      return { success: false, error: "Horário final deve ser após o horário inicial" };
    }
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventData.event_id}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedEvent),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return { success: false, error: data.error?.message || "Falha ao atualizar evento" };
  }

  return { success: true, event: data };
}

// DELETE EVENT
async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok && response.status !== 204) {
    const data = await response.json();
    return { success: false, error: data.error?.message || "Falha ao cancelar evento" };
  }

  return { success: true };
}

// LIST EVENTS
async function listEvents(
  accessToken: string,
  calendarId: string,
  query?: CalendarActionRequest["query"]
): Promise<{ success: boolean; events?: any[]; error?: string }> {
  const now = new Date();

  let timeMin = query?.time_min || now.toISOString();
  let timeMax = query?.time_max || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Normalize when caller passes date-times without timezone
  const nm = query?.time_min ? normalizeSaoPauloDateTime(query.time_min) : null;
  const nx = query?.time_max ? normalizeSaoPauloDateTime(query.time_max) : null;
  if (nm) timeMin = nm.rfc3339;
  if (nx) timeMax = nx.rfc3339;

  // Guard: Google rejects empty/invalid ranges
  const minD = new Date(timeMin);
  const maxD = new Date(timeMax);
  if (!Number.isNaN(minD.getTime()) && !Number.isNaN(maxD.getTime()) && maxD <= minD) {
    timeMax = new Date(minD.getTime() + 60 * 60 * 1000).toISOString();
  }

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "20");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();

  if (!response.ok) {
    return { success: false, error: data.error?.message || "Falha ao listar eventos" };
  }

  return { 
    success: true, 
    events: data.items?.map((e: any) => ({
      id: e.id,
      title: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location,
      description: e.description,
      status: e.status,
    })) || []
  };
}

// CHECK AVAILABILITY
async function checkAvailability(
  accessToken: string,
  calendarId: string,
  query?: CalendarActionRequest["query"]
): Promise<{ success: boolean; available_slots?: string[]; busy_times?: any[]; error?: string }> {
  // Get events for the day
  let timeMin: string;
  let timeMax: string;

  if (query?.date) {
    const date = new Date(query.date);
    date.setHours(0, 0, 0, 0);
    timeMin = date.toISOString();
    date.setHours(23, 59, 59, 999);
    timeMax = date.toISOString();
  } else {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    timeMin = now.toISOString();
    now.setHours(23, 59, 59, 999);
    timeMax = now.toISOString();
  }

  const result = await listEvents(accessToken, calendarId, { time_min: timeMin, time_max: timeMax });
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Define working hours (8:00 - 18:00)
  const workStart = 8;
  const workEnd = 18;
  const slotDuration = 60; // minutes

  const busyTimes = result.events?.map(e => ({
    start: e.start,
    end: e.end,
    title: e.title,
  })) || [];

  // Calculate available slots
  const availableSlots: string[] = [];
  const datePrefix = query?.date || new Date().toISOString().split('T')[0];

  for (let hour = workStart; hour < workEnd; hour++) {
    const slotStart = new Date(`${datePrefix}T${String(hour).padStart(2, '0')}:00:00`);
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

    const isBusy = busyTimes.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return slotStart < busyEnd && slotEnd > busyStart;
    });

    if (!isBusy && slotStart > new Date()) {
      availableSlots.push(`${String(hour).padStart(2, '0')}:00`);
    }
  }

  return { success: true, available_slots: availableSlots, busy_times: busyTimes };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Get user's law_firm_id from profile (NOT from request body)
    const { data: profile } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", user.id)
      .single();

    if (!profile?.law_firm_id) {
      return new Response(
        JSON.stringify({ success: false, error: "User not associated with any company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const law_firm_id = profile.law_firm_id; // VALIDATED law_firm_id

    const request: CalendarActionRequest = await req.json();
    const { action, conversation_id, client_id, agent_id, event_data, query } = request;

    console.log(`[google-calendar-actions] Action: ${action}, LawFirm: ${law_firm_id}, User: ${user.email}`);

    // Get integration and check permissions
    const { data: integration, error: intError } = await supabase
      .from("google_calendar_integrations")
      .select("*")
      .eq("law_firm_id", law_firm_id)
      .eq("is_active", true)
      .single();

    if (intError || !integration) {
      console.error("[google-calendar-actions] Integration not found:", intError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Integração com Google Calendar não encontrada ou inativa" 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check permissions based on action
    if (action === "create_event" && !integration.allow_create_events) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Permissão para criar eventos não habilitada" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update_event" && !integration.allow_edit_events) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Permissão para editar eventos não habilitada" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_event" && !integration.allow_delete_events) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Permissão para cancelar eventos não habilitada" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((action === "list_events" || action === "check_availability") && !integration.allow_read_events) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Permissão para ler eventos não habilitada" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(supabase, integration);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Falha ao renovar token. Reconecte o Google Calendar." 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calendarId = integration.default_calendar_id || "primary";
    let result: any;
    let logData: any = {
      conversationId: conversation_id,
      clientId: client_id,
      agentId: agent_id,
    };

    switch (action) {
      case "create_event":
        result = await createEvent(accessToken, calendarId, event_data);
        logData = {
          ...logData,
          eventId: result.event?.id,
          eventTitle: event_data?.title,
          eventStart: event_data?.start_time,
          eventEnd: event_data?.end_time || result.event?.end?.dateTime,
          requestDescription: `Criar evento: ${event_data?.title}`,
          responseSummary: result.success 
            ? `Evento criado: ${result.event?.htmlLink}` 
            : `Erro: ${result.error}`,
          success: result.success,
          errorMessage: result.error,
        };
        break;

      case "update_event":
        result = await updateEvent(accessToken, calendarId, event_data);
        logData = {
          ...logData,
          eventId: event_data?.event_id,
          eventTitle: event_data?.title,
          eventStart: event_data?.start_time,
          requestDescription: `Atualizar evento: ${event_data?.event_id}`,
          responseSummary: result.success ? "Evento atualizado" : `Erro: ${result.error}`,
          success: result.success,
          errorMessage: result.error,
        };
        break;

      case "delete_event":
        result = await deleteEvent(accessToken, calendarId, event_data?.event_id || "");
        logData = {
          ...logData,
          eventId: event_data?.event_id,
          requestDescription: `Cancelar evento: ${event_data?.event_id}`,
          responseSummary: result.success ? "Evento cancelado" : `Erro: ${result.error}`,
          success: result.success,
          errorMessage: result.error,
        };
        break;

      case "list_events":
        result = await listEvents(accessToken, calendarId, query);
        logData = {
          ...logData,
          requestDescription: `Listar eventos`,
          responseSummary: result.success 
            ? `${result.events?.length || 0} eventos encontrados` 
            : `Erro: ${result.error}`,
          success: result.success,
          errorMessage: result.error,
        };
        break;

      case "check_availability":
        result = await checkAvailability(accessToken, calendarId, query);
        logData = {
          ...logData,
          requestDescription: `Verificar disponibilidade: ${query?.date || "hoje"}`,
          responseSummary: result.success 
            ? `${result.available_slots?.length || 0} horários disponíveis` 
            : `Erro: ${result.error}`,
          success: result.success,
          errorMessage: result.error,
        };
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Ação não reconhecida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Log the action
    await logAIAction(supabase, law_firm_id, integration.id, action, logData);

    console.log(`[google-calendar-actions] ${action} result:`, { success: result.success });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[google-calendar-actions] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
