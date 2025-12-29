import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

interface TenantHealthResult {
  company_id: string;
  company_name: string;
  subdomain: string | null;
  health_status: HealthStatus;
  checks: {
    client_app: boolean;
    n8n_workflow: boolean;
    database_access: boolean;
  };
  issues: string[];
  checked_at: string;
}

// Determine overall health status based on checks
function calculateHealthStatus(checks: TenantHealthResult['checks']): HealthStatus {
  const checkResults = Object.values(checks);
  const passedCount = checkResults.filter(Boolean).length;
  
  if (passedCount === checkResults.length) return 'healthy';
  if (passedCount === 0) return 'unhealthy';
  return 'degraded';
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
    const companyId = url.searchParams.get('company_id');
    const updateDb = url.searchParams.get('update') !== 'false';

    console.log('=== TENANT HEALTH CHECK ===');
    console.log('Company ID:', companyId || 'ALL');

    // Build query
    let query = supabase
      .from('companies')
      .select(`
        id,
        name,
        law_firm_id,
        client_app_status,
        n8n_workflow_status,
        n8n_workflow_id,
        provisioning_status,
        law_firm:law_firms(id, subdomain)
      `)
      .eq('status', 'active');

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
      return new Response(
        JSON.stringify({ 
          message: companyId ? 'Company not found' : 'No active companies found',
          results: [] 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: TenantHealthResult[] = [];

    for (const company of companies) {
      const issues: string[] = [];
      const checks = {
        client_app: false,
        n8n_workflow: false,
        database_access: false,
      };

      // Handle law_firm as array from join
      const lawFirmData = company.law_firm as unknown;
      const lawFirm = Array.isArray(lawFirmData) ? lawFirmData[0] : lawFirmData as { id: string; subdomain: string | null } | null;
      const subdomain = lawFirm?.subdomain;
      const lawFirmId = company.law_firm_id;

      console.log(`Checking tenant: ${company.name} (${subdomain || 'no subdomain'})`);

      // Check 1: Client App Status
      if (company.client_app_status === 'created') {
        checks.client_app = true;
      } else {
        issues.push(`Client App status: ${company.client_app_status || 'unknown'}`);
      }

      // Check 2: n8n Workflow Status
      if (company.n8n_workflow_status === 'created' && company.n8n_workflow_id) {
        checks.n8n_workflow = true;
      } else {
        issues.push(`n8n workflow status: ${company.n8n_workflow_status || 'not created'}`);
      }

      // Check 3: Database Access - verify law_firm exists and has data
      if (lawFirmId) {
        const { data: lawFirmData, error: lawFirmError } = await supabase
          .from('law_firms')
          .select('id, name, subdomain')
          .eq('id', lawFirmId)
          .single();

        if (lawFirmData && !lawFirmError) {
          checks.database_access = true;
        } else {
          issues.push('Database access issue: law_firm not accessible');
        }
      } else {
        issues.push('No law_firm_id linked');
      }

      const healthStatus = calculateHealthStatus(checks);

      const result: TenantHealthResult = {
        company_id: company.id,
        company_name: company.name,
        subdomain: subdomain || null,
        health_status: healthStatus,
        checks,
        issues,
        checked_at: new Date().toISOString(),
      };

      results.push(result);

      // Update company health status in database
      if (updateDb) {
        await supabase
          .from('companies')
          .update({
            health_status: healthStatus,
            last_health_check_at: new Date().toISOString(),
          })
          .eq('id', company.id);

        // Send INTEGRATION_DOWN notification if unhealthy
        if (healthStatus === 'unhealthy') {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-admin-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                type: 'INTEGRATION_DOWN',
                tenant_id: company.id,
                company_name: company.name,
                subdomain: subdomain,
                integration_name: issues.join(', '),
                status: 'OFFLINE',
                last_success: 'N/A',
              }),
            });
            console.log(`  Notification sent for unhealthy tenant: ${company.name}`);
          } catch (notifyError) {
            console.warn('  Failed to send notification:', notifyError);
          }
        }
      }

      console.log(`  Status: ${healthStatus} | Issues: ${issues.length}`);
    }

    // Summary
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.health_status === 'healthy').length,
      degraded: results.filter(r => r.health_status === 'degraded').length,
      unhealthy: results.filter(r => r.health_status === 'unhealthy').length,
      unknown: results.filter(r => r.health_status === 'unknown').length,
    };

    console.log('=== HEALTH CHECK COMPLETE ===');
    console.log(`Summary: ${summary.healthy} healthy, ${summary.degraded} degraded, ${summary.unhealthy} unhealthy`);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
        checked_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in tenant-health-check:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
