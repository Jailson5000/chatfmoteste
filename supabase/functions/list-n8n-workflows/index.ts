import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ListWorkflowsRequest {
  api_url?: string;
  api_key?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', success: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: adminRole } = await supabase
        .from('admin_user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!adminRole) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Admin access required', success: false }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const body: ListWorkflowsRequest = await req.json().catch(() => ({}));
    let { api_url, api_key } = body;

    // Use environment variables as fallback
    if (!api_url) {
      api_url = Deno.env.get('N8N_API_URL') || '';
    }
    if (!api_key) {
      api_key = Deno.env.get('N8N_API_KEY') || '';
    }

    if (!api_url || !api_key) {
      return new Response(
        JSON.stringify({ error: 'API URL and API Key are required', success: false, workflows: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching workflows from: ${api_url}`);

    // Fetch all workflows
    const response = await fetch(`${api_url}/api/v1/workflows?limit=100`, {
      method: 'GET',
      headers: {
        'X-N8N-API-KEY': api_key,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch workflows: ${response.status} - ${errorText}`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Erro ${response.status}: ${errorText.substring(0, 100)}`,
          workflows: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Map workflows to simplified format
    const workflows = (data.data || []).map((wf: any) => ({
      id: wf.id,
      name: wf.name,
      active: wf.active,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
    }));

    console.log(`Found ${workflows.length} workflows`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        workflows,
        total: workflows.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error listing n8n workflows:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        workflows: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
