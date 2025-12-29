import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Register Company - Self-Service Registration
 * 
 * This function handles public company registration requests.
 * Companies registered through this endpoint:
 * - Receive status 'pending_approval'
 * - Do NOT get provisioned (no app, no n8n, no admin user)
 * - Trigger an email notification to suporte@miauchat.com.br
 * - Must be manually approved by a Global Admin
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegisterRequest {
  company_name: string;
  admin_name: string;
  admin_email: string;
  phone?: string;
  document?: string;
}

function generateSubdomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'suporte@miauchat.com.br';
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse request body
    const body: RegisterRequest = await req.json();
    const { company_name, admin_name, admin_email, phone, document } = body;

    // Validate required fields
    if (!company_name || !admin_name || !admin_email) {
      return new Response(
        JSON.stringify({ 
          error: 'Campos obrigatórios: company_name, admin_name, admin_email' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(admin_email)) {
      return new Response(
        JSON.stringify({ error: 'Email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[register-company] New registration request: ${company_name} - ${admin_email}`);

    // Generate subdomain
    let subdomain = generateSubdomain(company_name);
    
    // Check if subdomain is available
    const { data: existingSubdomain } = await supabase
      .from('law_firms')
      .select('id')
      .eq('subdomain', subdomain)
      .single();

    if (existingSubdomain) {
      subdomain = `${subdomain}-${Math.random().toString(36).substring(2, 6)}`;
    }

    // Check if email is already registered
    const { data: existingEmail } = await supabase
      .from('companies')
      .select('id')
      .eq('email', admin_email)
      .single();

    if (existingEmail) {
      return new Response(
        JSON.stringify({ error: 'Este email já está cadastrado no sistema' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create law_firm (tenant) - but with no users yet
    const { data: lawFirm, error: lawFirmError } = await supabase
      .from('law_firms')
      .insert({
        name: company_name,
        email: admin_email,
        phone: phone || null,
        document: document || null,
        subdomain,
      })
      .select()
      .single();

    if (lawFirmError) {
      console.error('[register-company] Error creating law_firm:', lawFirmError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar registro. Tente novamente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[register-company] Law firm created: ${lawFirm.id}`);

    // Create company with PENDING_APPROVAL status
    // NO provisioning happens here - no app, no n8n, no admin user
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: company_name,
        email: admin_email,
        phone: phone || null,
        document: document || null,
        law_firm_id: lawFirm.id,
        // Critical: Set to pending_approval
        approval_status: 'pending_approval',
        status: 'active', // Company is active, but not approved
        // Provisioning NOT started
        client_app_status: 'pending',
        n8n_workflow_status: 'pending',
        provisioning_status: 'pending',
      })
      .select()
      .single();

    if (companyError) {
      console.error('[register-company] Error creating company:', companyError);
      // Rollback law_firm
      await supabase.from('law_firms').delete().eq('id', lawFirm.id);
      
      return new Response(
        JSON.stringify({ error: 'Erro ao criar empresa. Tente novamente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[register-company] Company created with pending_approval: ${company.id}`);

    // Log audit event
    await supabase.from('audit_logs').insert({
      action: 'COMPANY_SELF_REGISTRATION',
      entity_type: 'company',
      entity_id: company.id,
      new_values: {
        company_name,
        admin_name,
        admin_email,
        subdomain,
        approval_status: 'pending_approval',
        timestamp: new Date().toISOString(),
      },
    });

    // Send notification email to admin (suporte@miauchat.com.br)
    let emailSent = false;
    if (resendApiKey) {
      try {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Novo Cadastro Pendente</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🆕 Novo Cadastro Pendente</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Uma nova empresa se cadastrou e aguarda aprovação</p>
    </div>
    
    <div style="padding: 30px;">
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="color: #991b1b; margin: 0; font-weight: 600;">
          ⚠️ Esta empresa NÃO pode acessar o sistema até ser aprovada.
        </p>
      </div>
      
      <h2 style="color: #1f2937; font-size: 18px; margin-bottom: 16px;">Dados do Cadastro</h2>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 140px;">Empresa</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 500;">${company_name}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Administrador</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 500;">${admin_name}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Email</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 500;">${admin_email}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Telefone</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${phone || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">CNPJ/CPF</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${document || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Subdomínio</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${subdomain}.miauchat.com.br</td>
        </tr>
        <tr>
          <td style="padding: 12px; color: #6b7280;">Data/Hora</td>
          <td style="padding: 12px; color: #1f2937;">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
        </tr>
      </table>
      
      <div style="margin-top: 30px; text-align: center;">
        <a href="https://www.miauchat.com.br/global-admin/companies" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Acessar Painel Admin
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px; text-align: center;">
        Acesse o painel administrativo para aprovar ou rejeitar este cadastro.
      </p>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Este é um email automático do sistema MiauChat.<br>
        © ${new Date().getFullYear()} MiauChat - Plataforma de Comunicação
      </p>
    </div>
  </div>
</body>
</html>
        `;

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MiauChat <suporte@miauchat.com.br>',
            to: [adminEmail],
            subject: `🆕 Novo Cadastro Pendente: ${company_name}`,
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
          console.log('[register-company] Admin notification email sent');
        } else {
          const errorText = await emailResponse.text();
          console.error('[register-company] Email error:', errorText);
        }
      } catch (emailError) {
        console.error('[register-company] Email exception:', emailError);
      }
    } else {
      console.warn('[register-company] RESEND_API_KEY not configured');
    }

    // Log notification
    await supabase.from('admin_notification_logs').insert({
      tenant_id: company.id,
      company_name,
      event_type: 'COMPANY_PENDING_APPROVAL',
      event_key: `pending_${company.id}`,
      email_sent_to: adminEmail,
      metadata: {
        admin_name,
        admin_email,
        subdomain,
        email_sent: emailSent,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cadastro realizado com sucesso! Sua solicitação será analisada pela equipe MiauChat.',
        company_id: company.id,
        subdomain,
        approval_status: 'pending_approval',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[register-company] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
