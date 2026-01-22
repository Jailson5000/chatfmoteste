import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Action = "get" | "confirm" | "cancel";

interface RequestBody {
  token?: string;
  action?: Action;
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    if (req.method !== "GET") {
      const body = (await req.json().catch(() => ({}))) as RequestBody;
      token = body.token ?? token;
      action = body.action ?? action;
    }

    if (!token) {
      return new Response(JSON.stringify({ error: "token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeAction: Action = action ?? "get";
    console.log(
      `[agenda-pro-confirmation] action=${safeAction} token=${token.slice(0, 8)}...`,
    );

    const selectAppointment = async () => {
      return await supabase
        .from("agenda_pro_appointments")
        .select(
          `
            id,
            start_time,
            end_time,
            status,
            confirmed_at,
            cancelled_at,
            law_firm_id,
            agenda_pro_services(name),
            agenda_pro_professionals(name)
          `,
        )
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
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Mutations
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
    }

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
    }

    // Re-fetch after mutation to return updated status
    const { data: finalAppointment } =
      safeAction === "get" ? { data: appointment } : await selectAppointment();

    const { data: settings } = await supabase
      .from("agenda_pro_settings")
      .select("business_name, logo_url")
      .eq("law_firm_id", finalAppointment?.law_firm_id ?? appointment.law_firm_id)
      .maybeSingle();

    const apt = finalAppointment ?? appointment;
    // Supabase returns related records as arrays; extract first item
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
        service: serviceData ? { name: serviceData.name } : null,
        professional: professionalData ? { name: professionalData.name } : null,
        settings: settings
          ? {
              business_name: settings.business_name ?? "",
              logo_url: settings.logo_url ?? null,
            }
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
