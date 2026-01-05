// deno-lint-ignore-file
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

// Generate a secure random password
function generateSecurePassword(): string {
  const length = 12;
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '@#$%&*!';
  
  const allChars = lowercase + uppercase + numbers + special;
  
  // Ensure at least one of each type
  let password = '';
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const responseHeaders = { ...getCorsHeaders(origin), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(origin) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ========================================
    // SECURITY: Validate caller is super_admin
    // ========================================
    const authHeader = req.headers.get("authorization");
    
    if (!authHeader) {
      console.error("[admin-reset-password] No authorization header");
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: responseHeaders }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Get the calling user
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error("[admin-reset-password] Invalid token:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: responseHeaders }
      );
    }

    const callerUserId = userData.user.id;
    const callerEmail = userData.user.email;

    // Check if caller is super_admin
    const { data: callerRole, error: roleError } = await supabaseAdmin
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .single();

    if (roleError || !callerRole) {
      console.error("[admin-reset-password] Caller is not an admin:", roleError?.message);
      return new Response(
        JSON.stringify({ error: "Access denied - Admin role required" }),
        { status: 403, headers: responseHeaders }
      );
    }

    // Only super_admin can reset passwords
    if (callerRole.role !== "super_admin") {
      console.warn(`[admin-reset-password] Non-super_admin attempted password reset. Caller: ${callerEmail}, Role: ${callerRole.role}`);
      
      // Log the unauthorized attempt
      await supabaseAdmin.from("audit_logs").insert({
        admin_user_id: callerUserId,
        action: "PASSWORD_RESET_DENIED",
        entity_type: "admin_security",
        entity_id: null,
        new_values: {
          caller_email: callerEmail,
          caller_role: callerRole.role,
          reason: "Only super_admin can reset passwords",
        },
      });

      return new Response(
        JSON.stringify({ error: "Access denied - Only Super Admin can reset passwords" }),
        { status: 403, headers: responseHeaders }
      );
    }

    // Parse request body
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "email is required" }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Find user by email
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("[admin-reset-password] Error listing users:", listError.message);
      return new Response(
        JSON.stringify({ error: "Failed to lookup user" }),
        { status: 500, headers: responseHeaders }
      );
    }

    const targetUser = usersData.users.find(u => u.email === email);
    
    if (!targetUser) {
      // Log failed attempt (user not found)
      await supabaseAdmin.from("audit_logs").insert({
        admin_user_id: callerUserId,
        action: "PASSWORD_RESET_FAILED",
        entity_type: "user",
        entity_id: null,
        new_values: {
          target_email: email,
          reason: "User not found",
          performed_by: callerEmail,
        },
      });

      return new Response(
        JSON.stringify({ error: `User with email ${email} not found` }),
        { status: 404, headers: responseHeaders }
      );
    }

    // Generate secure random password on server
    const newPassword = generateSecurePassword();

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error("[admin-reset-password] Error updating password:", updateError.message);
      
      // Log failed attempt
      await supabaseAdmin.from("audit_logs").insert({
        admin_user_id: callerUserId,
        action: "PASSWORD_RESET_FAILED",
        entity_type: "user",
        entity_id: targetUser.id,
        new_values: {
          target_email: email,
          error: updateError.message,
          performed_by: callerEmail,
        },
      });

      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Set must_change_password flag so user has to change on first login
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", targetUser.id);

    // Log successful password reset
    await supabaseAdmin.from("audit_logs").insert({
      admin_user_id: callerUserId,
      action: "PASSWORD_RESET_SUCCESS",
      entity_type: "user",
      entity_id: targetUser.id,
      new_values: {
        target_email: email,
        performed_by: callerEmail,
        must_change_password: true,
      },
    });

    console.log(`[admin-reset-password] Password reset for ${email} by ${callerEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Password reset for ${email}`,
        temporary_password: newPassword,
        must_change_password: true,
      }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error: any) {
    console.error("[admin-reset-password] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
