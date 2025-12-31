import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  full_name: string;
  role: "admin" | "gerente" | "advogado" | "estagiario" | "atendente";
  law_firm_id: string;
  department_ids?: string[];
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

// Role labels
const roleLabels: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  advogado: "Supervisor",
  estagiario: "Supervisor",
  atendente: "Atendente",
};

function buildInviteEmail(
  memberName: string,
  companyName: string,
  role: string,
  email: string,
  temporaryPassword: string,
  subdomain?: string | null
): { subject: string; html: string } {
  // Use subdomain if available, otherwise main domain
  const accessUrl = subdomain 
    ? `https://${subdomain}.miauchat.com.br/auth`
    : `https://www.miauchat.com.br/auth`;
  const roleLabel = roleLabels[role] || role;
  
  return {
    subject: `Convite para ${companyName} – Acesso ao MiauChat`,
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
                    <p style="color: #fecaca; margin: 8px 0 0 0; font-size: 14px;">Convite para a Equipe</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                      Olá <strong style="color: #111827;">${memberName}</strong>,
                    </p>
                    
                    <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                      Você foi convidado para fazer parte da equipe de <strong style="color: #111827;">${companyName}</strong> no MiauChat como <strong style="color: #dc2626;">${roleLabel}</strong>.
                    </p>
                    
                    <!-- Credentials Box -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 24px;">
                          <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            📌 Seus Dados de Acesso
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
                                <span style="color: #111827; font-weight: 500;">${email}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">🏷️ Perfil:</span>
                              </td>
                              <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #e5e7eb;">
                                <span style="background-color: #dbeafe; padding: 4px 12px; border-radius: 4px; color: #1e40af; font-size: 13px; font-weight: 500;">${roleLabel}</span>
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
                      Se você não esperava este convite, pode ignorar este e-mail.
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json(401, {
        code: "UNAUTHORIZED",
        message: "Sessão inválida. Faça login novamente.",
      });
    }

    // We validate the user here (instead of relying on verify_jwt) so we can support all JWT formats.
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authUserData, error: authUserError } = await authSupabase.auth.getUser();
    if (authUserError || !authUserData?.user) {
      console.error("[invite-team-member] Invalid JWT", authUserError);
      return json(401, {
        code: "UNAUTHORIZED",
        message: "Sessão expirada. Faça login novamente.",
      });
    }

    const body: InviteRequest = await req.json();
    const { email, full_name, role, law_firm_id, department_ids = [] } = body;

    if (!email || !full_name || !role || !law_firm_id) {
      return json(400, {
        code: "BAD_REQUEST",
        message: "email, full_name, role and law_firm_id são obrigatórios",
      });
    }

    // Authorization: inviter must belong to this law firm AND be admin/gerente
    const inviterId = authUserData.user.id;

    const { data: inviterProfile, error: inviterProfileError } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", inviterId)
      .single();

    if (inviterProfileError || !inviterProfile?.law_firm_id) {
      console.error("[invite-team-member] Inviter profile missing", inviterProfileError);
      return json(403, {
        code: "FORBIDDEN",
        message: "Você não tem permissão para convidar membros.",
      });
    }

    if (inviterProfile.law_firm_id !== law_firm_id) {
      return json(403, {
        code: "FORBIDDEN",
        message: "Você não tem permissão para convidar membros para este escritório.",
      });
    }

    const { data: inviterRole, error: inviterRoleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", inviterId)
      .single();

    if (inviterRoleError || !inviterRole?.role) {
      console.error("[invite-team-member] Inviter role missing", inviterRoleError);
      return json(403, {
        code: "FORBIDDEN",
        message: "Você não tem permissão para convidar membros.",
      });
    }

    if (!(["admin", "gerente"].includes(inviterRole.role))) {
      return json(403, {
        code: "FORBIDDEN",
        message: "Somente Admin ou Gerente pode convidar membros.",
      });
    }

    console.log("[invite-team-member] Inviting:", email, "to law firm:", law_firm_id);

    // Get law firm name and subdomain
    const { data: lawFirm, error: lawFirmError } = await supabase
      .from('law_firms')
      .select('name, subdomain')
      .eq('id', law_firm_id)
      .single();

    if (lawFirmError || !lawFirm) {
      console.error("[invite-team-member] Law firm not found:", lawFirmError);
      return new Response(
        JSON.stringify({ error: "Law firm not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Create user with admin API
    // IMPORTANT: Pass law_firm_id in metadata so the handle_new_user trigger can use it
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
        law_firm_id, // CRITICAL: This is used by handle_new_user trigger
      },
    });

    if (authError) {
      console.error("[invite-team-member] Auth error:", authError);

      const authMsg = (authError.message || "").toLowerCase();
      const isDuplicateEmail =
        authMsg.includes("already") ||
        authMsg.includes("exists") ||
        authMsg.includes("registered") ||
        authMsg.includes("duplicate") ||
        authMsg.includes("email");

      if (isDuplicateEmail) {
        return json(409, {
          code: "USER_ALREADY_EXISTS",
          message: "Este e-mail já possui cadastro. Use outro e-mail ou peça para o usuário fazer login.",
        });
      }

      return json(400, {
        code: "CREATE_USER_FAILED",
        message: authError.message || "Falha ao criar usuário",
      });
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    console.log("[invite-team-member] User created:", userId);

    // Update profile with law_firm_id and must_change_password
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        law_firm_id,
        must_change_password: true,
        full_name,
      })
      .eq('id', userId);

    if (profileError) {
      console.error("[invite-team-member] Profile update error:", profileError);
    }

    // Set user role
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({ 
        user_id: userId,
        role,
      }, { 
        onConflict: 'user_id' 
      });

    if (roleError) {
      console.error("[invite-team-member] Role error:", roleError);
    }

    // Assign departments if provided (for atendente)
    if (department_ids.length > 0) {
      const deptInserts = department_ids.map(dept_id => ({
        member_id: userId,
        department_id: dept_id,
      }));

      const { error: deptError } = await supabase
        .from('member_departments')
        .insert(deptInserts);

      if (deptError) {
        console.error("[invite-team-member] Department assignment error:", deptError);
      }
    }

    // Send invite email
    if (!RESEND_API_KEY) {
      console.warn("[invite-team-member] RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ 
          success: true, 
          user_id: userId,
          email_sent: false,
          message: "Usuário criado, mas email não enviado (API key não configurada)"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailContent = buildInviteEmail(
      full_name,
      lawFirm.name,
      role,
      email,
      temporaryPassword,
      lawFirm.subdomain // Pass subdomain for correct accessUrl
    );

    console.log("[invite-team-member] Sending invite email to:", email);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MiauChat <suporte@miauchat.com.br>",
        reply_to: "suporte@miauchat.com.br",
        to: [email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("[invite-team-member] Email send error:", errorText);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          user_id: userId,
          email_sent: false,
          email_error: errorText
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[invite-team-member] Email sent successfully");

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email_sent: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[invite-team-member] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
