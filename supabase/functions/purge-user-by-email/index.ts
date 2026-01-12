import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PurgeUserRequest {
  email: string;
}

function isValidEmail(email: string) {
  if (email.length > 254) return false;
  // Basic RFC-like validation (good enough for server-side guard)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findUserIdByEmail(supabaseAdmin: any, email: string): Promise<string | null> {
  // 1) Try via profiles table (fast)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (profile?.id) return profile.id as string;

  // 2) Try via admin_profiles (global admins)
  const { data: adminProfile } = await supabaseAdmin
    .from("admin_profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();

  if (adminProfile?.user_id) return adminProfile.user_id as string;

  // 3) Fallback: list users (paginated)
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[purge-user-by-email] listUsers error:", error);
      return null;
    }

    const users = data?.users || [];
    const found = users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found?.id) return found.id as string;

    if (users.length < perPage) break; // no more pages
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return json(401, { code: "UNAUTHORIZED", message: "Sessão inválida. Faça login novamente." });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Validate JWT (do not rely on verify_jwt)
  const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authUserData, error: authUserError } = await authSupabase.auth.getUser();
  if (authUserError || !authUserData?.user) {
    console.error("[purge-user-by-email] Invalid JWT", authUserError);
    return json(401, { code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  }

  const callerId = authUserData.user.id;

  // Only super_admin can purge users (cross-tenant destructive action)
  const { data: callerRole } = await supabaseAdmin
    .from("admin_user_roles")
    .select("role")
    .eq("user_id", callerId)
    .maybeSingle();

  if (!callerRole || callerRole.role !== "super_admin") {
    return json(403, {
      code: "FORBIDDEN",
      message: "Apenas super_admin pode liberar/excluir usuários por e-mail.",
    });
  }

  let body: PurgeUserRequest;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { code: "BAD_REQUEST", message: "JSON inválido" });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return json(400, { code: "BAD_REQUEST", message: "E-mail inválido" });
  }

  console.log(`[purge-user-by-email] Requested purge for: ${email} by ${callerId}`);

  const userId = await findUserIdByEmail(supabaseAdmin, email);
  if (!userId) {
    return json(404, { code: "NOT_FOUND", message: "Usuário não encontrado para este e-mail." });
  }

  // Snapshot what exists (for audit)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, law_firm_id")
    .eq("id", userId)
    .maybeSingle();

  const { data: adminProfile } = await supabaseAdmin
    .from("admin_profiles")
    .select("user_id, email, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  // Clean public tables first
  await supabaseAdmin.from("member_departments").delete().eq("member_id", userId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  // Clean global admin tables
  await supabaseAdmin.from("admin_user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("admin_profiles").delete().eq("user_id", userId);

  // Delete from auth
  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    console.error("[purge-user-by-email] deleteUser error:", deleteAuthError);
    return json(500, {
      code: "AUTH_DELETE_FAILED",
      message: "Falha ao remover usuário do sistema de autenticação.",
      details: deleteAuthError.message,
    });
  }

  // Audit log
  try {
    await supabaseAdmin.from("audit_logs").insert({
      action: "USER_PURGED_BY_EMAIL",
      entity_type: "user",
      entity_id: userId,
      admin_user_id: callerId,
      new_values: {
        email,
        profile,
        adminProfile,
      },
    });
  } catch (e) {
    console.warn("[purge-user-by-email] Failed to write audit log", e);
  }

  console.log(`[purge-user-by-email] Purged successfully: ${email} (${userId})`);

  return json(200, { success: true, user_id: userId, email });
});
