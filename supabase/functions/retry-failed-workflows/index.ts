import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exponential backoff configuration
const BACKOFF_CONFIG = {
  baseDelayMinutes: 5,      // First retry after 5 minutes
  maxDelayMinutes: 1440,    // Max 24 hours between retries
  maxRetries: 10,           // Maximum retry attempts
  multiplier: 2,            // Double delay each time
};

// Calculate next retry time with exponential backoff
function calculateNextRetryTime(retryCount: number): Date {
  const delayMinutes = Math.min(
    BACKOFF_CONFIG.baseDelayMinutes * Math.pow(BACKOFF_CONFIG.multiplier, retryCount),
    BACKOFF_CONFIG.maxDelayMinutes
  );
  
  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
  return nextRetry;
}

// Format duration for logging
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface RetryResult {
  company_id: string;
  company_name: string;
  status: 'success' | 'failed' | 'skipped' | 'max_retries';
  retry_count: number;
  next_retry_at?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const forceRetry = url.searchParams.get('force') === 'true';
    const companyId = url.searchParams.get('company_id');

    console.log('=== RETRY FAILED WORKFLOWS ===');
    console.log('Force retry:', forceRetry);
    console.log('Company ID:', companyId || 'ALL eligible');

    const now = new Date().toISOString();

    // Build query for companies with failed workflows that are due for retry
    let query = supabase
      .from('companies')
      .select(`
        id,
        name,
        law_firm_id,
        n8n_workflow_status,
        n8n_retry_count,
        n8n_next_retry_at,
        law_firm:law_firms(id, subdomain)
      `)
      .in('n8n_workflow_status', ['error', 'failed', 'pending'])
      .lt('n8n_retry_count', BACKOFF_CONFIG.maxRetries);

    // If not forcing, only get companies due for retry
    if (!forceRetry && !companyId) {
      query = query.or(`n8n_next_retry_at.is.null,n8n_next_retry_at.lte.${now}`);
    }

    // Filter by specific company if provided
    if (companyId) {
      query = query.eq('id', companyId);
    }

    const { data: companies, error: queryError } = await query;

    if (queryError) {
      console.error('Error fetching companies:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch companies', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!companies || companies.length === 0) {
      console.log('No companies eligible for retry');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No companies eligible for retry',
          results: [],
          summary: { total: 0, success: 0, failed: 0, skipped: 0, max_retries: 0 }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${companies.length} companies eligible for retry`);

    const results: RetryResult[] = [];

    for (const company of companies) {
      // Handle law_firm as array from join
      const lawFirmData = company.law_firm as unknown;
      const lawFirm = Array.isArray(lawFirmData) ? lawFirmData[0] : lawFirmData as { id: string; subdomain: string | null } | null;
      const subdomain = lawFirm?.subdomain || '';
      const currentRetryCount = company.n8n_retry_count || 0;

      console.log(`\nProcessing: ${company.name} (retry #${currentRetryCount + 1})`);

      // Check if max retries exceeded
      if (currentRetryCount >= BACKOFF_CONFIG.maxRetries) {
        console.log(`  Max retries (${BACKOFF_CONFIG.maxRetries}) reached, skipping and sending notification`);
        
        // Send notification email for max retries reached
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-admin-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              type: 'max_retries_reached',
              company_id: company.id,
              company_name: company.name,
              subdomain: subdomain,
              retry_count: currentRetryCount,
              error_message: 'Máximo de tentativas de retry atingido',
            }),
          });
          console.log('  Admin notification sent');
        } catch (notifyError) {
          console.warn('  Failed to send admin notification:', notifyError);
        }
        
        results.push({
          company_id: company.id,
          company_name: company.name,
          status: 'max_retries',
          retry_count: currentRetryCount,
        });
        continue;
      }

      // Check if not yet due for retry (unless forcing)
      if (!forceRetry && !companyId && company.n8n_next_retry_at) {
        const nextRetryTime = new Date(company.n8n_next_retry_at);
        if (nextRetryTime > new Date()) {
          console.log(`  Not yet due for retry (next: ${company.n8n_next_retry_at})`);
          results.push({
            company_id: company.id,
            company_name: company.name,
            status: 'skipped',
            retry_count: currentRetryCount,
            next_retry_at: company.n8n_next_retry_at,
          });
          continue;
        }
      }

      // Attempt to create n8n workflow
      try {
        console.log(`  Calling create-n8n-workflow...`);
        
        const n8nResponse = await fetch(`${supabaseUrl}/functions/v1/create-n8n-workflow`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            company_id: company.id,
            company_name: company.name,
            law_firm_id: company.law_firm_id,
            subdomain: subdomain,
            auto_activate: true,
          }),
        });

        if (n8nResponse.ok) {
          const responseData = await n8nResponse.json();
          console.log(`  SUCCESS: Workflow created (ID: ${responseData.workflow_id})`);

          // Update company with success status
          await supabase
            .from('companies')
            .update({
              n8n_workflow_status: 'created',
              n8n_workflow_id: responseData.workflow_id,
              n8n_workflow_name: responseData.workflow_name,
              n8n_retry_count: currentRetryCount + 1,
              n8n_next_retry_at: null,
              n8n_last_error: null,
              n8n_created_at: new Date().toISOString(),
              provisioning_status: 'active',
            })
            .eq('id', company.id);

          // Log audit
          await supabase.from('audit_logs').insert({
            action: 'N8N_WORKFLOW_RETRY_SUCCESS',
            entity_type: 'company',
            entity_id: company.id,
            new_values: {
              retry_count: currentRetryCount + 1,
              workflow_id: responseData.workflow_id,
            },
          });

          results.push({
            company_id: company.id,
            company_name: company.name,
            status: 'success',
            retry_count: currentRetryCount + 1,
          });
        } else {
          const errorText = await n8nResponse.text();
          console.log(`  FAILED: ${errorText.substring(0, 100)}`);

          // Calculate next retry time with exponential backoff
          const nextRetryTime = calculateNextRetryTime(currentRetryCount + 1);
          const delayMinutes = Math.round((nextRetryTime.getTime() - Date.now()) / 60000);

          console.log(`  Next retry in: ${formatDuration(delayMinutes)}`);

          // Update company with failure and next retry time
          await supabase
            .from('companies')
            .update({
              n8n_workflow_status: 'error',
              n8n_retry_count: currentRetryCount + 1,
              n8n_next_retry_at: nextRetryTime.toISOString(),
              n8n_last_error: errorText.substring(0, 500),
              n8n_updated_at: new Date().toISOString(),
              provisioning_status: 'partial',
            })
            .eq('id', company.id);

          // Log audit
          await supabase.from('audit_logs').insert({
            action: 'N8N_WORKFLOW_RETRY_FAILED',
            entity_type: 'company',
            entity_id: company.id,
            new_values: {
              retry_count: currentRetryCount + 1,
              next_retry_at: nextRetryTime.toISOString(),
              error: errorText.substring(0, 200),
            },
          });

          results.push({
            company_id: company.id,
            company_name: company.name,
            status: 'failed',
            retry_count: currentRetryCount + 1,
            next_retry_at: nextRetryTime.toISOString(),
            error: errorText.substring(0, 200),
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  ERROR: ${errorMessage}`);

        // Calculate next retry time
        const nextRetryTime = calculateNextRetryTime(currentRetryCount + 1);

        // Update company with failure
        await supabase
          .from('companies')
          .update({
            n8n_workflow_status: 'error',
            n8n_retry_count: currentRetryCount + 1,
            n8n_next_retry_at: nextRetryTime.toISOString(),
            n8n_last_error: errorMessage.substring(0, 500),
            n8n_updated_at: new Date().toISOString(),
            provisioning_status: 'partial',
          })
          .eq('id', company.id);

        results.push({
          company_id: company.id,
          company_name: company.name,
          status: 'failed',
          retry_count: currentRetryCount + 1,
          next_retry_at: nextRetryTime.toISOString(),
          error: errorMessage,
        });
      }
    }

    // Summary
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      max_retries: results.filter(r => r.status === 'max_retries').length,
    };

    console.log('\n=== RETRY COMPLETE ===');
    console.log(`Summary: ${summary.success} success, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.max_retries} max retries reached`);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
        backoff_config: {
          base_delay_minutes: BACKOFF_CONFIG.baseDelayMinutes,
          max_delay_minutes: BACKOFF_CONFIG.maxDelayMinutes,
          max_retries: BACKOFF_CONFIG.maxRetries,
          multiplier: BACKOFF_CONFIG.multiplier,
        },
        processed_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in retry-failed-workflows:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
