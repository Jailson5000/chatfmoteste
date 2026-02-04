import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit, getClientIP, rateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 30 req/min per IP
  const clientIP = getClientIP(req);
  const { allowed, retryAfter } = checkRateLimit(clientIP, { maxRequests: 30, windowMs: 60000 });
  if (!allowed) {
    logStep("Rate limit exceeded", { ip: clientIP });
    return rateLimitResponse(retryAfter, corsHeaders);
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    logStep("Stripe key verified");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      throw new Error(`Authentication error: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user?.email) {
      throw new Error("User not authenticated or email not available");
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's profile and law_firm_id
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("law_firm_id")
      .eq("id", user.id)
      .single();

    if (!profile?.law_firm_id) {
      throw new Error("User not associated with a company");
    }

    // Get company info with subscription
    const { data: company } = await supabaseClient
      .from("companies")
      .select("id, name")
      .eq("law_firm_id", profile.law_firm_id)
      .single();

    if (!company) {
      throw new Error("Company not found");
    }

    // Get subscription info
    const { data: subscription } = await supabaseClient
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (!subscription?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this company. Please complete a payment first.");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Validate customer exists in Stripe
    try {
      await stripe.customers.retrieve(subscription.stripe_customer_id);
      logStep("Stripe customer verified", { customerId: subscription.stripe_customer_id });
    } catch (e) {
      throw new Error("Customer not found in Stripe. Please contact support.");
    }

    const origin = req.headers.get("origin") || "https://miauchat.com.br";
    
    // Create Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/settings?tab=meu-plano`,
    });
    
    logStep("Customer portal session created", { sessionId: portalSession.id, url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
