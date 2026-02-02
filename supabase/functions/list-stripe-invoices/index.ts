import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-STRIPE-INVOICES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Supabase not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      logStep("ERROR: Authentication failed", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Get user's profile and law_firm_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", userId)
      .single();

    if (!profile?.law_firm_id) {
      return new Response(
        JSON.stringify({ error: "User not associated with a company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company info
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name")
      .eq("law_firm_id", profile.law_firm_id)
      .single();

    if (companyError || !company) {
      logStep("ERROR: Company not found", { error: companyError?.message, lawFirmId: profile.law_firm_id });
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Company found", { companyId: company.id, companyName: company.name });

    // Get subscription info separately (fixes nested query issue)
    const { data: subscription, error: subError } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status")
      .eq("company_id", company.id)
      .maybeSingle();

    if (subError) {
      logStep("ERROR: Failed to fetch subscription", { error: subError.message });
    }

    const stripeCustomerId = subscription?.stripe_customer_id;
    logStep("Subscription lookup", { 
      hasSubscription: !!subscription, 
      stripeCustomerId: stripeCustomerId || "none",
      subscriptionStatus: subscription?.status || "none"
    });

    if (!stripeCustomerId) {
      logStep("No Stripe customer ID found", { companyId: company.id });
      return new Response(
        JSON.stringify({ invoices: [], message: "No billing history found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Validate customer exists in current Stripe environment (test vs live)
    try {
      await stripe.customers.retrieve(stripeCustomerId);
      logStep("Stripe customer verified", { stripeCustomerId });
    } catch (e) {
      // Customer doesn't exist - clear invalid ID and return empty
      logStep("Customer not found in Stripe (test→live migration)", { stripeCustomerId });
      
      await supabase
        .from("company_subscriptions")
        .update({ stripe_customer_id: null, stripe_subscription_id: null })
        .eq("company_id", company.id);
      
      return new Response(
        JSON.stringify({ invoices: [], message: "Histórico será criado após primeiro pagamento" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 24, // Last 2 years of monthly invoices
    });

    logStep("Invoices fetched", { count: invoices.data.length });

    // Map Stripe status to label and color (compatible with frontend)
    const statusMap: Record<string, { label: string; color: string }> = {
      draft: { label: "Rascunho", color: "gray" },
      open: { label: "Pendente", color: "yellow" },
      paid: { label: "Pago", color: "green" },
      void: { label: "Cancelado", color: "gray" },
      uncollectible: { label: "Inadimplente", color: "red" },
    };

    // Format invoices for frontend (camelCase format compatible with ASAAS)
    const formattedInvoices = invoices.data.map((invoice: Stripe.Invoice) => {
      const statusInfo = statusMap[invoice.status || "open"] || { label: "Pendente", color: "yellow" };
      
      return {
        id: invoice.id,
        value: invoice.amount_due / 100, // Convert from cents
        statusLabel: statusInfo.label,
        statusColor: statusInfo.color,
        description: `Assinatura - ${invoice.number || invoice.id}`,
        dueDate: invoice.due_date 
          ? new Date(invoice.due_date * 1000).toISOString() 
          : new Date(invoice.created * 1000).toISOString(), // Fallback to created date
        paymentDate: invoice.status_transitions?.paid_at 
          ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() 
          : null,
        invoiceUrl: invoice.hosted_invoice_url,
        bankSlipUrl: invoice.invoice_pdf, // PDF do Stripe
        billingType: "Stripe",
      };
    });

    return new Response(
      JSON.stringify({ 
        invoices: formattedInvoices,
        customer_id: stripeCustomerId,
        company_name: company.name
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
