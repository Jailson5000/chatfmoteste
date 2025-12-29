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

// Format timestamp in Brazilian format
function formatTimestamp(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

// Build initial access email
function buildInitialAccessEmail(
  companyName: string,
  adminName: string,
  subdomain: string,
  adminEmail: string,
  temporaryPassword: string
): { subject: string; html: string } {
  const accessUrl = `https://${subdomain}.miauchat.com.br`;
  
  return {
    subject: `🔐 Acesso inicial ao MIAUCHAT — ${companyName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🔐 MIAUCHAT</h1>
          <p style="color: #c7d2fe; margin: 8px 0 0 0; font-size: 14px;">Multiplataforma de Inteligência Artificial Unificada</p>
        </div>
        
        <div style="background: #1e293b; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0;">
            Olá <strong style="color: white;">${adminName}</strong>,
          </p>
          
          <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">
            Sua empresa "<strong style="color: white;">${companyName}</strong>" foi criada com sucesso no MIAUCHAT.
          </p>
          
          <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #94a3b8; font-weight: bold;">
              📌 Dados de acesso inicial:
            </p>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; color: #94a3b8; font-size: 14px; border-bottom: 1px solid #334155;">
                  🔗 Acesso:
                </td>
                <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #334155;">
                  <a href="${accessUrl}" style="color: #60a5fa; text-decoration: none; font-weight: bold;">
                    ${accessUrl}
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #94a3b8; font-size: 14px; border-bottom: 1px solid #334155;">
                  👤 Login:
                </td>
                <td style="padding: 12px 0; color: #e2e8f0; text-align: right; border-bottom: 1px solid #334155;">
                  ${adminEmail}
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #94a3b8; font-size: 14px;">
                  🔑 Senha provisória:
                </td>
                <td style="padding: 12px 0; text-align: right;">
                  <code style="background: #334155; padding: 8px 12px; border-radius: 4px; color: #fbbf24; font-family: monospace; font-size: 14px; letter-spacing: 1px;">
                    ${temporaryPassword}
                  </code>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>⚠️ Importante:</strong><br>
              No seu primeiro acesso ao MIAUCHAT, você será solicitado a criar uma nova senha por segurança.
            </p>
          </div>
          
          <p style="margin: 0; font-size: 14px; color: #94a3b8;">
            Caso não tenha solicitado este acesso ou encontre qualquer problema, entre em contato com nosso suporte.
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating admin user for company: ${company_name}`);
    console.log(`Admin email: ${admin_email}`);

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    console.log("Temporary password generated");

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
      console.error("Error creating auth user:", authError);
      
      // Update company with error
      await supabase
        .from('companies')
        .update({
          initial_access_email_error: `Auth error: ${authError.message}`,
        })
        .eq('id', company_id);

      return new Response(
        JSON.stringify({ error: "Failed to create user", details: authError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    console.log(`User created: ${userId}`);

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
      console.warn("Profile update error:", profileError);
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
      console.warn("Role assignment error:", roleError);
    }

    // Update company with admin user ID
    await supabase
      .from('companies')
      .update({
        admin_user_id: userId,
      })
      .eq('id', company_id);

    console.log("User profile and role configured");

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
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "MIAUCHAT <noreply@resend.dev>",
            to: [admin_email],
            subject: emailContent.subject,
            html: emailContent.html,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
          console.log("Initial access email sent successfully");
        } else {
          const errorText = await emailResponse.text();
          emailError = `Email API error: ${errorText}`;
          console.error("Email send error:", errorText);
        }
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Unknown email error";
        console.error("Email exception:", error);
      }
    } else {
      emailError = "RESEND_API_KEY not configured";
      console.warn("RESEND_API_KEY not configured, skipping email");
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in create-company-admin:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
