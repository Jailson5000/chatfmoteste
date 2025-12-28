import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  automation_id: string;
  ai_prompt: string;
  ai_temperature: number;
  webhook_url?: string;
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
    const n8nToken = Deno.env.get('N8N_INTERNAL_TOKEN');

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user is authenticated
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

    console.log('User authenticated:', user.id);

    // Parse request body
    const body: SyncRequest = await req.json();
    const { automation_id, ai_prompt, ai_temperature, webhook_url } = body;

    if (!automation_id) {
      return new Response(
        JSON.stringify({ error: 'automation_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Syncing prompt for automation:', automation_id);

    // Fetch the automation to verify access and get details
    const { data: automation, error: fetchError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automation_id)
      .single();

    if (fetchError || !automation) {
      console.error('Automation fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Automation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which webhook URL to use
    const targetWebhookUrl = webhook_url || automation.webhook_url || n8nWebhookUrl;

    if (!targetWebhookUrl) {
      console.error('No webhook URL configured');
      return new Response(
        JSON.stringify({ error: 'No N8N webhook URL configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending prompt sync to N8N:', targetWebhookUrl);

    // Prepare the payload for N8N
    const n8nPayload = {
      event: 'prompt_sync',
      automation_id: automation_id,
      automation_name: automation.name,
      law_firm_id: automation.law_firm_id,
      ai_prompt: ai_prompt,
      ai_temperature: ai_temperature,
      trigger_type: automation.trigger_type,
      trigger_config: automation.trigger_config,
      is_active: automation.is_active,
      updated_at: new Date().toISOString(),
      synced_by: user.id,
    };

    // Build headers for N8N request
    const n8nHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication token if available
    if (n8nToken) {
      n8nHeaders['Authorization'] = `Bearer ${n8nToken}`;
      n8nHeaders['X-N8N-Token'] = n8nToken;
    }

    // Send to N8N
    const n8nResponse = await fetch(targetWebhookUrl, {
      method: 'POST',
      headers: n8nHeaders,
      body: JSON.stringify(n8nPayload),
    });

    const n8nResponseText = await n8nResponse.text();
    let n8nResponseData;
    
    try {
      n8nResponseData = JSON.parse(n8nResponseText);
    } catch {
      n8nResponseData = { raw: n8nResponseText };
    }

    console.log('N8N response status:', n8nResponse.status);
    console.log('N8N response:', n8nResponseData);

    if (!n8nResponse.ok) {
      console.error('N8N sync failed:', n8nResponse.status, n8nResponseData);
      
      // Still return success for the update, but note the sync failure
      return new Response(
        JSON.stringify({
          success: true,
          sync_status: 'failed',
          sync_error: `N8N returned status ${n8nResponse.status}`,
          message: 'Prompt saved but N8N sync failed. The changes will apply on next message.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the successful sync
    await supabase.from('webhook_logs').insert({
      automation_id: automation_id,
      direction: 'outgoing',
      payload: n8nPayload,
      response: n8nResponseData,
      status_code: n8nResponse.status,
    });

    console.log('Prompt synced successfully');

    return new Response(
      JSON.stringify({
        success: true,
        sync_status: 'synced',
        message: 'Prompt synced with N8N successfully',
        n8n_response: n8nResponseData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-n8n-prompt:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        sync_status: 'error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
