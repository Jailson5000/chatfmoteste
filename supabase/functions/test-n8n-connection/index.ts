import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestConnectionRequest {
  api_url: string;
  api_key: string;
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

    const body: TestConnectionRequest = await req.json();
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
        JSON.stringify({ error: 'API URL and API Key are required', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Testing n8n connection to: ${api_url}`);

    // Test connection by fetching workflows list
    const response = await fetch(`${api_url}/api/v1/workflows?limit=1`, {
      method: 'GET',
      headers: {
        'X-N8N-API-KEY': api_key,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`N8N connection failed: ${response.status} - ${errorText}`);
      
      let errorMessage = `Erro ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = `Erro ${response.status}: ${JSON.stringify(errorJson)}`;
      } catch {
        errorMessage = `Erro ${response.status}: ${errorText.substring(0, 100)}`;
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          status: response.status
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('N8N connection successful, workflows found:', data.data?.length || 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Connection successful',
        workflows_count: data.data?.length || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing n8n connection:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
