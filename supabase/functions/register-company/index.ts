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

// Simple in-memory rate limiter (per IP, per hour)
// Note: This resets on function cold starts, but provides basic protection
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5; // Max registrations per IP per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  // Clean up expired entries periodically
  if (rateLimitStore.size > 1000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetAt < now) rateLimitStore.delete(key);
    }
  }
  
  if (!record || record.resetAt < now) {
    // New window
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

interface RegisterRequest {
  company_name: string;
  admin_name: string;
  admin_email: string;
  phone?: string;
  document?: string;
  plan_id?: string;
  website?: string; // Honeypot field - should be empty
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

  // Get client IP for rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('cf-connecting-ip') || 
                   'unknown';
  
  // Check rate limit
  const rateLimit = checkRateLimit(clientIP);
  if (!rateLimit.allowed) {
    console.warn(`[register-company] Rate limit exceeded for IP: ${clientIP}`);
    return new Response(
      JSON.stringify({ 
        error: 'Muitas tentativas de cadastro. Por favor, aguarde 1 hora antes de tentar novamente.' 
      }),
      { 
        status: 429, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': '3600'
        } 
      }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'suporte@miauchat.com.br';
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse request body
    const body: RegisterRequest = await req.json();
    const { company_name, admin_name, admin_email, phone, document, plan_id, website } = body;

    // Honeypot check - if website field is filled, it's a bot
    if (website) {
      console.warn(`[register-company] Honeypot triggered from IP: ${clientIP}`);
      // Return success to fool the bot, but don't actually register
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Cadastro realizado com sucesso!',
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!company_name || !admin_name || !admin_email) {
      return new Response(
        JSON.stringify({ 
          error: 'Campos obrigatórios: company_name, admin_name, admin_email' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate field lengths
    if (company_name.length > 100 || admin_name.length > 100 || admin_email.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
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

    console.log(`[register-company] New registration request: ${company_name} - ${admin_email} (IP: ${clientIP}, remaining: ${rateLimit.remaining})`);

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
        // Plan selected by user (pending activation)
        plan_id: plan_id || null,
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

    // Fetch plan name if plan was selected
    let planName = 'Não selecionado';
    if (plan_id) {
      const { data: planData } = await supabase
        .from('plans')
        .select('name')
        .eq('id', plan_id)
        .single();
      if (planData) {
        planName = planData.name;
      }
    }

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
        plan_id,
        plan_name: planName,
        approval_status: 'pending_approval',
        timestamp: new Date().toISOString(),
      },
    });

    // Send emails
    let adminEmailSent = false;
    let userEmailSent = false;
    
    if (resendApiKey) {
      // 1) Send confirmation email TO THE USER who registered
      try {
        const userEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cadastro recebido — MIAUCHAT</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">✅ Cadastro Recebido!</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Olá, <strong>${admin_name}</strong>!
      </p>
      
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Recebemos o cadastro da empresa <strong>"${company_name}"</strong> no MIAUCHAT.
      </p>
      
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #92400e; margin: 0; font-weight: 600;">
          📋 Sua solicitação está em análise
        </p>
      </div>
      
      <h3 style="color: #1f2937; font-size: 16px; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
        Próximos passos:
      </h3>
      
      <ol style="color: #4b5563; padding-left: 20px;">
        <li style="margin-bottom: 12px;">Nossa equipe irá analisar seu cadastro</li>
        <li style="margin-bottom: 12px;">Após aprovação, você receberá um novo email com seus dados de acesso</li>
        <li style="margin-bottom: 12px;">Acesse o MiauChat e comece a usar!</li>
      </ol>
      
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">Seu subdomínio reservado:</p>
        <p style="color: #1f2937; margin: 0; font-weight: 600; font-size: 16px;">
          ${subdomain}.miauchat.com.br
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        Este processo geralmente leva até 24 horas úteis.
      </p>
      
      <p style="color: #9ca3af; font-size: 14px; font-style: italic; margin-top: 16px;">
        Caso tenha dúvidas, responda este email ou entre em contato pelo suporte@miauchat.com.br
      </p>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">
        — MIAUCHAT
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Multiplataforma de Inteligência Artificial Unificada
      </p>
    </div>
  </div>
</body>
</html>
        `;

        const userEmailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MiauChat <suporte@miauchat.com.br>',
            to: [admin_email],
            subject: `✅ Cadastro recebido — ${company_name}`,
            html: userEmailHtml,
          }),
        });

        if (userEmailResponse.ok) {
          userEmailSent = true;
          console.log('[register-company] User confirmation email sent to:', admin_email);
        } else {
          const errorText = await userEmailResponse.text();
          console.error('[register-company] User email error:', errorText);
        }
      } catch (emailError) {
        console.error('[register-company] User email exception:', emailError);
      }

      // 2) Send notification email TO ADMIN (suporte@miauchat.com.br)
      try {
        const adminEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Novo cadastro pendente — MIAUCHAT</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">⏳ Novo Cadastro Pendente</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Uma nova empresa solicitou cadastro no MIAUCHAT.
      </p>
      
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #92400e; margin: 0; font-weight: 600; font-size: 18px;">
          📋 Status: AGUARDANDO APROVAÇÃO
        </p>
      </div>
      
      <h3 style="color: #1f2937; font-size: 16px; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
        Dados do Cadastro
      </h3>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tr>
          <td style="padding: 10px 0; color: #6b7280; width: 140px;">Empresa</td>
          <td style="padding: 10px 0; color: #1f2937; font-weight: 500;">${company_name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280;">Administrador</td>
          <td style="padding: 10px 0; color: #1f2937; font-weight: 500;">${admin_name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280;">Email</td>
          <td style="padding: 10px 0; color: #1f2937; font-weight: 500;">${admin_email}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280;">Telefone</td>
          <td style="padding: 10px 0; color: #1f2937;">${phone || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280;">CNPJ/CPF</td>
          <td style="padding: 10px 0; color: #1f2937;">${document || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280;">Subdomínio</td>
          <td style="padding: 10px 0; color: #1f2937;">${subdomain}.miauchat.com.br</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Plano Escolhido</td>
          <td style="padding: 10px 0; color: #dc2626; font-weight: 600;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280;">Data/Hora</td>
          <td style="padding: 10px 0; color: #1f2937;">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
        </tr>
      </table>
      
      <div style="margin-top: 30px; text-align: center;">
        <a href="https://www.miauchat.com.br/global-admin/companies" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Revisar no Painel Admin
        </a>
      </div>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">
        — MIAUCHAT
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Plataforma de Comunicação
      </p>
    </div>
  </div>
</body>
</html>
        `;

        const adminEmailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MiauChat <suporte@miauchat.com.br>',
            to: [adminEmail],
            subject: `⏳ Novo cadastro pendente: ${company_name}`,
            html: adminEmailHtml,
          }),
        });

        if (adminEmailResponse.ok) {
          adminEmailSent = true;
          console.log('[register-company] Admin notification email sent to:', adminEmail);
        } else {
          const errorText = await adminEmailResponse.text();
          console.error('[register-company] Admin email error:', errorText);
        }
      } catch (emailError) {
        console.error('[register-company] Admin email exception:', emailError);
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
        admin_email_sent: adminEmailSent,
        user_email_sent: userEmailSent,
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
