import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertThreshold {
  type: string;
  currentValue: number;
  limitValue: number;
  percentUsed: number;
  level: "warning" | "critical";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[check-infrastructure-alerts] Starting infrastructure check...");

    // Get database metrics
    const { data: dbMetrics, error: dbError } = await supabase.rpc("get_database_metrics");
    if (dbError) {
      console.error("[check-infrastructure-alerts] Database metrics error:", dbError);
    }

    // Get storage metrics
    const { data: storageMetrics, error: storageError } = await supabase.rpc("get_storage_metrics");
    if (storageError) {
      console.error("[check-infrastructure-alerts] Storage metrics error:", storageError);
    }

    const alerts: AlertThreshold[] = [];

    // Check database thresholds
    if (dbMetrics && !dbMetrics.error) {
      const dbPercent = dbMetrics.percent_used;
      if (dbPercent >= 85) {
        alerts.push({
          type: "database",
          currentValue: dbMetrics.database_size_bytes,
          limitValue: dbMetrics.database_limit_bytes,
          percentUsed: dbPercent,
          level: "critical",
        });
      } else if (dbPercent >= 70) {
        alerts.push({
          type: "database",
          currentValue: dbMetrics.database_size_bytes,
          limitValue: dbMetrics.database_limit_bytes,
          percentUsed: dbPercent,
          level: "warning",
        });
      }
    }

    // Check storage thresholds
    if (storageMetrics && !storageMetrics.error) {
      const storagePercent = storageMetrics.percent_used;
      if (storagePercent >= 85) {
        alerts.push({
          type: "storage",
          currentValue: storageMetrics.storage_size_bytes,
          limitValue: storageMetrics.storage_limit_bytes,
          percentUsed: storagePercent,
          level: "critical",
        });
      } else if (storagePercent >= 70) {
        alerts.push({
          type: "storage",
          currentValue: storageMetrics.storage_size_bytes,
          limitValue: storageMetrics.storage_limit_bytes,
          percentUsed: storagePercent,
          level: "warning",
        });
      }
    }

    console.log(`[check-infrastructure-alerts] Found ${alerts.length} alerts to process`);

    // Process each alert
    for (const alert of alerts) {
      // Check if we already sent this alert today
      const { data: existingAlert } = await supabase
        .from("infrastructure_alert_history")
        .select("id")
        .eq("alert_type", alert.type)
        .eq("threshold_level", alert.level)
        .eq("alert_date", new Date().toISOString().split("T")[0])
        .maybeSingle();

      if (existingAlert) {
        console.log(`[check-infrastructure-alerts] Alert ${alert.type}/${alert.level} already sent today, skipping`);
        continue;
      }

      // Record the alert
      await supabase.from("infrastructure_alert_history").insert({
        alert_type: alert.type,
        threshold_level: alert.level,
        metric_value: alert.currentValue,
        metric_limit: alert.limitValue,
        alert_date: new Date().toISOString().split("T")[0],
      });

      // Create notification for admin
      const typeLabel = alert.type === "database" ? "Banco de Dados" : "Storage";
      const levelLabel = alert.level === "critical" ? "CRÍTICO" : "ATENÇÃO";
      const percentFormatted = alert.percentUsed.toFixed(1);

      const title = `${levelLabel}: ${typeLabel} em ${percentFormatted}%`;
      const message = alert.level === "critical"
        ? `O ${typeLabel.toLowerCase()} atingiu ${percentFormatted}% do limite. Ação urgente necessária para evitar interrupção do serviço.`
        : `O ${typeLabel.toLowerCase()} atingiu ${percentFormatted}% do limite. Considere implementar políticas de retenção de dados.`;

      await supabase.from("notifications").insert({
        user_id: null,
        admin_user_id: null, // Broadcast to all admins
        title,
        message,
        type: alert.level === "critical" ? "INFRASTRUCTURE_CRITICAL" : "INFRASTRUCTURE_WARNING",
        is_read: false,
        metadata: {
          alert_type: alert.type,
          threshold_level: alert.level,
          percent_used: alert.percentUsed,
          current_value: alert.currentValue,
          limit_value: alert.limitValue,
        },
      });

      console.log(`[check-infrastructure-alerts] Created notification: ${title}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alerts_processed: alerts.length,
        database_percent: dbMetrics?.percent_used || null,
        storage_percent: storageMetrics?.percent_used || null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[check-infrastructure-alerts] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
