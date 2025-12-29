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

interface ResendRequest {
  company_id: string;
  reset_password?: boolean; // If true, also reset password
}

// Generate secure temporary password
function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const length = 12;
  let password = '';
  
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  
  return password;
}

// Build initial access email - Professional template for MiauChat
function buildInitialAccessEmail(
  companyName: string,
  adminName: string,
  subdomain: string,
  adminEmail: string,
  temporaryPassword: string
): { subject: string; html: string } {
  // Use main domain for now
  const accessUrl = `https://www.miauchat.com.br/auth`;
  
  return {
    subject: `Bem-vindo ao MiauChat – Dados de Acesso | ${companyName}`,
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5;">
          <tr>
            <td style="padding: 40px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 32px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">🐱 MiauChat</h1>
                    <p style="color: #fecaca; margin: 8px 0 0 0; font-size: 14px;">Plataforma de Comunicação Inteligente</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                      Olá <strong style="color: #111827;">${adminName}</strong>,
                    </p>
                    
                    <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                      Sua conta para <strong style="color: #111827;">${companyName}</strong> foi criada com sucesso no MiauChat. Abaixo estão suas credenciais de acesso:
                    </p>
                    
                    <!-- Credentials Box -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 24px;">
                          <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            📌 Dados de Acesso
                          </p>
                          
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">🔗 URL de Acesso:</span>
                              </td>
                              <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #e5e7eb;">
                                <a href="${accessUrl}" style="color: #dc2626; text-decoration: none; font-weight: 600;">${accessUrl}</a>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">👤 E-mail:</span>
                              </td>
                              <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #e5e7eb;">
                                <span style="color: #111827; font-weight: 500;">${adminEmail}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 12px 0;">
                                <span style="color: #6b7280; font-size: 14px;">🔑 Senha Temporária:</span>
                              </td>
                              <td style="padding: 12px 0; text-align: right;">
                                <code style="background-color: #fef3c7; padding: 8px 12px; border-radius: 4px; color: #92400e; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; letter-spacing: 1px;">${temporaryPassword}</code>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Security Warning -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                            <strong>⚠️ Importante:</strong> Por segurança, você será solicitado a <strong>criar uma nova senha</strong> no seu primeiro acesso.
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${accessUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Acessar MiauChat</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      Caso não tenha solicitado este acesso ou encontre qualquer problema, entre em contato conosco respondendo este e-mail.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.5;">
                      Este e-mail foi enviado automaticamente pelo MiauChat.<br>
                      © ${new Date().getFullYear()} MiauChat - Todos os direitos reservados.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const body: ResendRequest = await req.json();
    const { company_id, reset_password = true } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    console.log("[resend-initial-access] Processing request for company:", company_id);

    // Get company data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select(`
        id,
        name,
        email,
        admin_user_id,
        law_firm:law_firms(id, subdomain)
      `)
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      console.error("[resend-initial-access] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (!company.admin_user_id) {
      return new Response(
        JSON.stringify({ error: "No admin user linked to this company" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Get admin profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', company.admin_user_id)
      .single();

    if (profileError || !profile) {
      console.error("[resend-initial-access] Admin profile not found:", profileError);
      return new Response(
        JSON.stringify({ error: "Admin profile not found" }),
        { status: 404, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Handle law_firm as array from join
    const lawFirmData = company.law_firm as unknown;
    const lawFirm = Array.isArray(lawFirmData) ? lawFirmData[0] : lawFirmData as { id: string; subdomain: string | null } | null;
    const subdomain = lawFirm?.subdomain || 'app';

    let newPassword: string | null = null;

    // Reset password if requested
    if (reset_password) {
      newPassword = generateTemporaryPassword();
      
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        company.admin_user_id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("[resend-initial-access] Failed to reset password:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to reset password" }),
          { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      // Set must_change_password flag
      await supabase
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', company.admin_user_id);
      
      console.log("[resend-initial-access] Password reset for user:", company.admin_user_id);
    }

    // Send email
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const emailContent = buildInitialAccessEmail(
      company.name,
      profile.full_name,
      subdomain,
      profile.email,
      newPassword || '[senha não alterada]'
    );

    console.log("[resend-initial-access] Sending email from suporte@miauchat.com.br to:", profile.email);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MiauChat <suporte@miauchat.com.br>",
        reply_to: "suporte@miauchat.com.br",
        to: [profile.email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("[resend-initial-access] Email send error:", errorText);
      
      await supabase
        .from('companies')
        .update({
          initial_access_email_error: errorText,
        })
        .eq('id', company_id);

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errorText }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const emailResult = await emailResponse.json();
    console.log("[resend-initial-access] Email sent successfully:", emailResult);

    // Update company status
    await supabase
      .from('companies')
      .update({
        initial_access_email_sent: true,
        initial_access_email_sent_at: new Date().toISOString(),
        initial_access_email_error: null,
      })
      .eq('id', company_id);

    // Log to notification logs
    await supabase
      .from('admin_notification_logs')
      .insert({
        event_type: 'COMPANY_ACCOUNT_CREATED',
        tenant_id: company_id,
        company_name: company.name,
        event_key: `resend_access_${company_id}_${Date.now()}`,
        email_sent_to: profile.email,
        metadata: {
          subdomain,
          admin_name: profile.full_name,
          password_reset: reset_password,
          resent: true,
          sent_from: 'suporte@miauchat.com.br',
        },
      });

    // Log audit
    await supabase.from('audit_logs').insert({
      action: 'INITIAL_ACCESS_EMAIL_RESENT',
      entity_type: 'company',
      entity_id: company_id,
      new_values: {
        admin_email: profile.email,
        password_reset: reset_password,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        email_sent_to: profile.email,
        password_reset: reset_password,
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[resend-initial-access] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});
