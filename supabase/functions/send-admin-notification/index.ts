import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

// Event types matching MIAUCHAT specification
type NotificationType = 
  | 'COMPANY_PROVISIONING_SUCCESS'
  | 'COMPANY_PROVISIONING_FAILED'
  | 'COMPANY_PROVISIONING_PARTIAL'
  | 'INTEGRATION_DOWN';

interface NotificationRequest {
  type: NotificationType;
  tenant_id: string;
  company_name: string;
  subdomain?: string;
  failed_step?: string;
  error_message?: string;
  retry_count?: number;
  integration_name?: string;
  status?: string;
  last_success?: string;
  details?: Record<string, any>;
}

// Cooldown configuration in minutes
const COOLDOWN_CONFIG: Record<NotificationType, number> = {
  'COMPANY_PROVISIONING_SUCCESS': 0, // Immediate, only once
  'COMPANY_PROVISIONING_FAILED': 0,  // Immediate, only once per event
  'COMPANY_PROVISIONING_PARTIAL': 360, // 6 hours
  'INTEGRATION_DOWN': 30, // 30 minutes
};

// Check if notification should be sent (deduplication + cooldown)
async function shouldSendNotification(
  supabase: any,
  type: NotificationType,
  tenantId: string,
  eventKey: string
): Promise<boolean> {
  const cooldownMinutes = COOLDOWN_CONFIG[type];
  
  // For immediate notifications, check if already sent for this exact event
  if (cooldownMinutes === 0) {
    const { data: existing } = await supabase
      .from('admin_notification_logs')
      .select('id')
      .eq('event_type', type)
      .eq('tenant_id', tenantId)
      .eq('event_key', eventKey)
      .limit(1);
    
    return !existing || existing.length === 0;
  }
  
  // For cooldown-based notifications, check time window
  const cooldownTime = new Date();
  cooldownTime.setMinutes(cooldownTime.getMinutes() - cooldownMinutes);
  
  const { data: recent } = await supabase
    .from('admin_notification_logs')
    .select('id')
    .eq('event_type', type)
    .eq('tenant_id', tenantId)
    .gte('sent_at', cooldownTime.toISOString())
    .limit(1);
  
  return !recent || recent.length === 0;
}

// Log notification for deduplication
async function logNotification(
  supabase: any,
  type: NotificationType,
  tenantId: string,
  companyName: string,
  eventKey: string,
  emailSentTo: string,
  metadata: Record<string, any>
) {
  try {
    await supabase.from('admin_notification_logs').insert({
      event_type: type,
      tenant_id: tenantId,
      company_name: companyName,
      event_key: eventKey,
      email_sent_to: emailSentTo,
      metadata,
    });
    console.log(`Notification logged: ${type} for ${companyName}`);
  } catch (error) {
    console.error('Failed to log notification:', error);
  }
}

// Generate timestamp in Brazilian format
function formatTimestamp(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

// Template: Success (Provisionamento OK)
function buildSuccessEmail(notification: NotificationRequest): { subject: string; html: string } {
  const timestamp = formatTimestamp();
  
  return {
    subject: `✅ Empresa criada com sucesso no MIAUCHAT — ${notification.company_name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">✅ MIAUCHAT</h1>
          <p style="color: #d1fae5; margin: 8px 0 0 0; font-size: 14px;">Multiplataforma de Inteligência Artificial Unificada</p>
        </div>
        
        <div style="background: #1e293b; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0;">Olá,</p>
          
          <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">
            A empresa "<strong style="color: white;">${notification.company_name}</strong>" foi criada com sucesso no MIAUCHAT.
          </p>
          
          <div style="background: #0f172a; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="color: #10b981; font-size: 18px; margin-right: 8px;">✔</span>
              <span style="color: #e2e8f0;">Ambiente do cliente provisionado</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="color: #10b981; font-size: 18px; margin-right: 8px;">✔</span>
              <span style="color: #e2e8f0;">Workflow n8n criado</span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="color: #10b981; font-size: 18px; margin-right: 8px;">✔</span>
              <span style="color: #e2e8f0;">Subdomínio ativo: <strong style="color: #60a5fa;">${notification.subdomain || 'N/A'}.miauchat.com.br</strong></span>
            </div>
          </div>
          
          <div style="background: #0f172a; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Tenant ID:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-family: monospace; font-size: 12px;">${notification.tenant_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Data/Hora:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-size: 12px;">${timestamp}</td>
              </tr>
            </table>
          </div>
          
          <p style="margin: 0; font-size: 14px; color: #10b981;">Nenhuma ação é necessária.</p>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">
              — MIAUCHAT<br>
              Plataforma de Comunicação
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

// Template: Error Critical (Erro Crítico)
function buildErrorEmail(notification: NotificationRequest): { subject: string; html: string } {
  const timestamp = formatTimestamp();
  
  return {
    subject: `❌ Erro crítico no MIAUCHAT — ${notification.company_name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">❌ MIAUCHAT</h1>
          <p style="color: #fecaca; margin: 8px 0 0 0; font-size: 14px;">Erro Crítico Detectado</p>
        </div>
        
        <div style="background: #1e293b; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 20px 0; font-size: 16px; color: #fca5a5; font-weight: bold;">ATENÇÃO,</p>
          
          <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">
            Ocorreu um erro crítico no MIAUCHAT ao provisionar a empresa "<strong style="color: white;">${notification.company_name}</strong>".
          </p>
          
          <div style="background: #7f1d1d; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
            <div style="margin-bottom: 12px;">
              <span style="color: #fca5a5; font-weight: bold;">❌ Etapa com falha:</span>
              <span style="color: #fecaca; display: block; margin-top: 4px;">${notification.failed_step || 'Provisionamento'}</span>
            </div>
            <div>
              <span style="color: #fca5a5; font-weight: bold;">❌ Erro:</span>
              <span style="color: #fecaca; display: block; margin-top: 4px; word-break: break-word;">${notification.error_message || 'Erro desconhecido'}</span>
            </div>
          </div>
          
          <div style="background: #0f172a; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Tenant ID:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-family: monospace; font-size: 12px;">${notification.tenant_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Data/Hora:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-size: 12px;">${timestamp}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #1e3a5f; padding: 12px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; font-size: 14px; color: #93c5fd;">
              <strong>Ação recomendada:</strong><br>
              ➡ Acessar o Painel ADMIN do MIAUCHAT e executar o retry.
            </p>
          </div>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">
              — MIAUCHAT<br>
              Plataforma de Comunicação
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

// Template: Partial (Estado Parcial / Alerta)
function buildPartialEmail(notification: NotificationRequest): { subject: string; html: string } {
  const timestamp = formatTimestamp();
  
  return {
    subject: `⚠️ Provisionamento parcial no MIAUCHAT — ${notification.company_name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ MIAUCHAT</h1>
          <p style="color: #fef3c7; margin: 8px 0 0 0; font-size: 14px;">Provisionamento Parcial</p>
        </div>
        
        <div style="background: #1e293b; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0;">Olá,</p>
          
          <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">
            A empresa "<strong style="color: white;">${notification.company_name}</strong>" foi criada no MIAUCHAT, porém o provisionamento ainda não foi concluído.
          </p>
          
          <div style="background: #0f172a; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #94a3b8; font-weight: bold;">Status atual:</p>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <span style="color: #10b981; font-size: 18px; margin-right: 8px;">✔</span>
              <span style="color: #e2e8f0;">Ambiente do cliente: <strong style="color: #10b981;">OK</strong></span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="color: #ef4444; font-size: 18px; margin-right: 8px;">❌</span>
              <span style="color: #e2e8f0;">Workflow n8n: <strong style="color: #f59e0b;">PENDENTE</strong></span>
            </div>
          </div>
          
          <div style="background: #0f172a; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Tenant ID:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-family: monospace; font-size: 12px;">${notification.tenant_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Última tentativa:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-size: 12px;">${timestamp}</td>
              </tr>
            </table>
          </div>
          
          <p style="margin: 0; font-size: 14px; color: #94a3b8;">
            O sistema do MIAUCHAT tentará novamente automaticamente.<br>
            Caso persista, executar retry manual pelo Painel ADMIN.
          </p>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">
              — MIAUCHAT<br>
              Plataforma de Comunicação
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

// Template: Integration Down (Integração Caiu)
function buildIntegrationDownEmail(notification: NotificationRequest): { subject: string; html: string } {
  const timestamp = formatTimestamp();
  
  return {
    subject: `🚨 Integração indisponível no MIAUCHAT — ${notification.integration_name || 'Integração'}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🚨 MIAUCHAT</h1>
          <p style="color: #fecaca; margin: 8px 0 0 0; font-size: 14px;">Alerta Operacional</p>
        </div>
        
        <div style="background: #1e293b; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 20px 0; font-size: 16px; color: #fca5a5; font-weight: bold;">ALERTA OPERACIONAL – MIAUCHAT,</p>
          
          <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">
            A integração "<strong style="color: white;">${notification.integration_name || 'Integração'}</strong>" está indisponível.
          </p>
          
          <div style="background: #0f172a; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Empresa:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right;">${notification.company_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Tenant ID:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-family: monospace; font-size: 12px;">${notification.tenant_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Status atual:</td>
                <td style="padding: 8px 0; color: #ef4444; text-align: right; font-weight: bold;">${notification.status || 'OFFLINE'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Última resposta válida:</td>
                <td style="padding: 8px 0; color: #e2e8f0; text-align: right; font-size: 12px;">${notification.last_success || 'N/A'}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #1e3a5f; padding: 12px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; font-size: 14px; color: #93c5fd;">
              Acesse o Painel ADMIN do MIAUCHAT para diagnóstico e correção.
            </p>
          </div>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">
              — Monitoramento MIAUCHAT<br>
              Plataforma de Comunicação
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Resend API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${notification.type} notification for: ${notification.company_name}`);

    // Generate unique event key for deduplication
    const eventKey = `${notification.type}_${notification.tenant_id}_${notification.error_message || ''}_${notification.failed_step || ''}`.substring(0, 200);

    // Check deduplication and cooldown
    const shouldSend = await shouldSendNotification(
      supabase,
      notification.type,
      notification.tenant_id,
      eventKey
    );

    if (!shouldSend) {
      console.log(`Notification skipped (dedup/cooldown): ${notification.type} for ${notification.company_name}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: 'Notification already sent or in cooldown period' 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email based on notification type
    let emailContent: { subject: string; html: string };

    switch (notification.type) {
      case 'COMPANY_PROVISIONING_SUCCESS':
        emailContent = buildSuccessEmail(notification);
        break;
      case 'COMPANY_PROVISIONING_FAILED':
        emailContent = buildErrorEmail(notification);
        break;
      case 'COMPANY_PROVISIONING_PARTIAL':
        emailContent = buildPartialEmail(notification);
        break;
      case 'INTEGRATION_DOWN':
        emailContent = buildIntegrationDownEmail(notification);
        break;
      default:
        console.error('Unknown notification type:', notification.type);
        return new Response(
          JSON.stringify({ error: 'Unknown notification type' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Send email via Resend API
    console.log(`Sending email: ${emailContent.subject}`);
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MIAUCHAT <noreply@resend.dev>",
        to: [adminEmail],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Resend API error:', errorData);
      throw new Error(`Resend API error: ${errorData}`);
    }

    const responseData = await emailResponse.json();
    console.log("Email sent successfully:", responseData);

    // Log notification for deduplication
    await logNotification(
      supabase,
      notification.type,
      notification.tenant_id,
      notification.company_name,
      eventKey,
      adminEmail,
      {
        email_id: responseData.id,
        subject: emailContent.subject,
        ...notification.details,
      }
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: responseData.id,
        type: notification.type,
        company_name: notification.company_name,
      }),
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
