import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-STRIPE-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Addon price IDs - these should be created in Stripe dashboard
// For now, we'll update the subscription quantity or add metered items
const ADDON_PRICES = {
  extra_user: "price_extra_user", // TODO: Create in Stripe and update
  extra_instance: "price_extra_instance", // TODO: Create in Stripe and update
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

    // Get authorization header - only global admins can call this
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

    // Check if user is global admin
    const { data: adminRole } = await supabase
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (!adminRole) {
      logStep("ERROR: Not a global admin");
      return new Response(
        JSON.stringify({ error: "Only global admins can update subscriptions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { company_id, additional_users, additional_instances, new_monthly_value } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Updating subscription", { company_id, additional_users, additional_instances, new_monthly_value });

    // Get company subscription
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("company_id", company_id)
      .single();

    if (!subscription?.stripe_subscription_id) {
      logStep("ERROR: No Stripe subscription found", { company_id });
      return new Response(
        JSON.stringify({ error: "No Stripe subscription found for this company" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get current subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

    if (!stripeSubscription) {
      return new Response(
        JSON.stringify({ error: "Subscription not found in Stripe" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Current subscription", { 
      status: stripeSubscription.status,
      items: stripeSubscription.items.data.length 
    });

    // Option 1: If we have addon prices configured, add them to the subscription
    // Option 2: Update metadata to track addons (simpler, requires manual invoice creation)
    
    // For now, we'll update the subscription metadata and create a manual invoice
    // This is more flexible as it doesn't require creating addon products in Stripe upfront

    if (new_monthly_value && new_monthly_value > 0) {
      // Create an invoice item for the additional amount
      const currentItems = stripeSubscription.items.data;
      const currentAmount = currentItems.reduce((sum: number, item: Stripe.SubscriptionItem) => {
        return sum + (item.price.unit_amount || 0) * (item.quantity || 1);
      }, 0);

      const newAmountCents = Math.round(new_monthly_value * 100);
      const additionalCents = newAmountCents - currentAmount;

      if (additionalCents > 0) {
        // Create an invoice item for the difference
        // This will be added to the next invoice
        await stripe.invoiceItems.create({
          customer: subscription.stripe_customer_id!,
          amount: additionalCents,
          currency: "brl",
          description: `Adicionais: ${additional_users || 0} usuário(s), ${additional_instances || 0} conexão(ões) WhatsApp`,
        });

        logStep("Invoice item created for addon", { 
          additionalAmount: additionalCents / 100,
          currency: "BRL"
        });
      }
    }

    // Update subscription metadata
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      metadata: {
        additional_users: String(additional_users || 0),
        additional_instances: String(additional_instances || 0),
        updated_at: new Date().toISOString(),
      },
    });

    // Update local record
    await supabase
      .from("company_subscriptions")
      .update({
        monthly_value: new_monthly_value,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company_id);

    logStep("Subscription updated successfully", { company_id });

    return new Response(
      JSON.stringify({ 
        success: true, 
        subscription_id: subscription.stripe_subscription_id,
        message: "Subscription updated. Additional charges will appear on the next invoice."
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
