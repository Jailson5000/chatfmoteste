import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Approve Company - Admin Approval Endpoint
 * 
 * This function handles company approval by Global Admins.
 * When a company is approved:
 * - Status changes to 'approved'
 * - Full provisioning is triggered (app + n8n + admin user)
 * - Welcome email is sent with credentials
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApproveRequest {
  company_id: string;
  action: 'approve' | 'reject';
  rejection_reason?: string;
  admin_name?: string;
  plan_id?: string;
  max_users?: number;
  max_instances?: number;
  auto_activate_workflow?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is an admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: adminRole } = await supabase
      .from('admin_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[approve-company] Admin: ${user.id}, Role: ${adminRole.role}`);

    // Parse request body
    const body: ApproveRequest = await req.json();
    const { company_id, action, rejection_reason, plan_id, auto_activate_workflow = true } = body;
    let { max_users = 5, max_instances = 2 } = body;

    if (!company_id || !action) {
      return new Response(
        JSON.stringify({ error: 'company_id and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch company details
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*, law_firm:law_firms(*)')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify company is pending approval
    if (company.approval_status !== 'pending_approval') {
      return new Response(
        JSON.stringify({ 
          error: `Company is not pending approval. Current status: ${company.approval_status}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[approve-company] Processing ${action} for company: ${company.name}`);

    // If plan_id is provided, fetch plan details to get limits
    const effectivePlanId = plan_id || company.plan_id;
    let planName = 'Não definido';
    
    if (effectivePlanId) {
      const { data: planData } = await supabase
        .from('plans')
        .select('name, max_users, max_instances')
        .eq('id', effectivePlanId)
        .single();
      
      if (planData) {
        planName = planData.name;
        // Use plan limits if not explicitly provided in request
        if (!body.max_users && planData.max_users) {
          max_users = planData.max_users;
        }
        if (!body.max_instances && planData.max_instances) {
          max_instances = planData.max_instances;
        }
        console.log(`[approve-company] Using plan "${planName}" with limits: ${max_users} users, ${max_instances} instances`);
      }
    }

    // ========================================
    // HANDLE REJECTION
    // ========================================
    if (action === 'reject') {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          approval_status: 'rejected',
          rejection_reason: rejection_reason || 'Não informado',
          rejected_at: new Date().toISOString(),
          rejected_by: user.id,
          status: 'cancelled',
        })
        .eq('id', company_id);

      if (updateError) {
        console.error('[approve-company] Error rejecting:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to reject company' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        admin_user_id: user.id,
        action: 'COMPANY_REJECTED',
        entity_type: 'company',
        entity_id: company_id,
        new_values: {
          rejection_reason,
          rejected_by: user.id,
          timestamp: new Date().toISOString(),
        },
      });

      // TEMPLATE: CADASTRO REJEITADO
      if (resendApiKey && company.email) {
        try {
          const rejectionHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cadastro não aprovado — MIAUCHAT</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">❌ Cadastro não aprovado — MIAUCHAT</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Olá,
      </p>
      
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Após análise, o cadastro da empresa <strong>"${company.name}"</strong> não foi aprovado no MIAUCHAT.
      </p>
      
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Caso precise de mais informações, entre em contato conosco pelo canal oficial:
      </p>
      
      <p style="color: #1f2937; font-size: 16px;">
        📧 <a href="mailto:suporte@miauchat.com.br" style="color: #dc2626; text-decoration: none;">suporte@miauchat.com.br</a>
      </p>
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

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'MiauChat <suporte@miauchat.com.br>',
              to: [company.email],
              subject: `❌ Cadastro não aprovado — MIAUCHAT`,
              html: rejectionHtml,
            }),
          });
          console.log('[approve-company] Rejection email sent');
        } catch (emailError) {
          console.error('[approve-company] Email error:', emailError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'rejected',
          company_id,
          message: 'Empresa rejeitada com sucesso',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // HANDLE APPROVAL - FULL PROVISIONING
    // ========================================
    console.log('[approve-company] Starting full provisioning...');

    // Update company to approved status
    await supabase
      .from('companies')
      .update({
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        plan_id: plan_id || company.plan_id,
        max_users,
        max_instances,
        client_app_status: 'creating',
        n8n_workflow_status: 'pending',
        provisioning_status: 'pending',
      })
      .eq('id', company_id);

    // Log approval
    await supabase.from('audit_logs').insert({
      admin_user_id: user.id,
      action: 'COMPANY_APPROVED',
      entity_type: 'company',
      entity_id: company_id,
      new_values: {
        approved_by: user.id,
        plan_id,
        max_users,
        max_instances,
        timestamp: new Date().toISOString(),
      },
    });

    // Get law_firm data
    const lawFirm = company.law_firm;
    const subdomain = lawFirm?.subdomain || '';
    const adminEmail = company.email;
    const adminName = body.admin_name || lawFirm?.name || company.name;

    // ========================================
    // STEP 1: CLONE TEMPLATE BASE FOR COMPANY
    // ========================================
    console.log('[approve-company] Cloning template base for company...');
    
    let templateCloneResult = null;
    let automationId: string | null = null;

    try {
      // Call the database function to clone template
      const { data: cloneResult, error: cloneError } = await supabase
        .rpc('clone_template_for_company', {
          _law_firm_id: lawFirm.id,
          _company_id: company_id,
        });

      if (cloneError) {
        console.error('[approve-company] Template clone error:', cloneError);
        // Fallback: create basic automation manually
        const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');
        const { data: automation, error: automationError } = await supabase
          .from('automations')
          .insert({
            law_firm_id: lawFirm.id,
            name: 'Atendente IA Principal',
            trigger_type: 'message_received',
            webhook_url: n8nWebhookUrl || 'https://n8n.miauchat.com.br/webhook/atendimento',
            is_active: true,
            ai_prompt: `Você é um assistente virtual da empresa ${company.name}. Seja cordial e profissional.`,
            ai_temperature: 0.7,
            trigger_config: { enabled: true },
          })
          .select()
          .single();

        if (!automationError && automation) {
          automationId = automation.id;
        }
      } else {
        templateCloneResult = cloneResult;
        automationId = cloneResult?.automation_id || null;
        console.log('[approve-company] Template cloned successfully:', cloneResult);
      }
    } catch (templateError) {
      console.error('[approve-company] Template clone exception:', templateError);
    }

    // Update client app status
    await supabase
      .from('companies')
      .update({ client_app_status: 'created' })
      .eq('id', company_id);

    // ========================================
    // STEP 2: CREATE N8N WORKFLOW
    // ========================================
    console.log('[approve-company] Creating n8n workflow...');

    let n8nResult = null;
    let n8nStatus = 'pending';

    try {
      const n8nResponse = await fetch(`${supabaseUrl}/functions/v1/create-n8n-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          company_id: company_id,
          company_name: company.name,
          law_firm_id: lawFirm.id,
          subdomain: subdomain,
          auto_activate: auto_activate_workflow,
        }),
      });

      if (n8nResponse.ok) {
        n8nResult = await n8nResponse.json();
        n8nStatus = 'created';
        console.log('[approve-company] N8N workflow created:', n8nResult);
      } else {
        const errorText = await n8nResponse.text();
        n8nStatus = 'error';
        console.error('[approve-company] N8N error:', errorText);
        
        await supabase
          .from('companies')
          .update({ 
            n8n_workflow_status: 'error',
            n8n_last_error: errorText.substring(0, 500),
          })
          .eq('id', company_id);
      }
    } catch (n8nError) {
      n8nStatus = 'error';
      console.error('[approve-company] N8N exception:', n8nError);
      
      await supabase
        .from('companies')
        .update({ 
          n8n_workflow_status: 'error',
          n8n_last_error: n8nError instanceof Error ? n8nError.message : 'Unknown error',
        })
        .eq('id', company_id);
    }

    // ========================================
    // STEP 3: CREATE ADMIN USER
    // ========================================
    console.log('[approve-company] Creating admin user...');

    let adminUserResult = null;
    let temporaryPassword = '';

    if (adminEmail) {
      try {
        const adminResponse = await fetch(`${supabaseUrl}/functions/v1/create-company-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            company_id: company_id,
            company_name: company.name,
            law_firm_id: lawFirm.id,
            admin_name: adminName,
            admin_email: adminEmail,
            subdomain: subdomain,
          }),
        });

        if (adminResponse.ok) {
          adminUserResult = await adminResponse.json();
          temporaryPassword = adminUserResult.temporary_password || '';
          console.log('[approve-company] Admin user created:', adminUserResult);
        } else {
          const errorText = await adminResponse.text();
          console.error('[approve-company] Admin creation error:', errorText);
        }
      } catch (adminError) {
        console.error('[approve-company] Admin creation exception:', adminError);
      }
    }

    // ========================================
    // SEND APPROVAL EMAIL WITH CREDENTIALS
    // TEMPLATE: CADASTRO APROVADO
    // ========================================
    if (resendApiKey && adminEmail && temporaryPassword) {
      try {
        const subdomainUrl = `https://${subdomain}.miauchat.com.br`;
        
        const approvalHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cadastro aprovado — Acesso liberado ao MIAUCHAT</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">✅ Cadastro aprovado — Acesso liberado ao MIAUCHAT</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Olá,
      </p>
      
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        O cadastro da empresa <strong>"${company.name}"</strong> foi <strong>APROVADO</strong> no MIAUCHAT<br>
        (Multiplataforma de Inteligência Artificial Unificada).
      </p>
      
      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <h3 style="color: #166534; margin: 0 0 16px 0; font-size: 16px;">📌 Dados de acesso:</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #166534; font-weight: 500;">Acesso (subdomínio):</td>
          </tr>
          <tr>
            <td style="padding: 4px 0 12px 0;">
              <a href="${subdomainUrl}" style="color: #dc2626; font-weight: 600; text-decoration: none;">${subdomainUrl}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #166534; font-weight: 500;">Login:</td>
          </tr>
          <tr>
            <td style="padding: 4px 0 12px 0; color: #1f2937;">${adminEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #166534; font-weight: 500;">Senha provisória:</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #1f2937; font-family: monospace; font-size: 18px; background: #ffffff; padding: 8px; border-radius: 4px; display: inline-block;">${temporaryPassword}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #92400e; margin: 0; font-weight: 600;">
          ⚠️ Importante:<br>
          <span style="font-weight: normal;">No primeiro acesso, será obrigatório criar uma nova senha.</span>
        </p>
      </div>
      
      <div style="margin-top: 30px; text-align: center;">
        <a href="${subdomainUrl}" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Acessar Minha Conta
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

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MiauChat <suporte@miauchat.com.br>',
            to: [adminEmail],
            subject: `✅ Cadastro aprovado — Acesso liberado ao MIAUCHAT`,
            html: approvalHtml,
          }),
        });
        console.log('[approve-company] Approval email sent with credentials');
      } catch (emailError) {
        console.error('[approve-company] Approval email error:', emailError);
      }
    }

    // ========================================
    // FINAL STATUS UPDATE
    // ========================================
    const clientAppStatus = 'created';
    const finalN8nStatus = n8nStatus;
    let provisioningStatus = 'active';
    
    if (clientAppStatus === 'created' && finalN8nStatus === 'created') {
      provisioningStatus = 'active';
    } else if (clientAppStatus === 'created' || finalN8nStatus === 'created') {
      provisioningStatus = 'partial';
    } else {
      provisioningStatus = 'error';
    }

    await supabase
      .from('companies')
      .update({
        client_app_status: clientAppStatus,
        n8n_workflow_status: finalN8nStatus,
        provisioning_status: provisioningStatus,
      })
      .eq('id', company_id);

    // Final audit log
    await supabase.from('audit_logs').insert({
      admin_user_id: user.id,
      action: 'COMPANY_PROVISIONING_COMPLETE',
      entity_type: 'company',
      entity_id: company_id,
      new_values: {
        client_app_status: clientAppStatus,
        n8n_workflow_status: finalN8nStatus,
        provisioning_status: provisioningStatus,
        admin_user_created: !!adminUserResult,
        n8n_workflow_id: n8nResult?.workflow_id,
        template_cloned: !!templateCloneResult,
        template_version: templateCloneResult?.template_version,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[approve-company] Provisioning complete: ${provisioningStatus}`);

    return new Response(
      JSON.stringify({
        success: true,
        action: 'approved',
        company_id,
        subdomain,
        provisioning_status: provisioningStatus,
        client_app_status: clientAppStatus,
        n8n_workflow_status: finalN8nStatus,
        admin_user_created: !!adminUserResult,
        n8n_workflow_id: n8nResult?.workflow_id,
        message: provisioningStatus === 'active' 
          ? 'Empresa aprovada e provisionada com sucesso!' 
          : 'Empresa aprovada. Provisionamento parcial - verifique logs.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[approve-company] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
