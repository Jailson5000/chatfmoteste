import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

// Production CORS configuration
const ALLOWED_ORIGINS = [
  'https://miauchat.com.br',
  'https://www.miauchat.com.br',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.includes('.lovableproject.com') ||
    origin.includes('.lovable.app') ||
    origin.endsWith('.miauchat.com.br')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_THRESHOLD_MINUTES = 30;
const ALERT_COOLDOWN_HOURS = 6;

interface DisconnectedInstance {
  id: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  disconnected_since: string;
  last_alert_sent_at: string | null;
  law_firm_id: string;
  company_name?: string;
  law_firm_name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");

    if (!resendApiKey || !adminEmail) {
      console.log("[Check Instance Alerts] Missing RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Email configuration missing" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);
    const thresholdTime = new Date(Date.now() - ALERT_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const cooldownTime = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

    console.log("[Check Instance Alerts] Checking for disconnected instances...");
    console.log(`[Check Instance Alerts] Threshold: ${ALERT_THRESHOLD_MINUTES} minutes`);
    console.log(`[Check Instance Alerts] Cooldown: ${ALERT_COOLDOWN_HOURS} hours`);

    // Find instances that have been disconnected for more than threshold
    // and haven't received an alert within the cooldown period
    const { data: instances, error: fetchError } = await supabaseClient
      .from("whatsapp_instances")
      .select("*")
      .in("status", ["disconnected", "error"])
      .not("disconnected_since", "is", null)
      .lt("disconnected_since", thresholdTime)
      .or(`last_alert_sent_at.is.null,last_alert_sent_at.lt.${cooldownTime}`);

    if (fetchError) {
      console.error("[Check Instance Alerts] Error fetching instances:", fetchError);
      throw fetchError;
    }

    console.log(`[Check Instance Alerts] Found ${instances?.length || 0} instances needing alerts`);

    if (!instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No alerts needed",
          checked_at: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company and law firm info for each instance
    const lawFirmIds = [...new Set(instances.map(i => i.law_firm_id))];
    
    const { data: lawFirms } = await supabaseClient
      .from("law_firms")
      .select("id, name")
      .in("id", lawFirmIds);

    const { data: companies } = await supabaseClient
      .from("companies")
      .select("id, name, law_firm_id")
      .in("law_firm_id", lawFirmIds);

    // Enrich instances with company info
    const enrichedInstances: DisconnectedInstance[] = instances.map((instance) => {
      const lawFirm = lawFirms?.find(lf => lf.id === instance.law_firm_id);
      const company = companies?.find(c => c.law_firm_id === instance.law_firm_id);
      
      return {
        ...instance,
        law_firm_name: lawFirm?.name || "Desconhecido",
        company_name: company?.name || "Sem empresa",
      };
    });

    // Calculate disconnection duration for each instance
    const instancesWithDuration = enrichedInstances.map((instance) => {
      const disconnectedAt = new Date(instance.disconnected_since);
      const durationMs = Date.now() - disconnectedAt.getTime();
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationHours = Math.floor(durationMinutes / 60);
      const remainingMinutes = durationMinutes % 60;
      
      return {
        ...instance,
        duration: durationHours > 0 
          ? `${durationHours}h ${remainingMinutes}min`
          : `${durationMinutes}min`,
        durationMinutes,
      };
    });

    // Sort by duration (longest first)
    instancesWithDuration.sort((a, b) => b.durationMinutes - a.durationMinutes);

    // Build email content
    const instanceList = instancesWithDuration.map((instance) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${instance.company_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${instance.instance_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${instance.phone_number || "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">
          <span style="color: ${instance.status === 'error' ? '#dc2626' : '#f59e0b'}; font-weight: bold;">
            ${instance.status === 'error' ? 'Erro' : 'Desconectada'}
          </span>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${instance.duration}</td>
      </tr>
    `).join("");

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Alerta de Instâncias Desconectadas</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">⚠️ Alerta: Instâncias Desconectadas</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">MIAUCHAT - Monitoramento de Conexões</p>
        </div>
        
        <div style="background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin-top: 0;">
            <strong>${instancesWithDuration.length} instância(s)</strong> estão desconectadas há mais de 
            <strong>${ALERT_THRESHOLD_MINUTES} minutos</strong>:
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Empresa</th>
                <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Instância</th>
                <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Número</th>
                <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Duração</th>
              </tr>
            </thead>
            <tbody>
              ${instanceList}
            </tbody>
          </table>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin-top: 20px;">
            <p style="margin: 0; color: #92400e;">
              <strong>💡 Ação recomendada:</strong> Acesse o Painel Admin do MIAUCHAT para verificar 
              o status das conexões e tomar as medidas necessárias.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
            Este alerta será reenviado a cada ${ALERT_COOLDOWN_HOURS} horas enquanto as instâncias 
            permanecerem desconectadas.<br>
            Verificado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </p>
        </div>
      </body>
      </html>
    `;

    // Send email
    console.log(`[Check Instance Alerts] Sending alert email to ${adminEmail}`);
    
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "MIAUCHAT <onboarding@resend.dev>",
      to: [adminEmail],
      subject: `⚠️ ALERTA: ${instancesWithDuration.length} instância(s) desconectada(s) há mais de ${ALERT_THRESHOLD_MINUTES} min`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("[Check Instance Alerts] Email send error:", emailError);
      throw emailError;
    }

    console.log("[Check Instance Alerts] Email sent successfully:", emailResult);

    // Update last_alert_sent_at for all notified instances
    const instanceIds = instancesWithDuration.map(i => i.id);
    
    const { error: updateError } = await supabaseClient
      .from("whatsapp_instances")
      .update({ last_alert_sent_at: new Date().toISOString() })
      .in("id", instanceIds);

    if (updateError) {
      console.error("[Check Instance Alerts] Error updating alert timestamp:", updateError);
    }

    // Log the notification
    await supabaseClient.from("admin_notification_logs").insert({
      event_type: "INSTANCE_DISCONNECTION_ALERT",
      event_key: `instance_alert_${new Date().toISOString().slice(0, 13)}`,
      email_sent_to: adminEmail,
      metadata: {
        instances_count: instancesWithDuration.length,
        instance_names: instancesWithDuration.map(i => i.instance_name),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Alert sent for ${instancesWithDuration.length} instances`,
        instances: instancesWithDuration.map(i => ({
          name: i.instance_name,
          company: i.company_name,
          duration: i.duration,
        })),
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Check Instance Alerts] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
