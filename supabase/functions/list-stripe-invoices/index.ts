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

    // Get company and subscription info
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, company_subscriptions(stripe_customer_id)")
      .eq("law_firm_id", profile.law_firm_id)
      .single();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subscription = company.company_subscriptions?.[0];
    const stripeCustomerId = subscription?.stripe_customer_id;

    if (!stripeCustomerId) {
      logStep("No Stripe customer ID found", { companyId: company.id });
      return new Response(
        JSON.stringify({ invoices: [], message: "No billing history found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 24, // Last 2 years of monthly invoices
    });

    logStep("Invoices fetched", { count: invoices.data.length });

    // Format invoices for frontend
    const formattedInvoices = invoices.data.map((invoice: Stripe.Invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount: invoice.amount_due / 100, // Convert from cents
      currency: invoice.currency.toUpperCase(),
      created_at: new Date(invoice.created * 1000).toISOString(),
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paid_at: invoice.status_transitions?.paid_at 
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() 
        : null,
      invoice_url: invoice.hosted_invoice_url,
      pdf_url: invoice.invoice_pdf,
      period_start: invoice.period_start 
        ? new Date(invoice.period_start * 1000).toISOString() 
        : null,
      period_end: invoice.period_end 
        ? new Date(invoice.period_end * 1000).toISOString() 
        : null,
    }));

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
