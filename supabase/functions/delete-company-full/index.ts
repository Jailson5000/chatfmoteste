import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteCompanyRequest {
  company_id: string;
  delete_users?: boolean;
}

interface DeleteResult {
  success: boolean;
  company_name?: string;
  law_firm_id?: string;
  deleted_users?: number;
  deleted_n8n_workflow?: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.error('[delete-company-full] Auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is a super_admin
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from('admin_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !adminRole || adminRole.role !== 'super_admin') {
      console.error('[delete-company-full] Access denied for user:', user.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Only super_admin can delete companies' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { company_id, delete_users = true }: DeleteCompanyRequest = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-company-full] Starting deletion for company:', company_id, { delete_users });

    // Fetch company with law_firm
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select(`
        *,
        law_firm:law_firms(id, name, subdomain)
      `)
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      console.error('[delete-company-full] Company not found:', companyError);
      return new Response(
        JSON.stringify({ success: false, error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lawFirmId = company.law_firm_id;
    const companyName = company.name;
    const n8nWorkflowId = company.n8n_workflow_id;

    console.log('[delete-company-full] Found company:', {
      id: company_id,
      name: companyName,
      law_firm_id: lawFirmId,
      n8n_workflow_id: n8nWorkflowId
    });

    const result: DeleteResult = {
      success: true,
      company_name: companyName,
      law_firm_id: lawFirmId,
      deleted_users: 0,
      deleted_n8n_workflow: false
    };

    // Step 1: Delete n8n workflow if exists
    if (n8nWorkflowId) {
      try {
        console.log('[delete-company-full] Deleting n8n workflow:', n8nWorkflowId);
        const { error: n8nError } = await supabaseAdmin.functions.invoke('delete-n8n-workflow', {
          body: {
            workflow_id: n8nWorkflowId,
            company_id: company_id,
          },
        });
        if (n8nError) {
          console.error('[delete-company-full] n8n workflow deletion failed:', n8nError);
        } else {
          result.deleted_n8n_workflow = true;
        }
      } catch (e) {
        console.error('[delete-company-full] n8n workflow deletion error:', e);
        // Continue even if n8n deletion fails
      }
    }

    // Step 2: List all profiles linked to this law_firm
    let deletedUserCount = 0;
    if (lawFirmId && delete_users) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .eq('law_firm_id', lawFirmId);

      if (profilesError) {
        console.error('[delete-company-full] Error fetching profiles:', profilesError);
      } else if (profiles && profiles.length > 0) {
        console.log('[delete-company-full] Found profiles to delete:', profiles.length);

        // Step 3: Delete each user from auth.users
        for (const profile of profiles) {
          try {
            console.log('[delete-company-full] Deleting user:', profile.id, profile.email);
            const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
            if (deleteUserError) {
              console.error('[delete-company-full] Failed to delete user:', profile.id, deleteUserError);
            } else {
              deletedUserCount++;
            }
          } catch (e) {
            console.error('[delete-company-full] User deletion error:', profile.id, e);
          }
        }
        result.deleted_users = deletedUserCount;
      }
    }

    // Step 4: Delete law_firm (CASCADE will delete company and ~80+ related tables)
    if (lawFirmId) {
      console.log('[delete-company-full] Deleting law_firm:', lawFirmId);
      const { error: lawFirmError } = await supabaseAdmin
        .from('law_firms')
        .delete()
        .eq('id', lawFirmId);

      if (lawFirmError) {
        console.error('[delete-company-full] law_firm deletion failed:', lawFirmError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to delete law_firm: ${lawFirmError.message}`,
            deleted_users: deletedUserCount
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // If no law_firm, just delete the company directly
      console.log('[delete-company-full] No law_firm, deleting company directly');
      const { error: companyDeleteError } = await supabaseAdmin
        .from('companies')
        .delete()
        .eq('id', company_id);

      if (companyDeleteError) {
        console.error('[delete-company-full] Company deletion failed:', companyDeleteError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to delete company: ${companyDeleteError.message}`,
            deleted_users: deletedUserCount
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 5: Create audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        admin_user_id: user.id,
        action: 'COMPANY_FULL_DELETE',
        entity_type: 'company',
        entity_id: company_id,
        old_values: {
          company_id,
          company_name: companyName,
          law_firm_id: lawFirmId,
        },
        new_values: {
          deleted_users: deletedUserCount,
          deleted_n8n_workflow: result.deleted_n8n_workflow,
          deleted_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error('[delete-company-full] Audit log error:', e);
      // Don't fail the operation if audit log fails
    }

    console.log('[delete-company-full] Deletion complete:', result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[delete-company-full] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
