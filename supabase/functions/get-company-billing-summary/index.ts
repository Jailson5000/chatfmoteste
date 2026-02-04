import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-COMPANY-BILLING-SUMMARY] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Verify global admin
    const { data: adminRole } = await supabaseClient
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminRole) {
      throw new Error("Apenas administradores globais podem acessar este recurso");
    }
    logStep("Admin role verified", { role: adminRole.role });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const { company_ids } = await req.json();
    
    if (!company_ids || !Array.isArray(company_ids) || company_ids.length === 0) {
      throw new Error("company_ids array is required");
    }
    logStep("Processing companies", { count: company_ids.length });

    // Fetch company subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from("company_subscriptions")
      .select("company_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, last_payment_at")
      .in("company_id", company_ids);

    if (subError) {
      logStep("Error fetching subscriptions", { error: subError.message });
    }

    const results: Record<string, {
      hasActiveSubscription: boolean;
      subscriptionStatus: string | null;
      lastPaymentAt: string | null;
      nextInvoiceAt: string | null;
      openInvoicesCount: number;
      openInvoicesTotal: number;
    }> = {};

    // Initialize all companies with default values
    for (const companyId of company_ids) {
      results[companyId] = {
        hasActiveSubscription: false,
        subscriptionStatus: null,
        lastPaymentAt: null,
        nextInvoiceAt: null,
        openInvoicesCount: 0,
        openInvoicesTotal: 0,
      };
    }

    // Process subscriptions with Stripe data
    for (const sub of subscriptions || []) {
      const companyId = sub.company_id;
      
      results[companyId].hasActiveSubscription = sub.status === 'active';
      results[companyId].subscriptionStatus = sub.status;
      results[companyId].lastPaymentAt = sub.last_payment_at;
      results[companyId].nextInvoiceAt = sub.current_period_end;

      // If we have a Stripe subscription, fetch fresh data
      if (sub.stripe_subscription_id) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
          
          results[companyId].hasActiveSubscription = stripeSub.status === 'active';
          results[companyId].subscriptionStatus = stripeSub.status;
          
          // Convert Unix timestamp to ISO string
          results[companyId].nextInvoiceAt = new Date(stripeSub.current_period_end * 1000).toISOString();
          
          // Get last paid invoice for this subscription
          const invoices = await stripe.invoices.list({
            subscription: sub.stripe_subscription_id,
            status: 'paid',
            limit: 1,
          });
          
          if (invoices.data.length > 0 && invoices.data[0].status_transitions?.paid_at) {
            results[companyId].lastPaymentAt = new Date(invoices.data[0].status_transitions.paid_at * 1000).toISOString();
          }
          
          logStep(`Fetched Stripe data for subscription`, { 
            companyId,
            subscriptionId: sub.stripe_subscription_id,
            status: stripeSub.status 
          });
        } catch (stripeError: unknown) {
          const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
          logStep(`Stripe error for subscription ${sub.stripe_subscription_id}`, { error: errorMessage });
          // Keep using database values as fallback
        }
      }

      // Fetch open invoices if we have a customer ID
      const customerId = sub.stripe_customer_id;
      if (customerId) {
        try {
          const openInvoices = await stripe.invoices.list({
            customer: customerId,
            status: 'open',
            limit: 100,
          });
          
          results[companyId].openInvoicesCount = openInvoices.data.length;
          results[companyId].openInvoicesTotal = openInvoices.data.reduce(
            (sum: number, inv: { amount_due?: number }) => sum + (inv.amount_due || 0), 
            0
          );
        } catch (invoiceError: unknown) {
          const errorMessage = invoiceError instanceof Error ? invoiceError.message : String(invoiceError);
          logStep(`Error fetching open invoices for ${customerId}`, { error: errorMessage });
        }
      }
    }

    logStep("All billing summaries processed", { processedCount: Object.keys(results).length });

    return new Response(JSON.stringify({ success: true, data: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

