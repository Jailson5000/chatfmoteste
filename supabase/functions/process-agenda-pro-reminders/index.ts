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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[process-agenda-pro-reminders] Starting reminder processing...");

    const now = new Date();
    
    // Window: appointments between 23-25 hours from now (to catch 24h appointments with some buffer)
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    console.log(`[process-agenda-pro-reminders] Looking for appointments between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`);

    // Get appointments that:
    // 1. Are scheduled or confirmed (not cancelled/completed)
    // 2. Start within the 24h window
    // 3. Haven't received a reminder yet
    // 4. Have a client phone or email
    const { data: appointments, error: aptError } = await supabase
      .from("agenda_pro_appointments")
      .select(`
        id,
        law_firm_id,
        start_time,
        client_phone,
        client_email,
        reminder_sent_at,
        agenda_pro_clients(phone, email)
      `)
      .in("status", ["scheduled", "confirmed"])
      .is("reminder_sent_at", null)
      .gte("start_time", windowStart.toISOString())
      .lte("start_time", windowEnd.toISOString());

    if (aptError) {
      console.error("[process-agenda-pro-reminders] Error fetching appointments:", aptError);
      throw aptError;
    }

    console.log(`[process-agenda-pro-reminders] Found ${appointments?.length || 0} appointments needing reminders`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each appointment
    for (const appointment of appointments || []) {
      results.processed++;
      
      // Check if has contact info (agenda_pro_clients is an array from the join)
      const clientData = Array.isArray(appointment.agenda_pro_clients) 
        ? appointment.agenda_pro_clients[0] 
        : appointment.agenda_pro_clients;
      const hasPhone = appointment.client_phone || clientData?.phone;
      const hasEmail = appointment.client_email || clientData?.email;
      
      if (!hasPhone && !hasEmail) {
        console.log(`[process-agenda-pro-reminders] Skipping ${appointment.id} - no contact info`);
        continue;
      }

      try {
        // Call the notification function with type='reminder'
        const notificationUrl = `${supabaseUrl}/functions/v1/agenda-pro-notification`;
        
        const response = await fetch(notificationUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            appointment_id: appointment.id,
            type: "reminder",
          }),
        });

        if (response.ok) {
          // Mark reminder as sent
          await supabase
            .from("agenda_pro_appointments")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", appointment.id);
          
          results.success++;
          console.log(`[process-agenda-pro-reminders] Sent reminder for ${appointment.id}`);
        } else {
          const errorData = await response.text();
          results.failed++;
          results.errors.push(`${appointment.id}: ${errorData}`);
          console.error(`[process-agenda-pro-reminders] Failed for ${appointment.id}:`, errorData);
        }
      } catch (err) {
        results.failed++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`${appointment.id}: ${msg}`);
        console.error(`[process-agenda-pro-reminders] Error for ${appointment.id}:`, err);
      }
    }

    console.log("[process-agenda-pro-reminders] Processing complete:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-agenda-pro-reminders] Critical error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
