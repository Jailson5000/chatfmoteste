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

interface CreateAdminRequest {
  company_id: string;
  company_name: string;
  law_firm_id: string;
  subdomain: string;
  admin_email: string;
  admin_name: string;
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
                      Sua conta para <strong style="color: #111827;">${companyName}</strong> foi criada com sucesso no MiauChat. Abaixo estão suas credenciais de acesso inicial:
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
                            <strong>⚠️ Importante:</strong> Por segurança, você será solicitado a <strong>criar uma nova senha</strong> no seu primeiro acesso. A senha temporária acima expirará após o primeiro login.
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
                      Caso não tenha solicitado este acesso ou encontre qualquer problema, entre em contato conosco respondendo este e-mail ou através do suporte.
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
    const body: CreateAdminRequest = await req.json();
    const { company_id, company_name, law_firm_id, subdomain, admin_email, admin_name } = body;

    if (!company_id || !admin_email || !admin_name || !law_firm_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    console.log(`[create-company-admin] Creating admin user for company: ${company_name}`);
    console.log(`[create-company-admin] Admin email: ${admin_email}`);

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    console.log("[create-company-admin] Temporary password generated");

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: admin_email,
      password: temporaryPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: admin_name,
        firm_name: company_name,
      },
    });

    if (authError) {
      console.error("[create-company-admin] Error creating auth user:", authError);
      
      // Update company with error
      await supabase
        .from('companies')
        .update({
          initial_access_email_error: `Auth error: ${authError.message}`,
        })
        .eq('id', company_id);

      return new Response(
        JSON.stringify({ error: "Failed to create user", details: authError.message }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    console.log(`[create-company-admin] User created: ${userId}`);

    // Update profile with must_change_password flag and link to law_firm
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        law_firm_id: law_firm_id,
        must_change_password: true,
        full_name: admin_name,
      })
      .eq('id', userId);

    if (profileError) {
      console.warn("[create-company-admin] Profile update error:", profileError);
      // Profile might be created by trigger, try upsert
      await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: admin_email,
          full_name: admin_name,
          law_firm_id: law_firm_id,
          must_change_password: true,
        });
    }

    // Assign admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'admin',
      });

    if (roleError) {
      console.warn("[create-company-admin] Role assignment error:", roleError);
    }

    // Update company with admin user ID
    await supabase
      .from('companies')
      .update({
        admin_user_id: userId,
      })
      .eq('id', company_id);

    console.log("[create-company-admin] User profile and role configured");

    // Send initial access email
    let emailSent = false;
    let emailError: string | null = null;

    if (RESEND_API_KEY) {
      const emailContent = buildInitialAccessEmail(
        company_name,
        admin_name,
        subdomain,
        admin_email,
        temporaryPassword
      );

      try {
        console.log("[create-company-admin] Sending email from suporte@miauchat.com.br to:", admin_email);
        
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "MiauChat <suporte@miauchat.com.br>",
            reply_to: "suporte@miauchat.com.br",
            to: [admin_email],
            subject: emailContent.subject,
            html: emailContent.html,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
          const responseData = await emailResponse.json();
          console.log("[create-company-admin] Initial access email sent successfully:", responseData);
        } else {
          const errorText = await emailResponse.text();
          emailError = `Email API error: ${errorText}`;
          console.error("[create-company-admin] Email send error:", errorText);
        }
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Unknown email error";
        console.error("[create-company-admin] Email exception:", error);
      }
    } else {
      emailError = "RESEND_API_KEY not configured";
      console.warn("[create-company-admin] RESEND_API_KEY not configured, skipping email");
    }

    // Update company with email status
    await supabase
      .from('companies')
      .update({
        initial_access_email_sent: emailSent,
        initial_access_email_sent_at: emailSent ? new Date().toISOString() : null,
        initial_access_email_error: emailError,
      })
      .eq('id', company_id);

    // Log to notification logs
    await supabase
      .from('admin_notification_logs')
      .insert({
        event_type: 'COMPANY_ACCOUNT_CREATED',
        tenant_id: company_id,
        company_name: company_name,
        event_key: `initial_access_${company_id}`,
        email_sent_to: admin_email,
        metadata: {
          subdomain,
          admin_name,
          email_sent: emailSent,
          email_error: emailError,
          sent_from: 'suporte@miauchat.com.br',
        },
      });

    // Log audit
    await supabase.from('audit_logs').insert({
      action: 'INITIAL_ACCESS_EMAIL_SENT',
      entity_type: 'company',
      entity_id: company_id,
      new_values: {
        admin_email,
        admin_name,
        email_sent: emailSent,
        status: emailSent ? 'success' : 'failed',
        error: emailError,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email_sent: emailSent,
        email_error: emailError,
        must_change_password: true,
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[create-company-admin] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});
