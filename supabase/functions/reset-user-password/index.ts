import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Production CORS configuration
const ALLOWED_ORIGINS = [
  'https://miauchat.com.br',
  'https://www.miauchat.com.br',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.includes('.lovableproject.com') ||
    origin.includes('.lovable.app') ||
    origin.endsWith('.miauchat.com.br')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Internal token for secure access without user auth
const INTERNAL_TOKEN = Deno.env.get("N8N_INTERNAL_TOKEN");

interface ResetPasswordRequest {
  user_id: string;
  new_password: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check for authorization - either internal token, admin user, or service role
    const authHeader = req.headers.get("authorization");
    const apiKeyHeader = req.headers.get("apikey");
    let isAuthorized = false;

    // If request comes from Supabase client with valid API key, check for admin role
    if (apiKeyHeader && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      
      // Check if it's the internal token
      if (INTERNAL_TOKEN && token === INTERNAL_TOKEN) {
        isAuthorized = true;
      } else {
        // Check if it's a valid admin user token
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        
        if (!userError && userData?.user) {
          // Check if user is a global admin
          const { data: adminRole } = await supabaseAdmin
            .from("admin_user_roles")
            .select("role")
            .eq("user_id", userData.user.id)
            .single();
          
          if (adminRole) {
            isAuthorized = true;
            console.log("Authorized via admin role:", adminRole.role);
          }
        }
      }
    } else if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      
      // Check if it's the internal token
      if (INTERNAL_TOKEN && token === INTERNAL_TOKEN) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Admin access required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, new_password }: ResetPasswordRequest = await req.json();

    if (!user_id || !new_password) {
      return new Response(
        JSON.stringify({ error: "user_id and new_password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the user's password using admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (error) {
      console.error("Error updating password:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also update the profile to not require password change
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user_id);

    console.log("Password updated successfully for user:", user_id);

    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in reset-user-password:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
