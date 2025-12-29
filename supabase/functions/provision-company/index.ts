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
  auto_activate_workflow?: boolean;
  // Admin user creation
  admin_name?: string;
  admin_email?: string;
}

// Provisioning status enum
type ProvisioningStatus = 'pending' | 'partial' | 'active' | 'error';
type ComponentStatus = 'pending' | 'creating' | 'created' | 'error';

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

// Calculate overall provisioning status based on component statuses
function calculateProvisioningStatus(
  clientAppStatus: ComponentStatus, 
  n8nStatus: ComponentStatus
): ProvisioningStatus {
  if (clientAppStatus === 'created' && n8nStatus === 'created') {
    return 'active';
  }
  if (clientAppStatus === 'error' && n8nStatus === 'error') {
    return 'error';
  }
  if (clientAppStatus === 'created' || n8nStatus === 'created') {
    return 'partial';
  }
  if (clientAppStatus === 'error' || n8nStatus === 'error') {
    return 'partial';
  }
  return 'pending';
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

// Update company provisioning status
async function updateCompanyStatus(
  supabase: any,
  companyId: string,
  clientAppStatus: ComponentStatus,
  n8nStatus: ComponentStatus,
  errorMessage?: string
) {
  const provisioningStatus = calculateProvisioningStatus(clientAppStatus, n8nStatus);
  
  const updateData: Record<string, any> = {
    client_app_status: clientAppStatus,
    n8n_workflow_status: n8nStatus,
    provisioning_status: provisioningStatus,
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.n8n_last_error = errorMessage.substring(0, 500);
  }

  await supabase.from('companies').update(updateData).eq('id', companyId);
  
  return provisioningStatus;
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
    const { name, document, email, phone, plan_id, max_users = 5, max_instances = 2, auto_activate_workflow = true, admin_name, admin_email } = body;

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

    console.log('=== ATOMIC PROVISIONING STARTED ===');
    console.log('Company:', name, '| Subdomain:', subdomain);

    // Log provisioning start
    await logAudit(supabase, 'COMPANY_PROVISION_START', 'company', null, 'success', {
      company_name: name,
      subdomain,
      plan_id,
      atomic_flow: true,
    }, adminUserId);

    // ========================================
    // STEP 1: PROVISION CLIENT APP (law_firm + company)
    // ========================================
    console.log('=== STEP 1: Provisioning Client App ===');
    
    let clientAppStatus: ComponentStatus = 'creating';
    let n8nStatus: ComponentStatus = 'pending';

    // Step 1.1: Create law_firm with subdomain (tenant)
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
      clientAppStatus = 'error';
      
      await logAudit(supabase, 'CLIENT_APP_PROVISION_FAIL', 'law_firm', null, 'failed', {
        error: lawFirmError.message,
        step: 'create_law_firm',
      }, adminUserId);

      return new Response(
        JSON.stringify({ 
          error: 'Failed to create law firm', 
          details: lawFirmError.message,
          client_app_status: 'error',
          n8n_workflow_status: 'pending',
          provisioning_status: 'error',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    lawFirmId = lawFirm.id;
    console.log('Law firm created:', lawFirm.id, '| Subdomain:', subdomain);

    await logAudit(supabase, 'LAW_FIRM_CREATE', 'law_firm', lawFirm.id, 'success', {
      name,
      subdomain,
      tenant_id: lawFirm.id,
    }, adminUserId);

    // Step 1.2: Create company linked to law_firm
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
        // Provisioning status tracking
        client_app_status: 'creating',
        n8n_workflow_status: 'pending',
        provisioning_status: 'pending',
      })
      .select()
      .single();

    if (companyError) {
      console.error('Error creating company:', companyError);
      clientAppStatus = 'error';
      
      await logAudit(supabase, 'CLIENT_APP_PROVISION_FAIL', 'company', null, 'failed', {
        error: companyError.message,
        step: 'create_company',
        law_firm_id: lawFirm.id,
      }, adminUserId);

      // Rollback: delete the law firm
      await supabase.from('law_firms').delete().eq('id', lawFirm.id);
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create company', 
          details: companyError.message,
          client_app_status: 'error',
          n8n_workflow_status: 'pending',
          provisioning_status: 'error',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    companyId = company.id;
    console.log('Company created:', company.id);

    // Step 1.3: Create default automation for the company
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
      // Continue without automation - not critical for Client App
    } else {
      automationId = automation?.id || null;
      console.log('Automation created:', automation?.id);
      await logAudit(supabase, 'AUTOMATION_CREATE', 'automation', automation?.id, 'success', {
        company_id: company.id,
        law_firm_id: lawFirm.id,
      }, adminUserId);
    }

    // Client App provisioned successfully
    clientAppStatus = 'created';
    
    // Update company status - Client App done, n8n pending
    await updateCompanyStatus(supabase, company.id, clientAppStatus, n8nStatus);

    await logAudit(supabase, 'CLIENT_APP_PROVISION_COMPLETE', 'company', company.id, 'success', {
      company_id: company.id,
      law_firm_id: lawFirm.id,
      subdomain,
      tenant_id: lawFirm.id,
    }, adminUserId);

    console.log('=== CLIENT APP PROVISIONED ===');

    // ========================================
    // STEP 2: PROVISION N8N WORKFLOW
    // ========================================
    console.log('=== STEP 2: Provisioning n8n Workflow ===');
    
    n8nStatus = 'creating';
    await updateCompanyStatus(supabase, company.id, clientAppStatus, n8nStatus);

    let n8nWorkflowResult = null;
    
    try {
      await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_START', 'n8n_workflow', company.id, 'success', {
        company_name: name,
        subdomain,
        tenant_id: lawFirm.id,
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
          auto_activate: auto_activate_workflow,
        }),
      });

      if (n8nResponse.ok) {
        n8nWorkflowResult = await n8nResponse.json();
        n8nStatus = 'created';
        
        console.log('N8N workflow created:', n8nWorkflowResult);
        
        await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_COMPLETE', 'n8n_workflow', company.id, 'success', {
          workflow_id: n8nWorkflowResult?.workflow_id,
          workflow_name: n8nWorkflowResult?.workflow_name,
          active: n8nWorkflowResult?.active,
        }, adminUserId);
      } else {
        const errorText = await n8nResponse.text();
        n8nStatus = 'error';
        
        console.warn('Failed to create n8n workflow:', errorText);
        
        await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_FAIL', 'n8n_workflow', company.id, 'failed', {
          error: errorText,
          status_code: n8nResponse.status,
        }, adminUserId);

        await updateCompanyStatus(supabase, company.id, clientAppStatus, n8nStatus, errorText);
      }
    } catch (n8nError) {
      n8nStatus = 'error';
      const errorMessage = n8nError instanceof Error ? n8nError.message : 'Unknown error';
      
      console.warn('Error creating n8n workflow:', n8nError);
      
      await logAudit(supabase, 'N8N_WORKFLOW_PROVISION_FAIL', 'n8n_workflow', company.id, 'failed', {
        error: errorMessage,
      }, adminUserId);

      await updateCompanyStatus(supabase, company.id, clientAppStatus, n8nStatus, errorMessage);
    }

    // Final status update
    const finalStatus = calculateProvisioningStatus(clientAppStatus, n8nStatus);
    
    if (n8nStatus === 'created') {
      await updateCompanyStatus(supabase, company.id, clientAppStatus, n8nStatus);
    }

    // Final success log
    await logAudit(supabase, 'COMPANY_PROVISION_COMPLETE', 'company', company.id, 'success', {
      company_id: company.id,
      law_firm_id: lawFirm.id,
      tenant_id: lawFirm.id,
      subdomain,
      automation_id: automationId,
      client_app_status: clientAppStatus,
      n8n_workflow_status: n8nStatus,
      provisioning_status: finalStatus,
      n8n_workflow_id: n8nWorkflowResult?.workflow_id || null,
    }, adminUserId);

    console.log('=== ATOMIC PROVISIONING COMPLETED ===');
    console.log(`Client App: ${clientAppStatus} | n8n: ${n8nStatus} | Overall: ${finalStatus}`);

    // ========================================
    // STEP 3: SEND NOTIFICATION EMAIL
    // ========================================
    try {
      let notificationType: string;
      let notificationPayload: Record<string, any> = {
        tenant_id: company.id,
        company_name: name,
        subdomain: subdomain,
      };

      if (finalStatus === 'active') {
        notificationType = 'COMPANY_PROVISIONING_SUCCESS';
      } else if (finalStatus === 'partial') {
        notificationType = 'COMPANY_PROVISIONING_PARTIAL';
        notificationPayload.failed_step = 'Workflow n8n';
        notificationPayload.error_message = 'Workflow n8n não foi criado - retry automático agendado';
      } else {
        notificationType = 'COMPANY_PROVISIONING_FAILED';
        notificationPayload.failed_step = 'Provisionamento';
        notificationPayload.error_message = 'Falha ao provisionar empresa';
      }

      console.log(`Sending ${notificationType} notification...`);
      
      const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-admin-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          type: notificationType,
          ...notificationPayload,
        }),
      });

      if (notificationResponse.ok) {
        console.log('Notification sent successfully');
      } else {
        console.warn('Failed to send notification:', await notificationResponse.text());
      }
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
      // Don't fail the provisioning because of notification error
    }

    // ========================================
    // STEP 4: CREATE ADMIN USER (if admin_email provided)
    // ========================================
    let adminUserResult = null;
    if (admin_email) {
      console.log('=== STEP 4: Creating Admin User ===');
      try {
        const createAdminResponse = await fetch(`${supabaseUrl}/functions/v1/create-company-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            company_id: company.id,
            company_name: name,
            law_firm_id: lawFirm.id,
            admin_email: admin_email,
            admin_name: admin_name || name,
            subdomain: subdomain,
          }),
        });

        if (createAdminResponse.ok) {
          adminUserResult = await createAdminResponse.json();
          console.log('Admin user created successfully:', adminUserResult.user_id);
          
          await logAudit(supabase, 'ADMIN_USER_CREATED', 'user', adminUserResult.user_id, 'success', {
            company_id: company.id,
            email: admin_email,
            email_sent: adminUserResult.email_sent,
          }, adminUserId);
        } else {
          const errorText = await createAdminResponse.text();
          console.warn('Failed to create admin user:', errorText);
          
          await logAudit(supabase, 'ADMIN_USER_CREATE_FAIL', 'user', null, 'failed', {
            company_id: company.id,
            email: admin_email,
            error: errorText,
          }, adminUserId);
        }
      } catch (adminError) {
        console.error('Error creating admin user:', adminError);
        await logAudit(supabase, 'ADMIN_USER_CREATE_FAIL', 'user', null, 'failed', {
          company_id: company.id,
          email: admin_email,
          error: adminError instanceof Error ? adminError.message : 'Unknown error',
        }, adminUserId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        company: company,
        law_firm: lawFirm,
        tenant_id: lawFirm.id,
        subdomain: subdomain,
        subdomain_url: `https://${subdomain}.miauchat.com.br`,
        automation_id: automationId,
        // Provisioning status
        client_app_status: clientAppStatus,
        n8n_workflow_status: n8nStatus,
        provisioning_status: finalStatus,
        // n8n details
        n8n_workflow_id: n8nWorkflowResult?.workflow_id,
        n8n_workflow_name: n8nWorkflowResult?.workflow_name,
        // Admin user details
        admin_user_id: adminUserResult?.user_id || null,
        admin_email_sent: adminUserResult?.email_sent || false,
        message: finalStatus === 'active' 
          ? 'Company fully provisioned' 
          : `Company provisioned with status: ${finalStatus}`,
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
        client_app_status: 'error',
        n8n_workflow_status: 'error',
        provisioning_status: 'error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
