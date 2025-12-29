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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      return new Response(
        JSON.stringify({ error: 'Failed to create law firm', details: lawFirmError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Law firm created:', lawFirm.id);

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
      })
      .select()
      .single();

    if (companyError) {
      console.error('Error creating company:', companyError);
      // Rollback: delete the law firm
      await supabase.from('law_firms').delete().eq('id', lawFirm.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create company', details: companyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Company created:', company.id);

    // Step 3: Create default automation for the company
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
      // Continue without automation - not critical
    } else {
      console.log('Automation created:', automation?.id);
    }

    // Step 5: Create n8n workflow for the company
    let n8nWorkflowResult = null;
    try {
      console.log('Creating n8n workflow for company...');
      
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
      } else {
        const errorText = await n8nResponse.text();
        console.warn('Failed to create n8n workflow:', errorText);
      }
    } catch (n8nError) {
      console.warn('Error creating n8n workflow:', n8nError);
      // Continue - n8n workflow creation is not critical for provisioning
    }

    // Step 6: Log the audit
    await supabase.from('audit_logs').insert({
      admin_user_id: user.id,
      action: 'create',
      entity_type: 'company',
      entity_id: company.id,
      new_values: {
        company_id: company.id,
        law_firm_id: lawFirm.id,
        name,
        subdomain,
        plan_id,
        n8n_workflow_id: n8nWorkflowResult?.workflow_id,
      },
    });

    console.log('Company provisioning completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        company: company,
        law_firm: lawFirm,
        subdomain: subdomain,
        subdomain_url: `https://${subdomain}.miauchat.com.br`,
        automation_id: automation?.id,
        n8n_workflow_id: n8nWorkflowResult?.workflow_id,
        n8n_workflow_name: n8nWorkflowResult?.workflow_name,
        message: 'Company provisioned successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in provision-company:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
