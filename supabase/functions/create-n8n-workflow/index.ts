import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateWorkflowRequest {
  company_id: string;
  company_name: string;
  law_firm_id: string;
  subdomain: string;
  tenant_id?: string;
  auto_activate?: boolean; // If true, activates workflow after creation
}

// Sanitize company name for workflow naming
function sanitizeCompanyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .trim()
    .substring(0, 50); // Limit length
}

// Generate workflow name following the pattern: MiauChat | {company_name} | {tenant_id}
function generateWorkflowName(companyName: string, companyId: string): string {
  const sanitizedName = sanitizeCompanyName(companyName);
  const shortId = `tnt_${companyId.substring(0, 8)}`;
  const fullName = `MiauChat | ${sanitizedName} | ${shortId}`;
  
  // Ensure max length of 100 chars
  if (fullName.length > 100) {
    const maxNameLen = 100 - 15 - shortId.length; // 15 = "MiauChat | " + " | "
    return `MiauChat | ${sanitizedName.substring(0, maxNameLen)} | ${shortId}`;
  }
  
  return fullName;
}

// Log audit event
async function logAudit(
  supabase: any,
  action: string,
  entityId: string,
  status: 'success' | 'failed',
  metadata: Record<string, any>,
  adminUserId?: string
) {
  try {
    await supabase.from('audit_logs').insert({
      admin_user_id: adminUserId || null,
      action,
      entity_type: 'n8n_workflow',
      entity_id: entityId,
      new_values: {
        status,
        ...metadata,
      },
    });
    console.log(`Audit logged: ${action} - ${status}`);
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
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let companyId = '';
  let adminUserId: string | undefined;

  try {
    const n8nApiUrl = Deno.env.get('N8N_API_URL');
    const n8nApiKey = Deno.env.get('N8N_API_KEY');
    const n8nTemplateWorkflowId = Deno.env.get('N8N_TEMPLATE_WORKFLOW_ID');

    if (!n8nApiUrl || !n8nApiKey) {
      console.error('N8N API configuration missing');
      return new Response(
        JSON.stringify({ error: 'N8N API not configured', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    
    // Verify admin if auth header provided
    if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );

      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Unauthorized', success: false }),
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
          JSON.stringify({ error: 'Forbidden: Admin access required', success: false }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse request body
    const body: CreateWorkflowRequest = await req.json();
    const { company_id, company_name, law_firm_id, subdomain, auto_activate = true } = body;
    companyId = company_id;

    if (!company_id || !company_name) {
      return new Response(
        JSON.stringify({ error: 'company_id and company_name are required', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating n8n workflow for company: ${company_name} (${company_id})`);

    // Check if workflow already exists (idempotency)
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('n8n_workflow_id, n8n_workflow_status')
      .eq('id', company_id)
      .single();

    if (existingCompany?.n8n_workflow_id && existingCompany.n8n_workflow_status === 'created') {
      console.log('Workflow already exists for this company');
      
      await logAudit(supabase, 'N8N_WORKFLOW_CREATE', company_id, 'success', {
        message: 'Workflow already exists',
        workflow_id: existingCompany.n8n_workflow_id,
        idempotent: true,
      }, adminUserId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Workflow already exists',
          workflow_id: existingCompany.n8n_workflow_id,
          already_exists: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to pending
    await supabase
      .from('companies')
      .update({ 
        n8n_workflow_status: 'pending',
        n8n_updated_at: new Date().toISOString(),
      })
      .eq('id', company_id);

    // Generate workflow name following the standard pattern
    const workflowName = generateWorkflowName(company_name, company_id);
    let workflowData;
    let workflowId: string;

    try {
      // Strategy 1: Clone from template if template ID is provided
      if (n8nTemplateWorkflowId) {
        console.log(`Cloning from template workflow: ${n8nTemplateWorkflowId}`);
        
        // Log the fetch attempt
        await logAudit(supabase, 'N8N_TEMPLATE_FETCH', company_id, 'success', {
          template_id: n8nTemplateWorkflowId,
          endpoint: `${n8nApiUrl}/api/v1/workflows/${n8nTemplateWorkflowId}`,
        }, adminUserId);

        // Get template workflow
        const templateResponse = await fetch(`${n8nApiUrl}/api/v1/workflows/${n8nTemplateWorkflowId}`, {
          method: 'GET',
          headers: {
            'X-N8N-API-KEY': n8nApiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!templateResponse.ok) {
          const errorText = await templateResponse.text();
          throw new Error(`Failed to fetch template workflow: ${templateResponse.status} - ${errorText}`);
        }

        const templateWorkflow = await templateResponse.json();
        console.log('Template workflow fetched successfully');

        // Create new workflow based on template - starts INACTIVE
        // Note: n8n API does not accept tags on workflow creation (read-only field)
        const newWorkflowPayload = {
          name: workflowName,
          nodes: templateWorkflow.nodes,
          connections: templateWorkflow.connections,
          settings: templateWorkflow.settings,
          staticData: templateWorkflow.staticData || null,
        };

        const createResponse = await fetch(`${n8nApiUrl}/api/v1/workflows`, {
          method: 'POST',
          headers: {
            'X-N8N-API-KEY': n8nApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newWorkflowPayload),
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create workflow: ${createResponse.status} - ${errorText}`);
        }

        workflowData = await createResponse.json();
        workflowId = workflowData.id;
        console.log(`Workflow created from template: ${workflowId}`);

        await logAudit(supabase, 'N8N_WORKFLOW_CREATE', company_id, 'success', {
          workflow_id: workflowId,
          workflow_name: workflowName,
          from_template: n8nTemplateWorkflowId,
          active: false,
        }, adminUserId);

      } else {
        // Strategy 2: Create empty workflow with basic structure
        console.log('Creating new empty workflow (no template)');
        
        const newWorkflowPayload = {
          name: workflowName,
          nodes: [
            {
              parameters: {},
              id: crypto.randomUUID(),
              name: 'Start',
              type: 'n8n-nodes-base.start',
              typeVersion: 1,
              position: [250, 300],
            },
            {
              parameters: {
                httpMethod: 'POST',
                path: subdomain || company_id,
                options: {},
              },
              id: crypto.randomUUID(),
              name: 'Webhook',
              type: 'n8n-nodes-base.webhook',
              typeVersion: 1.1,
              position: [450, 300],
              webhookId: crypto.randomUUID(),
            },
          ],
          connections: {},
          settings: {
            saveDataSuccessExecution: 'all',
            saveDataErrorExecution: 'all',
            saveManualExecutions: true,
            callerPolicy: 'workflowsFromSameOwner',
          },
          staticData: null,
        };

        const createResponse = await fetch(`${n8nApiUrl}/api/v1/workflows`, {
          method: 'POST',
          headers: {
            'X-N8N-API-KEY': n8nApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newWorkflowPayload),
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create workflow: ${createResponse.status} - ${errorText}`);
        }

        workflowData = await createResponse.json();
        workflowId = workflowData.id;
        console.log(`Empty workflow created: ${workflowId}`);

        await logAudit(supabase, 'N8N_WORKFLOW_CREATE', company_id, 'success', {
          workflow_id: workflowId,
          workflow_name: workflowName,
          from_template: false,
          active: false,
        }, adminUserId);
      }

      // Auto-activate workflow if requested (default: true)
      let isActive = false;
      if (auto_activate) {
        try {
          console.log('Auto-activating workflow...');
          const activateResponse = await fetch(`${n8nApiUrl}/api/v1/workflows/${workflowId}/activate`, {
            method: 'POST',
            headers: {
              'X-N8N-API-KEY': n8nApiKey,
              'Content-Type': 'application/json',
            },
          });

          if (activateResponse.ok) {
            isActive = true;
            console.log('Workflow activated successfully');
            
            await logAudit(supabase, 'N8N_WORKFLOW_ACTIVATE', company_id, 'success', {
              workflow_id: workflowId,
              workflow_name: workflowName,
            }, adminUserId);
          } else {
            const errorText = await activateResponse.text();
            console.warn('Failed to activate workflow:', errorText);
            
            await logAudit(supabase, 'N8N_WORKFLOW_ACTIVATE', company_id, 'failed', {
              workflow_id: workflowId,
              error: errorText,
            }, adminUserId);
          }
        } catch (activateError) {
          console.warn('Error activating workflow:', activateError);
          await logAudit(supabase, 'N8N_WORKFLOW_ACTIVATE', company_id, 'failed', {
            workflow_id: workflowId,
            error: activateError instanceof Error ? activateError.message : 'Unknown error',
          }, adminUserId);
        }
      } else {
        console.log('Workflow created as INACTIVE (auto_activate=false)');
      }

      // Update company with workflow info
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          n8n_workflow_id: workflowId,
          n8n_workflow_name: workflowName,
          n8n_workflow_status: 'created',
          n8n_last_error: null,
          n8n_created_at: new Date().toISOString(),
          n8n_updated_at: new Date().toISOString(),
        })
        .eq('id', company_id);

      if (updateError) {
        console.error('Error updating company with workflow info:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      await logAudit(supabase, 'N8N_WORKFLOW_LINK', company_id, 'success', {
        workflow_id: workflowId,
        workflow_name: workflowName,
        company_id,
        law_firm_id,
      }, adminUserId);

      // Also update the automation webhook URL if law_firm_id is provided
      if (law_firm_id && workflowData.nodes) {
        const webhookNode = workflowData.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
        if (webhookNode) {
          // Construct webhook URL using subdomain pattern
          const webhookUrl = `${n8nApiUrl}/webhook/${subdomain || company_id}`;
          
          await supabase
            .from('automations')
            .update({ webhook_url: webhookUrl })
            .eq('law_firm_id', law_firm_id);
          
          console.log(`Updated automation webhook URL: ${webhookUrl}`);
        }
      }

      console.log(`Workflow creation completed for company ${company_id}`);

      return new Response(
        JSON.stringify({
          success: true,
          workflow_id: workflowId,
          workflow_name: workflowName,
          active: isActive,
          message: isActive ? 'Workflow created and activated successfully' : 'Workflow created successfully (inactive)',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (n8nError) {
      console.error('Error creating n8n workflow:', n8nError);
      
      const errorMessage = n8nError instanceof Error ? n8nError.message : 'Unknown error';

      // Log the failure
      await logAudit(supabase, 'N8N_WORKFLOW_CREATE', company_id, 'failed', {
        error: errorMessage,
        company_name,
        subdomain,
      }, adminUserId);

      // Update company with error status
      await supabase
        .from('companies')
        .update({
          n8n_workflow_status: 'failed',
          n8n_last_error: errorMessage,
          n8n_updated_at: new Date().toISOString(),
        })
        .eq('id', company_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in create-n8n-workflow:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log critical failure
    if (companyId) {
      await logAudit(supabase, 'N8N_WORKFLOW_CREATE', companyId, 'failed', {
        error: errorMessage,
        critical: true,
      }, adminUserId);
    }

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
