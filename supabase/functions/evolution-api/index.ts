import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EvolutionRequest {
  action: 'create_instance' | 'get_qrcode' | 'get_status' | 'delete_instance' | 'test_connection' | 'configure_webhook';
  instanceName?: string;
  apiUrl?: string;
  apiKey?: string;
  instanceId?: string;
}

// Helper to normalize URL (remove trailing slashes and /manager suffix)
function normalizeUrl(url: string): string {
  let normalized = url.replace(/\/+$/, '');
  // Remove /manager suffix if present (common in Evolution API dashboard URLs)
  normalized = normalized.replace(/\/manager$/i, '');
  return normalized;
}

// Get the webhook URL for this project
const WEBHOOK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evolution-webhook`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Get user from token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    // Get user's law firm
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('law_firm_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.law_firm_id) {
      throw new Error('User not associated with a law firm');
    }

    const lawFirmId = profile.law_firm_id;
    const body: EvolutionRequest = await req.json();
    
    console.log(`[Evolution API] Action: ${body.action}, Instance: ${body.instanceName || body.instanceId}`);

    switch (body.action) {
      case 'test_connection': {
        if (!body.apiUrl || !body.apiKey) {
          throw new Error('apiUrl and apiKey are required for test_connection');
        }

        const apiUrl = normalizeUrl(body.apiUrl);
        console.log(`[Evolution API] Testing connection to: ${apiUrl}`);
        
        const response = await fetch(`${apiUrl}/instance/fetchInstances`, {
          method: 'GET',
          headers: {
            'apikey': body.apiKey,
            'Content-Type': 'application/json',
          },
        });

        console.log(`[Evolution API] Test connection response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Evolution API] Test connection failed: ${errorText}`);
          throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Connection successful' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create_instance': {
        if (!body.instanceName || !body.apiUrl || !body.apiKey) {
          throw new Error('instanceName, apiUrl, and apiKey are required');
        }

        const apiUrl = normalizeUrl(body.apiUrl);
        console.log(`[Evolution API] Creating instance: ${body.instanceName} at ${apiUrl}`);
        console.log(`[Evolution API] Webhook URL: ${WEBHOOK_URL}`);

        // Create instance in Evolution API with webhook configuration
        const createResponse = await fetch(`${apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'apikey': body.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instanceName: body.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
              url: WEBHOOK_URL,
              byEvents: false,
              base64: true,
              events: [
                'CONNECTION_UPDATE',
                'QRCODE_UPDATED',
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'MESSAGES_DELETE',
                'SEND_MESSAGE',
              ],
            },
          }),
        });

        console.log(`[Evolution API] Create instance response status: ${createResponse.status}`);

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error(`[Evolution API] Create instance failed: ${errorText}`);
          throw new Error(`Failed to create instance: ${errorText}`);
        }

        const createData = await createResponse.json();
        console.log(`[Evolution API] Create instance response:`, JSON.stringify(createData));

        // Extract QR code from response - handle various formats
        let qrCode = null;
        if (createData.qrcode?.base64) {
          qrCode = createData.qrcode.base64;
        } else if (createData.qrcode && typeof createData.qrcode === 'string') {
          qrCode = createData.qrcode;
        } else if (createData.base64) {
          qrCode = createData.base64;
        }
        
        const instanceId = createData.instance?.instanceId || createData.instanceId || body.instanceName;

        console.log(`[Evolution API] Saving instance to database. QR Code available: ${!!qrCode}`);

        // Save instance to database
        const { data: instance, error: insertError } = await supabaseClient
          .from('whatsapp_instances')
          .insert({
            law_firm_id: lawFirmId,
            instance_name: body.instanceName,
            instance_id: instanceId,
            api_url: apiUrl,
            api_key: body.apiKey,
            status: qrCode ? 'awaiting_qr' : 'disconnected',
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[Evolution API] Database insert error:`, insertError);
          throw new Error(`Failed to save instance: ${insertError.message}`);
        }

        console.log(`[Evolution API] Instance saved with ID: ${instance.id}`);
        console.log(`[Evolution API] Webhook configured at: ${WEBHOOK_URL}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            instance,
            qrCode,
            webhookUrl: WEBHOOK_URL,
            message: qrCode ? 'Instance created, scan QR code' : 'Instance created' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_qrcode': {
        if (!body.instanceId) {
          throw new Error('instanceId is required');
        }

        console.log(`[Evolution API] Getting QR code for instance: ${body.instanceId}`);

        // Get instance from database
        const { data: instance, error: fetchError } = await supabaseClient
          .from('whatsapp_instances')
          .select('*')
          .eq('id', body.instanceId)
          .eq('law_firm_id', lawFirmId)
          .single();

        if (fetchError || !instance) {
          console.error(`[Evolution API] Instance not found:`, fetchError);
          throw new Error('Instance not found');
        }

        const apiUrl = normalizeUrl(instance.api_url);
        console.log(`[Evolution API] Fetching QR from: ${apiUrl}/instance/connect/${instance.instance_name}`);

        // Request QR code from Evolution API
        const qrResponse = await fetch(`${apiUrl}/instance/connect/${instance.instance_name}`, {
          method: 'GET',
          headers: {
            'apikey': instance.api_key || '',
            'Content-Type': 'application/json',
          },
        });

        console.log(`[Evolution API] Get QR code response status: ${qrResponse.status}`);

        if (!qrResponse.ok) {
          const errorText = await qrResponse.text();
          console.error(`[Evolution API] Get QR code failed: ${errorText}`);
          throw new Error(`Failed to get QR code: ${errorText}`);
        }

        const qrData = await qrResponse.json();
        console.log(`[Evolution API] QR code response:`, JSON.stringify(qrData));

        // Extract QR code - handle different response formats
        let qrCode = null;
        if (qrData.base64) {
          qrCode = qrData.base64;
        } else if (qrData.qrcode?.base64) {
          qrCode = qrData.qrcode.base64;
        } else if (qrData.qrcode && typeof qrData.qrcode === 'string') {
          qrCode = qrData.qrcode;
        } else if (qrData.code) {
          qrCode = qrData.code;
        }
        
        const status = qrData.state || qrData.status || qrData.instance?.state || 'unknown';
        console.log(`[Evolution API] QR Code extracted: ${!!qrCode}, Status: ${status}`);

        // Update instance status if connected
        if (status === 'open' || status === 'connected') {
          await supabaseClient
            .from('whatsapp_instances')
            .update({ status: 'connected', updated_at: new Date().toISOString() })
            .eq('id', body.instanceId);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            qrCode,
            status,
            message: qrCode ? 'QR code retrieved' : 'No QR code available' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_status': {
        if (!body.instanceId) {
          throw new Error('instanceId is required');
        }

        console.log(`[Evolution API] Getting status for instance: ${body.instanceId}`);

        // Get instance from database
        const { data: instance, error: fetchError } = await supabaseClient
          .from('whatsapp_instances')
          .select('*')
          .eq('id', body.instanceId)
          .eq('law_firm_id', lawFirmId)
          .single();

        if (fetchError || !instance) {
          throw new Error('Instance not found');
        }

        const apiUrl = normalizeUrl(instance.api_url);
        
        // Get status from Evolution API
        const statusResponse = await fetch(`${apiUrl}/instance/connectionState/${instance.instance_name}`, {
          method: 'GET',
          headers: {
            'apikey': instance.api_key || '',
            'Content-Type': 'application/json',
          },
        });

        console.log(`[Evolution API] Get status response: ${statusResponse.status}`);

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`[Evolution API] Get status failed: ${errorText}`);
          
          // If instance doesn't exist on Evolution, mark as disconnected
          await supabaseClient
            .from('whatsapp_instances')
            .update({ status: 'disconnected', updated_at: new Date().toISOString() })
            .eq('id', body.instanceId);

          return new Response(
            JSON.stringify({ success: true, status: 'disconnected', instance }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const statusData = await statusResponse.json();
        console.log(`[Evolution API] Status response:`, JSON.stringify(statusData));

        const state = statusData.state || statusData.instance?.state || 'unknown';
        let dbStatus = 'disconnected';
        
        if (state === 'open' || state === 'connected') {
          dbStatus = 'connected';
        } else if (state === 'connecting' || state === 'qr') {
          dbStatus = 'connecting';
        }

        // Update status in database
        const { data: updatedInstance } = await supabaseClient
          .from('whatsapp_instances')
          .update({ status: dbStatus, updated_at: new Date().toISOString() })
          .eq('id', body.instanceId)
          .select()
          .single();

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: dbStatus,
            evolutionState: state,
            instance: updatedInstance,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete_instance': {
        if (!body.instanceId) {
          throw new Error('instanceId is required');
        }

        console.log(`[Evolution API] Deleting instance: ${body.instanceId}`);

        // Get instance from database
        const { data: instance, error: fetchError } = await supabaseClient
          .from('whatsapp_instances')
          .select('*')
          .eq('id', body.instanceId)
          .eq('law_firm_id', lawFirmId)
          .single();

        if (fetchError || !instance) {
          throw new Error('Instance not found');
        }

        const apiUrl = normalizeUrl(instance.api_url);

        // Delete from Evolution API (best effort)
        try {
          const deleteResponse = await fetch(`${apiUrl}/instance/delete/${instance.instance_name}`, {
            method: 'DELETE',
            headers: {
              'apikey': instance.api_key || '',
              'Content-Type': 'application/json',
            },
          });
          console.log(`[Evolution API] Evolution delete response: ${deleteResponse.status}`);
        } catch (e) {
          console.log(`[Evolution API] Evolution delete failed (non-fatal):`, e);
        }

        // Delete from database
        const { error: deleteError } = await supabaseClient
          .from('whatsapp_instances')
          .delete()
          .eq('id', body.instanceId)
          .eq('law_firm_id', lawFirmId);

        if (deleteError) {
          throw new Error(`Failed to delete instance: ${deleteError.message}`);
        }

        console.log(`[Evolution API] Instance deleted successfully`);

        return new Response(
          JSON.stringify({ success: true, message: 'Instance deleted' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'configure_webhook': {
        if (!body.instanceId) {
          throw new Error('instanceId is required');
        }

        console.log(`[Evolution API] Configuring webhook for instance: ${body.instanceId}`);

        // Get instance from database
        const { data: instance, error: fetchError } = await supabaseClient
          .from('whatsapp_instances')
          .select('*')
          .eq('id', body.instanceId)
          .eq('law_firm_id', lawFirmId)
          .single();

        if (fetchError || !instance) {
          throw new Error('Instance not found');
        }

        const apiUrl = normalizeUrl(instance.api_url);

        // Configure webhook in Evolution API
        const webhookResponse = await fetch(`${apiUrl}/webhook/set/${instance.instance_name}`, {
          method: 'POST',
          headers: {
            'apikey': instance.api_key || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: WEBHOOK_URL,
            enabled: true,
            byEvents: false,
            base64: true,
            events: [
              'CONNECTION_UPDATE',
              'QRCODE_UPDATED',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'MESSAGES_DELETE',
              'SEND_MESSAGE',
            ],
          }),
        });

        console.log(`[Evolution API] Configure webhook response: ${webhookResponse.status}`);

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error(`[Evolution API] Configure webhook failed: ${errorText}`);
          throw new Error(`Failed to configure webhook: ${errorText}`);
        }

        const webhookData = await webhookResponse.json();
        console.log(`[Evolution API] Webhook configured:`, JSON.stringify(webhookData));

        return new Response(
          JSON.stringify({ 
            success: true, 
            webhookUrl: WEBHOOK_URL,
            message: 'Webhook configured successfully' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }
  } catch (error) {
    console.error('[Evolution API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
