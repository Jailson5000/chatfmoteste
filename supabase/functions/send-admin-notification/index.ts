import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'provisioning_failed' | 'health_degraded' | 'max_retries_reached';
  company_id: string;
  company_name: string;
  subdomain?: string;
  error_message?: string;
  retry_count?: number;
  details?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const notification: NotificationRequest = await req.json();
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");

    if (!adminEmail) {
      console.error("ADMIN_NOTIFICATION_EMAIL not configured");
      return new Response(
        JSON.stringify({ error: "Admin email not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending ${notification.type} notification for company: ${notification.company_name}`);

    let subject = "";
    let htmlContent = "";

    switch (notification.type) {
      case 'provisioning_failed':
        subject = `⚠️ Provisionamento Falhou: ${notification.company_name}`;
        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">❌ Falha no Provisionamento</h1>
            </div>
            <div style="background: #1f2937; padding: 24px; border-radius: 0 0 12px 12px; color: #e5e7eb;">
              <p style="margin: 0 0 16px 0; font-size: 16px;">
                O provisionamento da empresa <strong style="color: white;">${notification.company_name}</strong> falhou.
              </p>
              
              <div style="background: #111827; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">Empresa:</td>
                    <td style="padding: 8px 0; color: white; text-align: right;">${notification.company_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">ID:</td>
                    <td style="padding: 8px 0; color: white; text-align: right; font-family: monospace; font-size: 12px;">${notification.company_id}</td>
                  </tr>
                  ${notification.subdomain ? `
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">Subdomínio:</td>
                    <td style="padding: 8px 0; color: #60a5fa; text-align: right;">${notification.subdomain}.miauchat.com.br</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              ${notification.error_message ? `
              <div style="background: #7f1d1d; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #ef4444;">
                <p style="margin: 0; font-size: 14px; color: #fecaca;">
                  <strong>Erro:</strong> ${notification.error_message}
                </p>
              </div>
              ` : ''}

              <p style="margin: 16px 0 0 0; font-size: 14px; color: #9ca3af;">
                Acesse o painel de administração para verificar e resolver o problema.
              </p>
            </div>
          </div>
        `;
        break;

      case 'max_retries_reached':
        subject = `🚨 Máximo de Retries Atingido: ${notification.company_name}`;
        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🔄 Máximo de Retries Atingido</h1>
            </div>
            <div style="background: #1f2937; padding: 24px; border-radius: 0 0 12px 12px; color: #e5e7eb;">
              <p style="margin: 0 0 16px 0; font-size: 16px;">
                O workflow n8n da empresa <strong style="color: white;">${notification.company_name}</strong> 
                falhou após <strong style="color: #f97316;">${notification.retry_count || 10}</strong> tentativas.
              </p>
              
              <div style="background: #111827; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">Empresa:</td>
                    <td style="padding: 8px 0; color: white; text-align: right;">${notification.company_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">ID:</td>
                    <td style="padding: 8px 0; color: white; text-align: right; font-family: monospace; font-size: 12px;">${notification.company_id}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">Tentativas:</td>
                    <td style="padding: 8px 0; color: #f97316; text-align: right; font-weight: bold;">${notification.retry_count || 10}</td>
                  </tr>
                </table>
              </div>

              ${notification.error_message ? `
              <div style="background: #7f1d1d; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #ef4444;">
                <p style="margin: 0; font-size: 14px; color: #fecaca;">
                  <strong>Último erro:</strong> ${notification.error_message}
                </p>
              </div>
              ` : ''}

              <div style="background: #1e3a5f; padding: 12px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <p style="margin: 0; font-size: 14px; color: #93c5fd;">
                  <strong>Ação necessária:</strong> Intervenção manual é necessária para resolver este problema.
                </p>
              </div>
            </div>
          </div>
        `;
        break;

      case 'health_degraded':
        subject = `⚠️ Saúde Degradada: ${notification.company_name}`;
        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%); padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Saúde Degradada</h1>
            </div>
            <div style="background: #1f2937; padding: 24px; border-radius: 0 0 12px 12px; color: #e5e7eb;">
              <p style="margin: 0 0 16px 0; font-size: 16px;">
                O tenant <strong style="color: white;">${notification.company_name}</strong> está com status de saúde degradado.
              </p>
              
              <div style="background: #111827; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">Empresa:</td>
                    <td style="padding: 8px 0; color: white; text-align: right;">${notification.company_name}</td>
                  </tr>
                  ${notification.subdomain ? `
                  <tr>
                    <td style="padding: 8px 0; color: #9ca3af;">Subdomínio:</td>
                    <td style="padding: 8px 0; color: #60a5fa; text-align: right;">${notification.subdomain}.miauchat.com.br</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <p style="margin: 16px 0 0 0; font-size: 14px; color: #9ca3af;">
                Verifique o painel de monitoramento para mais detalhes.
              </p>
            </div>
          </div>
        `;
        break;

      default:
        subject = `Notificação: ${notification.company_name}`;
        htmlContent = `<p>Notificação do sistema para ${notification.company_name}</p>`;
    }

    // Send email via Resend API directly
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MiauChat <noreply@resend.dev>",
        to: [adminEmail],
        subject,
        html: htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      throw new Error(`Resend API error: ${errorData}`);
    }

    const responseData = await emailResponse.json();
    console.log("Email sent successfully:", responseData);

    return new Response(
      JSON.stringify({ success: true, email_id: responseData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
