import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateGlobalAdminRequest {
  email: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin_operacional" | "admin_financeiro";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Verify caller is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller is super_admin
    const { data: callerRole } = await supabase
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (!callerRole || callerRole.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Only super_admin can create global admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: CreateGlobalAdminRequest = await req.json();
    const { email, password, full_name, role } = body;

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, full_name, role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[create-global-admin] Creating global admin: ${email} with role: ${role}`);

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (authError) {
      console.error("[create-global-admin] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    console.log(`[create-global-admin] User created: ${userId}`);

    // Create admin profile
    const { error: profileError } = await supabase
      .from("admin_profiles")
      .insert({
        user_id: userId,
        email,
        full_name,
        is_active: true,
      });

    if (profileError) {
      console.error("[create-global-admin] Profile error:", profileError);
      // Rollback user creation
      await supabase.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to create admin profile: " + profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Assign admin role
    const { error: roleError } = await supabase
      .from("admin_user_roles")
      .insert({
        user_id: userId,
        role,
      });

    if (roleError) {
      console.error("[create-global-admin] Role error:", roleError);
      // Rollback
      await supabase.from("admin_profiles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to assign role: " + roleError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "GLOBAL_ADMIN_CREATED",
      entity_type: "admin_user",
      entity_id: userId,
      admin_user_id: userData.user.id,
      new_values: {
        email,
        full_name,
        role,
        created_by: userData.user.email,
      },
    });

    console.log(`[create-global-admin] Admin created successfully: ${email}`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email,
        role,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[create-global-admin] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
