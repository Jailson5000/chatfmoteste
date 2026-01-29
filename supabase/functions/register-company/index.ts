import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Register Company - Self-Service Registration
 * 
 * This function handles public company registration requests.
 * 
 * TWO MODES:
 * 1. Trial Mode (registration_mode = 'trial'):
 *    - If auto_approve_trial_enabled = true: Auto-approve and provision with 7-day trial
 *    - If auto_approve_trial_enabled = false: Pending approval (manual)
 * 
 * 2. Pay Now Mode (registration_mode = 'pay_now'):
 *    - Handled by create-asaas-checkout, not this function
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter (per IP, per hour)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (rateLimitStore.size > 1000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetAt < now) rateLimitStore.delete(key);
    }
  }
  
  if (!record || record.resetAt < now) {
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
  subdomain?: string;
  website?: string; // Honeypot field
  registration_mode?: 'trial' | 'pay_now';
}

function generateSubdomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 30);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('cf-connecting-ip') || 
                   'unknown';
  
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
    const body: RegisterRequest = await req.json();
    const { 
      company_name, 
      admin_name, 
      admin_email, 
      phone, 
      document, 
      plan_id, 
      subdomain: customSubdomain, 
      website,
      registration_mode = 'trial'
    } = body;

    // Honeypot check
    if (website) {
      console.warn(`[register-company] Honeypot triggered from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Cadastro realizado com sucesso!' }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!company_name || !admin_name || !admin_email) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: company_name, admin_name, admin_email' }),
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

    console.log(`[register-company] New registration: ${company_name} - ${admin_email} (mode: ${registration_mode}, IP: ${clientIP})`);

    // Check if auto-approve trial is enabled
    let autoApproveEnabled = false;
    if (registration_mode === 'trial') {
      const { data: settingData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'auto_approve_trial_enabled')
        .single();
      
      autoApproveEnabled = settingData?.value === true || settingData?.value === 'true';
      console.log(`[register-company] Auto-approve trial enabled: ${autoApproveEnabled}`);

      // Check daily limit for auto-approve trials
      if (autoApproveEnabled) {
        let maxDailyTrials = 10; // default
        
        // Get max daily limit from settings
        const { data: maxDailySetting } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'max_daily_auto_trials')
          .maybeSingle();
        
        if (maxDailySetting?.value) {
          maxDailyTrials = parseInt(String(maxDailySetting.value), 10) || 10;
        }
        
        // Count today's auto-approved trials (reset at midnight UTC)
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        
        const { count } = await supabase
          .from('companies')
          .select('*', { count: 'exact', head: true })
          .eq('approval_status', 'approved')
          .gte('created_at', todayStart.toISOString())
          .not('trial_ends_at', 'is', null); // only trials
        
        const todayAutoApprovedCount = count || 0;
        
        // If limit reached, switch to manual approval
        if (todayAutoApprovedCount >= maxDailyTrials) {
          console.log(`[register-company] Daily auto-trial limit reached (${todayAutoApprovedCount}/${maxDailyTrials}) - switching to manual approval`);
          autoApproveEnabled = false; // Force manual approval
        } else {
          console.log(`[register-company] Daily auto-trial count: ${todayAutoApprovedCount}/${maxDailyTrials}`);
        }
      }
    }

    // Generate/validate subdomain
    let subdomain = customSubdomain || generateSubdomain(company_name);
    
    if (!/^[a-z0-9]{3,30}$/.test(subdomain)) {
      return new Response(
        JSON.stringify({ error: 'Subdomínio inválido. Use apenas letras minúsculas e números (3-30 caracteres)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check subdomain availability
    const { data: existingSubdomain } = await supabase
      .from('law_firms')
      .select('id')
      .eq('subdomain', subdomain)
      .maybeSingle();

    if (existingSubdomain) {
      if (customSubdomain) {
        return new Response(
          JSON.stringify({ error: 'Este subdomínio já está em uso. Por favor, escolha outro.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Auto-generate unique subdomain
      const { data: similarSubdomains } = await supabase
        .from('law_firms')
        .select('subdomain')
        .or(`subdomain.eq.${subdomain},subdomain.like.${subdomain}%`);
      
      if (similarSubdomains && similarSubdomains.length > 0) {
        const numbers: number[] = [1];
        for (const row of similarSubdomains) {
          if (row.subdomain === subdomain) continue;
          const match = row.subdomain.match(new RegExp(`^${subdomain}(\\d+)$`));
          if (match) {
            numbers.push(parseInt(match[1], 10));
          }
        }
        const nextNumber = Math.max(...numbers) + 1;
        subdomain = `${subdomain}${nextNumber}`;
      }
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

    // Create law_firm (tenant)
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

    // Determine approval status and trial dates
    const shouldAutoApprove = registration_mode === 'trial' && autoApproveEnabled;
    const trialEndsAt = shouldAutoApprove 
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: company_name,
        email: admin_email,
        phone: phone || null,
        document: document || null,
        law_firm_id: lawFirm.id,
        plan_id: plan_id || null,
        approval_status: shouldAutoApprove ? 'approved' : 'pending_approval',
        status: 'active',
        trial_ends_at: trialEndsAt,
        client_app_status: shouldAutoApprove ? 'pending' : 'pending',
        n8n_workflow_status: 'pending',
        provisioning_status: shouldAutoApprove ? 'pending' : 'pending',
      })
      .select()
      .single();

    if (companyError) {
      console.error('[register-company] Error creating company:', companyError);
      await supabase.from('law_firms').delete().eq('id', lawFirm.id);
      
      return new Response(
        JSON.stringify({ error: 'Erro ao criar empresa. Tente novamente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[register-company] Company created: ${company.id} (auto_approved: ${shouldAutoApprove})`);

    // Fetch plan name
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

    // If auto-approved, call provision-company to create admin user
    if (shouldAutoApprove) {
      console.log(`[register-company] Auto-approving trial, calling provision-company...`);
      
      try {
        const provisionResponse = await fetch(`${supabaseUrl}/functions/v1/provision-company`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            company_id: company.id,
            admin_name,
            admin_email,
          }),
        });

        const provisionResult = await provisionResponse.json();
        console.log(`[register-company] Provision result:`, provisionResult);

        if (!provisionResponse.ok || !provisionResult.success) {
          console.error(`[register-company] Provision failed:`, provisionResult);
          // Don't fail the whole registration, just log it
        }
      } catch (provisionError) {
        console.error(`[register-company] Error calling provision-company:`, provisionError);
      }
    }

    // Log audit event
    await supabase.from('audit_logs').insert({
      action: shouldAutoApprove ? 'COMPANY_TRIAL_AUTO_APPROVED' : 'COMPANY_SELF_REGISTRATION',
      entity_type: 'company',
      entity_id: company.id,
      new_values: {
        company_name,
        admin_name,
        admin_email,
        subdomain,
        plan_id,
        plan_name: planName,
        registration_mode,
        auto_approved: shouldAutoApprove,
        trial_ends_at: trialEndsAt,
        timestamp: new Date().toISOString(),
      },
    });

    // Send emails
    let adminEmailSent = false;
    let userEmailSent = false;
    
    if (resendApiKey) {
      if (shouldAutoApprove) {
        // Send auto-approved trial email to user
        try {
          const trialEndDate = new Date(trialEndsAt!).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          });

          const userEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Seu Trial foi Ativado — MIAUCHAT</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎉 Seu Trial foi Ativado!</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Olá, <strong>${admin_name}</strong>!
      </p>
      
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Sua conta no MiauChat foi criada com sucesso! Você tem <strong>7 dias grátis</strong> para testar todas as funcionalidades.
      </p>
      
      <div style="background: #dcfce7; border: 1px solid #16a34a; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #166534; margin: 0; font-weight: 600;">
          ✅ Período de teste ativo até: ${trialEndDate}
        </p>
      </div>
      
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">Seu acesso:</p>
        <p style="color: #1f2937; margin: 0; font-weight: 600; font-size: 16px;">
          ${subdomain}.miauchat.com.br
        </p>
        <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 14px;">
          Seus dados de login foram enviados em um email separado.
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        Ao final do período de teste, você pode assinar o plano <strong>${planName}</strong> para continuar usando.
      </p>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">— MIAUCHAT</p>
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
              subject: `🎉 Seu trial de 7 dias foi ativado — ${company_name}`,
              html: userEmailHtml,
            }),
          });

          if (userEmailResponse.ok) {
            userEmailSent = true;
            console.log('[register-company] Trial confirmation email sent to:', admin_email);
          }
        } catch (emailError) {
          console.error('[register-company] User email exception:', emailError);
        }
      } else {
        // Send pending approval email to user
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
    </div>
    
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">— MIAUCHAT</p>
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
            console.log('[register-company] Pending approval email sent to:', admin_email);
          }
        } catch (emailError) {
          console.error('[register-company] User email exception:', emailError);
        }

        // Send notification email to admin
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
      <p style="color: #6b7280; font-size: 14px; margin: 0;">— MIAUCHAT</p>
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
            console.log('[register-company] Admin notification email sent');
          }
        } catch (emailError) {
          console.error('[register-company] Admin email exception:', emailError);
        }
      }
    }

    // Log notification
    await supabase.from('admin_notification_logs').insert({
      tenant_id: company.id,
      company_name,
      event_type: shouldAutoApprove ? 'COMPANY_TRIAL_AUTO_APPROVED' : 'COMPANY_PENDING_APPROVAL',
      event_key: `${shouldAutoApprove ? 'trial' : 'pending'}_${company.id}`,
      email_sent_to: shouldAutoApprove ? admin_email : adminEmail,
      metadata: {
        admin_name,
        admin_email,
        subdomain,
        auto_approved: shouldAutoApprove,
        trial_ends_at: trialEndsAt,
        admin_email_sent: adminEmailSent,
        user_email_sent: userEmailSent,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: shouldAutoApprove 
          ? 'Seu período de teste foi ativado! Verifique seu email para os dados de acesso.'
          : 'Cadastro realizado com sucesso! Sua solicitação será analisada pela equipe MiauChat.',
        company_id: company.id,
        subdomain,
        approval_status: shouldAutoApprove ? 'approved' : 'pending_approval',
        auto_approved: shouldAutoApprove,
        trial_ends_at: trialEndsAt,
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
