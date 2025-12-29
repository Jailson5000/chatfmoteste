import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProvisionRequest {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  plan_id?: string;
  max_users?: number;
  max_instances?: number;
  subdomain: string;
}

function generateSubdomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 30); // Limit length
}

// Log audit event with full context
async function logAudit(
  supabase: any,
  action: string,
  entityType: string,
  entityId: string | null,
  status: 'success' | 'failed',
  metadata: Record<string, any>,
  adminUserId: string
) {
  try {
    await supabase.from('audit_logs').insert({
      admin_user_id: adminUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      new_values: {
        status,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
    console.log(`Audit: ${action} on ${entityType} - ${status}`);
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let adminUserId = '';
  let lawFirmId: string | null = null;
  let companyId: string | null = null;

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
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
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    adminUserId = user.id;

    // Check if user is admin
    const { data: adminRole } = await supabase
      .from('admin_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminRole) {
      console.error('User is not an admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Admin authenticated:', user.id, 'Role:', adminRole.role);

    // Parse request body
    const body: ProvisionRequest = await req.json();
    const { name, document, email, phone, plan_id, max_users = 5, max_instances = 2 } = body;

    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Company name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate subdomain from company name
    let subdomain = body.subdomain || generateSubdomain(name);
    
    // Check if subdomain is available
    const { data: existingSubdomain } = await supabase
      .from('law_firms')
      .select('id')
      .eq('subdomain', subdomain)
      .single();

    if (existingSubdomain) {
      // Append random suffix if subdomain exists
      subdomain = `${subdomain}-${Math.random().toString(36).substring(2, 6)}`;
    }

    console.log('Creating company with subdomain:', subdomain);

    // Log provisioning start
    await logAudit(supabase, 'COMPANY_PROVISION_START', 'company', null, 'success', {
      company_name: name,
      subdomain,
      plan_id,
    }, adminUserId);

    // Step 1: Create law_firm with subdomain
    const { data: lawFirm, error: lawFirmError } = await supabase
      .from('law_firms')
      .insert({
        name,
        email,
        phone,
        document,
        subdomain,
      })
      .select()
      .single();

    if (lawFirmError) {
      console.error('Error creating law firm:', lawFirmError);
      
      await logAudit(supabase, 'COMPANY_PROVISION_FAIL', 'law_firm', null, 'failed', {
        error: lawFirmError.message,
        step: 'create_law_firm',
      }, adminUserId);

      return new Response(
        JSON.stringify({ error: 'Failed to create law firm', details: lawFirmError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    lawFirmId = lawFirm.id;
    console.log('Law firm created:', lawFirm.id);

    await logAudit(supabase, 'LAW_FIRM_CREATE', 'law_firm', lawFirm.id, 'success', {
      name,
      subdomain,
    }, adminUserId);

    // Step 2: Create company linked to law_firm
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name,
        document,
        email,
        phone,
        plan_id: plan_id || null,
        max_users,
        max_instances,
        law_firm_id: lawFirm.id,
        status: 'active',
        n8n_workflow_status: 'pending', // Start as pending
      })
      .select()
      .single();

    if (companyError) {
      console.error('Error creating company:', companyError);
      
      await logAudit(supabase, 'COMPANY_PROVISION_FAIL', 'company', null, 'failed', {
        error: companyError.message,
        step: 'create_company',
        law_firm_id: lawFirm.id,
      }, adminUserId);

      // Rollback: delete the law firm
      await supabase.from('law_firms').delete().eq('id', lawFirm.id);
      
      return new Response(
        JSON.stringify({ error: 'Failed to create company', details: companyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    companyId = company.id;
    console.log('Company created:', company.id);

    await logAudit(supabase, 'COMPANY_CREATE', 'company', company.id, 'success', {
      name,
      law_firm_id: lawFirm.id,
      subdomain,
      plan_id,
    }, adminUserId);

    // Step 3: Create default automation for the company
    let automationId: string | null = null;
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .insert({
        law_firm_id: lawFirm.id,
        name: 'Atendente IA Principal',
        trigger_type: 'message_received',
        webhook_url: n8nWebhookUrl || 'https://n8n.miauchat.com.br/webhook/atendimento',
        is_active: true,
        ai_prompt: `Você é um assistente virtual da empresa ${name}. Seja cordial e profissional.`,
        ai_temperature: 0.7,
        trigger_config: { enabled: true },
      })
      .select()
      .single();

    if (automationError) {
      console.error('Error creating automation:', automationError);
      await logAudit(supabase, 'AUTOMATION_CREATE', 'automation', null, 'failed', {
        error: automationError.message,
        company_id: company.id,
      }, adminUserId);
      // Continue without automation - not critical
    } else {
      automationId = automation?.id || null;
      console.log('Automation created:', automation?.id);
      await logAudit(supabase, 'AUTOMATION_CREATE', 'automation', automation?.id, 'success', {
        company_id: company.id,
        law_firm_id: lawFirm.id,
      }, adminUserId);
    }

    // Step 4: Create n8n workflow for the company (async, non-blocking)
    let n8nWorkflowResult = null;
    try {
      console.log('Creating n8n workflow for company...');
      
      await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_START', 'n8n_workflow', company.id, 'success', {
        company_name: name,
        subdomain,
      }, adminUserId);

      const n8nResponse = await fetch(`${supabaseUrl}/functions/v1/create-n8n-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          company_id: company.id,
          company_name: name,
          law_firm_id: lawFirm.id,
          subdomain: subdomain,
        }),
      });

      if (n8nResponse.ok) {
        n8nWorkflowResult = await n8nResponse.json();
        console.log('N8N workflow created:', n8nWorkflowResult);
        
        await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_COMPLETE', 'n8n_workflow', company.id, 'success', {
          workflow_id: n8nWorkflowResult?.workflow_id,
          workflow_name: n8nWorkflowResult?.workflow_name,
        }, adminUserId);
      } else {
        const errorText = await n8nResponse.text();
        console.warn('Failed to create n8n workflow:', errorText);
        
        await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_FAIL', 'n8n_workflow', company.id, 'failed', {
          error: errorText,
          status_code: n8nResponse.status,
        }, adminUserId);

        // Update company with failed status (for retry later)
        await supabase
          .from('companies')
          .update({
            n8n_workflow_status: 'failed',
            n8n_last_error: errorText.substring(0, 500),
            n8n_updated_at: new Date().toISOString(),
          })
          .eq('id', company.id);
      }
    } catch (n8nError) {
      console.warn('Error creating n8n workflow:', n8nError);
      
      const errorMessage = n8nError instanceof Error ? n8nError.message : 'Unknown error';
      
      await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_FAIL', 'n8n_workflow', company.id, 'failed', {
        error: errorMessage,
        critical: false,
      }, adminUserId);

      // Update company with failed status
      await supabase
        .from('companies')
        .update({
          n8n_workflow_status: 'failed',
          n8n_last_error: errorMessage.substring(0, 500),
          n8n_updated_at: new Date().toISOString(),
        })
        .eq('id', company.id);

      // Continue - n8n workflow creation is not critical for provisioning
    }

    // Final success log
    await logAudit(supabase, 'COMPANY_PROVISION_COMPLETE', 'company', company.id, 'success', {
      company_id: company.id,
      law_firm_id: lawFirm.id,
      subdomain,
      automation_id: automationId,
      n8n_workflow_id: n8nWorkflowResult?.workflow_id || null,
      n8n_workflow_status: n8nWorkflowResult ? 'created' : 'failed',
    }, adminUserId);

    console.log('Company provisioning completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        company: company,
        law_firm: lawFirm,
        subdomain: subdomain,
        subdomain_url: `https://${subdomain}.miauchat.com.br`,
        automation_id: automationId,
        n8n_workflow_id: n8nWorkflowResult?.workflow_id,
        n8n_workflow_name: n8nWorkflowResult?.workflow_name,
        n8n_workflow_status: n8nWorkflowResult ? 'created' : 'failed',
        message: 'Company provisioned successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in provision-company:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log critical failure
    await logAudit(supabase, 'COMPANY_PROVISION_CRITICAL_FAIL', 'company', companyId, 'failed', {
      error: errorMessage,
      law_firm_id: lawFirmId,
    }, adminUserId);

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
