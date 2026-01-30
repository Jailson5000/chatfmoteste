import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ImpersonateRequest {
  target_user_id: string;
  company_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const origin = req.headers.get("origin");
  const responseHeaders = { ...getCorsHeaders(origin), "Content-Type": "application/json" };

  try {
    // 1. Validate caller authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[impersonate-user] No auth header");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Create admin client with service role for privileged operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Create user client to get caller info
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // 2. Get caller's claims and verify they're a super_admin
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("[impersonate-user] Invalid token:", claimsError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: responseHeaders }
      );
    }

    const callerUserId = claimsData.claims.sub;
    console.log("[impersonate-user] Caller:", callerUserId);

    // 3. Verify caller is a super_admin
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .single();

    if (roleError || adminRole?.role !== "super_admin") {
      console.error("[impersonate-user] Not a super_admin:", roleError?.message || adminRole?.role);
      return new Response(
        JSON.stringify({ success: false, error: "Only super_admin can impersonate users" }),
        { status: 403, headers: responseHeaders }
      );
    }

    // 4. Parse request body
    const body: ImpersonateRequest = await req.json();
    const { target_user_id, company_id } = body;

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "target_user_id is required" }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log("[impersonate-user] Target user:", target_user_id, "Company:", company_id);

    // 5. Verify target user exists and get their profile
    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, law_firm_id")
      .eq("id", target_user_id)
      .single();

    if (profileError || !targetProfile) {
      console.error("[impersonate-user] Target user not found:", profileError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Target user not found" }),
        { status: 404, headers: responseHeaders }
      );
    }

    // 6. Get company name for logging
    let companyName = "Unknown";
    if (company_id) {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .single();
      companyName = company?.name || "Unknown";
    }

    // 7. Generate a magic link for the target user
    // This creates a one-time login link that expires in 1 hour
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetProfile.email,
      options: {
        redirectTo: `${SUPABASE_URL.replace('.supabase.co', '.lovable.app')}/dashboard?impersonating=true&admin=${callerUserId}&company=${company_id || targetProfile.law_firm_id}`,
      }
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[impersonate-user] Failed to generate link:", linkError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate impersonation session" }),
        { status: 500, headers: responseHeaders }
      );
    }

    // 8. Log the impersonation attempt
    const userAgent = req.headers.get("user-agent") || "unknown";
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";

    await supabaseAdmin.from("impersonation_logs").insert({
      admin_user_id: callerUserId,
      target_user_id: target_user_id,
      target_company_id: company_id || targetProfile.law_firm_id,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Also log to audit_logs for comprehensive tracking
    await supabaseAdmin.from("audit_logs").insert({
      admin_user_id: callerUserId,
      action: "IMPERSONATE_USER",
      entity_type: "user",
      entity_id: target_user_id,
      new_values: {
        target_email: targetProfile.email,
        target_name: targetProfile.full_name,
        company_id: company_id || targetProfile.law_firm_id,
        company_name: companyName,
        ip_address: ipAddress,
      },
    });

    console.log("[impersonate-user] Success - Admin:", callerUserId, "impersonating:", targetProfile.email);

    // 9. Build the impersonation URL
    // The magic link action_link contains the full verification URL
    const verificationUrl = linkData.properties.action_link;
    
    // Add our custom parameters to track impersonation state
    const impersonationUrl = new URL(verificationUrl);
    impersonationUrl.searchParams.set("impersonating", "true");
    impersonationUrl.searchParams.set("admin_id", callerUserId);
    impersonationUrl.searchParams.set("company_name", companyName);

    return new Response(
      JSON.stringify({
        success: true,
        url: impersonationUrl.toString(),
        target_user: {
          id: targetProfile.id,
          name: targetProfile.full_name,
          email: targetProfile.email,
        },
        company_name: companyName,
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (error: any) {
    console.error("[impersonate-user] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: responseHeaders }
    );
  }
});
