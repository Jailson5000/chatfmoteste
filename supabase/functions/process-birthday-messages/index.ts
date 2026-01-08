import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BirthdayClient {
  id: string;
  name: string;
  phone: string;
  birth_date: string;
  law_firm_id: string;
}

interface BirthdaySettings {
  id: string;
  law_firm_id: string;
  enabled: boolean;
  message_template: string;
  send_time: string;
  include_coupon: boolean;
  coupon_discount_percent: number;
}

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[birthday-messages] Starting birthday message processing...");

    // Get current time in Brazil timezone
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = brazilTime.getHours();
    const currentMinute = brazilTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    
    // Get today's date in MM-DD format for birthday comparison
    const todayMonth = (brazilTime.getMonth() + 1).toString().padStart(2, '0');
    const todayDay = brazilTime.getDate().toString().padStart(2, '0');
    const todayBirthday = `${todayMonth}-${todayDay}`;

    console.log(`[birthday-messages] Current Brazil time: ${currentTimeStr}, checking birthdays for ${todayBirthday}`);

    // Get all law firms with birthday settings enabled
    const { data: settings, error: settingsError } = await supabase
      .from("birthday_settings")
      .select("*")
      .eq("enabled", true);

    if (settingsError) {
      console.error("[birthday-messages] Error fetching settings:", settingsError);
      throw settingsError;
    }

    console.log(`[birthday-messages] Found ${settings?.length || 0} law firms with birthday messages enabled`);

    const results = {
      messages_sent: 0,
      errors: [] as string[],
      skipped: 0,
    };

    // Process each law firm
    for (const setting of (settings || []) as BirthdaySettings[]) {
      try {
        // Check if it's time to send for this law firm
        const settingTime = setting.send_time || "09:00";
        const [settingHour, settingMinute] = settingTime.split(':').map(Number);
        
        // Only process if we're within 5 minutes of the configured time
        const settingTotalMinutes = settingHour * 60 + settingMinute;
        const currentTotalMinutes = currentHour * 60 + currentMinute;
        const timeDiff = Math.abs(settingTotalMinutes - currentTotalMinutes);
        
        if (timeDiff > 5) {
          console.log(`[birthday-messages] Skipping law_firm ${setting.law_firm_id}, send_time ${settingTime} != current ${currentTimeStr}`);
          results.skipped++;
          continue;
        }

        // Get clients with birthday today who have message enabled
        const { data: clients, error: clientsError } = await supabase
          .from("clients")
          .select("id, name, phone, birth_date, law_firm_id")
          .eq("law_firm_id", setting.law_firm_id)
          .eq("birthday_message_enabled", true)
          .not("birth_date", "is", null)
          .not("phone", "is", null);

        if (clientsError) {
          console.error(`[birthday-messages] Error fetching clients for ${setting.law_firm_id}:`, clientsError);
          results.errors.push(`Law firm ${setting.law_firm_id}: ${clientsError.message}`);
          continue;
        }

        // Filter clients whose birthday is today
        const birthdayClients = (clients || []).filter((client: BirthdayClient) => {
          if (!client.birth_date) return false;
          const birthDate = new Date(client.birth_date);
          const birthMonth = (birthDate.getMonth() + 1).toString().padStart(2, '0');
          const birthDay = birthDate.getDate().toString().padStart(2, '0');
          return `${birthMonth}-${birthDay}` === todayBirthday;
        });

        console.log(`[birthday-messages] Found ${birthdayClients.length} birthday clients for law_firm ${setting.law_firm_id}`);

        if (birthdayClients.length === 0) continue;

        // Check if we already sent messages today (to avoid duplicates)
        const todayStart = new Date(brazilTime);
        todayStart.setHours(0, 0, 0, 0);
        
        // Get WhatsApp instance
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("id, instance_name, api_url, api_key")
          .eq("law_firm_id", setting.law_firm_id)
          .eq("is_default", true)
          .eq("status", "connected")
          .single();

        if (!instance) {
          console.log(`[birthday-messages] No connected WhatsApp instance for law_firm ${setting.law_firm_id}`);
          results.errors.push(`Law firm ${setting.law_firm_id}: No WhatsApp instance`);
          continue;
        }

        // Get law firm name
        const { data: lawFirm } = await supabase
          .from("law_firms")
          .select("name")
          .eq("id", setting.law_firm_id)
          .single();

        // Send messages to each birthday client
        for (const client of birthdayClients as BirthdayClient[]) {
          try {
            // Check if already sent today
            const { data: existingLog } = await supabase
              .from("client_actions")
              .select("id")
              .eq("client_id", client.id)
              .eq("action_type", "birthday_message_sent")
              .gte("created_at", todayStart.toISOString())
              .limit(1);

            if (existingLog && existingLog.length > 0) {
              console.log(`[birthday-messages] Already sent to client ${client.id} today, skipping`);
              results.skipped++;
              continue;
            }

            // Build personalized message
            let message = setting.message_template
              .replace(/{nome}/gi, client.name.split(" ")[0])
              .replace(/{nome_completo}/gi, client.name)
              .replace(/{empresa}/gi, lawFirm?.name || "");

            // Add coupon if enabled
            if (setting.include_coupon && setting.coupon_discount_percent > 0) {
              message += `\n\n🎁 *Cupom especial de aniversário:* ${setting.coupon_discount_percent}% de desconto!`;
            }

            // Send via Evolution API
            const phone = client.phone.replace(/\D/g, "");
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
              console.error(`[birthday-messages] Failed to send to ${client.id}:`, errorData);
              results.errors.push(`Client ${client.id}: ${errorData}`);
              continue;
            }

            // Log the action
            await supabase.from("client_actions").insert({
              client_id: client.id,
              law_firm_id: setting.law_firm_id,
              action_type: "birthday_message_sent",
              description: `Mensagem de aniversário enviada automaticamente`,
            });

            console.log(`[birthday-messages] Sent birthday message to client ${client.id} (${client.name})`);
            results.messages_sent++;
          } catch (clientError) {
            const msg = clientError instanceof Error ? clientError.message : "Unknown error";
            results.errors.push(`Client ${client.id}: ${msg}`);
          }
        }
      } catch (lawFirmError) {
        const msg = lawFirmError instanceof Error ? lawFirmError.message : "Unknown error";
        results.errors.push(`Law firm ${setting.law_firm_id}: ${msg}`);
      }
    }

    console.log("[birthday-messages] Processing complete:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[birthday-messages] Critical error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
