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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
    
    // Create Supabase client with service role for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { company_id, company_name, law_firm_id, subdomain } = body;

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
      .update({ n8n_workflow_status: 'pending' })
      .eq('id', company_id);

    let workflowData;
    let workflowId: string;
    let workflowName = `MiauChat - ${company_name}`;

    try {
      // Strategy 1: Clone from template if template ID is provided
      if (n8nTemplateWorkflowId) {
        console.log(`Cloning from template workflow: ${n8nTemplateWorkflowId}`);
        
        // Get template workflow
        const templateResponse = await fetch(`${n8nApiUrl}/api/v1/workflows/${n8nTemplateWorkflowId}`, {
          method: 'GET',
          headers: {
            'X-N8N-API-KEY': n8nApiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!templateResponse.ok) {
          throw new Error(`Failed to fetch template workflow: ${templateResponse.status}`);
        }

        const templateWorkflow = await templateResponse.json();
        console.log('Template workflow fetched successfully');

        // Create new workflow based on template
        const newWorkflowPayload = {
          name: workflowName,
          nodes: templateWorkflow.nodes,
          connections: templateWorkflow.connections,
          settings: templateWorkflow.settings,
          staticData: templateWorkflow.staticData || null,
          // Add company metadata as tags/variables
          tags: [
            { name: `company:${company_id}` },
            { name: `subdomain:${subdomain}` },
          ],
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
      }

      // Activate the workflow
      try {
        const activateResponse = await fetch(`${n8nApiUrl}/api/v1/workflows/${workflowId}/activate`, {
          method: 'POST',
          headers: {
            'X-N8N-API-KEY': n8nApiKey,
            'Content-Type': 'application/json',
          },
        });

        if (activateResponse.ok) {
          console.log('Workflow activated successfully');
        } else {
          console.warn('Failed to activate workflow, but continuing...');
        }
      } catch (activateError) {
        console.warn('Error activating workflow:', activateError);
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
        })
        .eq('id', company_id);

      if (updateError) {
        console.error('Error updating company with workflow info:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      // Also update the automation webhook URL if law_firm_id is provided
      if (law_firm_id && workflowData.nodes) {
        const webhookNode = workflowData.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
        if (webhookNode && webhookNode.webhookId) {
          const webhookUrl = `${n8nApiUrl}/webhook/${webhookNode.webhookId}`;
          
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
          message: 'Workflow created successfully',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (n8nError) {
      console.error('Error creating n8n workflow:', n8nError);

      // Update company with error status
      await supabase
        .from('companies')
        .update({
          n8n_workflow_status: 'failed',
          n8n_last_error: n8nError instanceof Error ? n8nError.message : 'Unknown error',
        })
        .eq('id', company_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: n8nError instanceof Error ? n8nError.message : 'Failed to create workflow',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in create-n8n-workflow:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
