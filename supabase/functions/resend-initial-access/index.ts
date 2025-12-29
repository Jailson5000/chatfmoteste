import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const body: ResendRequest = await req.json();
    const { company_id, reset_password = true } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company.admin_user_id) {
      return new Response(
        JSON.stringify({ error: "No admin user linked to this company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', company.admin_user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Admin profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        console.error("Failed to reset password:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to reset password" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Set must_change_password flag
      await supabase
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', company.admin_user_id);
    }

    // Send email
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailContent = buildInitialAccessEmail(
      company.name,
      profile.full_name,
      subdomain,
      profile.email,
      newPassword || '[senha não alterada]'
    );

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MIAUCHAT <noreply@resend.dev>",
        to: [profile.email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Email send error:", errorText);
      
      await supabase
        .from('companies')
        .update({
          initial_access_email_error: errorText,
        })
        .eq('id', company_id);

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in resend-initial-access:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
