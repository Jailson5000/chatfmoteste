import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Get user's law_firm_id from profile (NOT from request body)
    const { data: profile } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", user.id)
      .single();

    if (!profile?.law_firm_id) {
      return new Response(
        JSON.stringify({ error: "User not associated with any company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const law_firm_id = profile.law_firm_id; // VALIDATED law_firm_id

    const { action, redirect_url, code } = await req.json();

    console.log(`[google-calendar-auth] Action: ${action}, Law Firm: ${law_firm_id}, User: ${user.email}`);
    console.log(`[google-calendar-auth] Redirect URL received: ${redirect_url}`);

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("[google-calendar-auth] Missing Google OAuth credentials");
      return new Response(
        JSON.stringify({ 
          error: "Integração com Google Calendar não configurada. Entre em contato com o suporte." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "get_auth_url": {
        // Generate Google OAuth URL
        const scopes = [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/userinfo.email",
        ].join(" ");

        // Use centralized callback URL on main domain for scalability
        // This way we only need ONE redirect URI registered in Google Console
        const centralizedCallbackUrl = "https://www.miauchat.com.br/integrations/google-calendar/callback";
        
        // Encode both law_firm_id and original subdomain in state for redirect after OAuth
        const stateData = JSON.stringify({
          law_firm_id,
          return_origin: redirect_url ? new URL(redirect_url).origin : null
        });
        const encodedState = btoa(stateData);

        const params = new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: centralizedCallbackUrl,
          response_type: "code",
          scope: scopes,
          access_type: "offline",
          prompt: "consent",
          state: encodedState,
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        console.log(`[google-calendar-auth] Generated auth URL for law_firm: ${law_firm_id}`);
        console.log(`[google-calendar-auth] Using centralized callback: ${centralizedCallbackUrl}`);

        return new Response(
          JSON.stringify({ auth_url: authUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "exchange_code": {
        if (!code) {
          return new Response(
            JSON.stringify({ error: "Authorization code missing" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Always use centralized callback URL for token exchange (must match auth URL)
        const centralizedCallbackUrl = "https://www.miauchat.com.br/integrations/google-calendar/callback";

        // Exchange code for tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: centralizedCallbackUrl,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          console.error("[google-calendar-auth] Token exchange error:", tokenData);
          return new Response(
            JSON.stringify({ error: tokenData.error_description || "Failed to exchange code" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get user info
        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const userInfo = await userInfoResponse.json();

        console.log(`[google-calendar-auth] Got user info: ${userInfo.email}`);

        // Calculate token expiry
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        // Get authorization header to identify the user
        const authHeader = req.headers.get("Authorization");
        let connectedBy = null;
        
        if (authHeader) {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user } } = await userClient.auth.getUser();
          connectedBy = user?.id || null;
        }

        // Store integration in database
        const { data: integration, error: dbError } = await supabase
          .from("google_calendar_integrations")
          .upsert({
            law_firm_id,
            google_email: userInfo.email,
            google_account_id: userInfo.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: expiresAt,
            connected_by: connectedBy,
            connected_at: new Date().toISOString(),
            is_active: true,
            allow_read_events: true,
            allow_create_events: true,
            allow_edit_events: true,
            allow_delete_events: true,
          }, {
            onConflict: "law_firm_id",
          })
          .select()
          .single();

        if (dbError) {
          console.error("[google-calendar-auth] Database error:", dbError);
          return new Response(
            JSON.stringify({ error: "Failed to save integration" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log the connection
        await supabase.from("google_calendar_ai_logs").insert({
          law_firm_id,
          integration_id: integration.id,
          action_type: "connect",
          performed_by: "user",
          response_summary: `Connected Google Calendar for ${userInfo.email}`,
        });

        console.log(`[google-calendar-auth] Successfully connected for law_firm: ${law_firm_id}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            email: userInfo.email,
            integration_id: integration.id
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("[google-calendar-auth] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
