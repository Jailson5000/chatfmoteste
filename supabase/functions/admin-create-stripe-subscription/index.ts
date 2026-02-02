import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Admin Create Stripe Subscription
 * 
 * Allows global admins to create Stripe subscriptions for existing companies.
 * Creates a customer in Stripe, generates an invoice, and sends payment link.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs from Stripe Dashboard (LIVE MODE) - must match billing-config.ts plans
const PLAN_PRICES: Record<string, { monthly: string; yearly: string }> = {
  "BASIC": {
    monthly: "price_1SwDgnPssGNUXxgnH6kyepNO", // R$ 197 recurring monthly
    yearly: "price_1SwAujPssGNUXxgnEFJL0T6l",  // R$ 2.167
  },
  "STARTER": {
    monthly: "price_1SwAvUPssGNUXxgnT3lrWG6S", // R$ 497
    yearly: "price_1SwAwNPssGNUXxgnnMMSemHz",  // R$ 5.467
  },
  "PROFESSIONAL": {
    monthly: "price_1SwAyyPssGNUXxgn8mzTO9gC", // R$ 897
    yearly: "price_1SwAyyPssGNUXxgnNEbvcWuw",  // R$ 9.867
  },
  "ENTERPRISE": {
    monthly: "price_1SwAzXPssGNUXxgnfHklx8Qx", // R$ 1.697
    yearly: "price_1SwAzuPssGNUXxgn3SbEka4n",  // R$ 18.667
  },
};

// Add-on pricing (must match src/lib/billing-config.ts)
const PRICING_USER = 29.90;
const PRICING_INSTANCE = 57.90;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      console.error("[admin-create-stripe-subscription] STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Sistema de pagamento não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Validate admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check if user is a global admin
    const { data: adminRole } = await supabase.rpc('is_admin', { _user_id: userId });

    if (!adminRole) {
      console.warn(`[admin-create-stripe-subscription] Unauthorized access attempt by user: ${userId}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores globais." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Parse request body
    const { company_id, billing_type = "monthly" } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`[admin-create-stripe-subscription] Admin ${userId} creating subscription for company ${company_id}`);

    // Get company data with plan
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(`
        *,
        plan:plans!companies_plan_id_fkey(id, name, price, billing_period, max_users, max_instances)
      `)
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      console.error("[admin-create-stripe-subscription] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!company.plan) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui plano selecionado. Atribua um plano antes de gerar cobrança." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get billing email
    let billingEmail = company.email;
    
    if (!billingEmail && company.law_firm_id) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("law_firm_id", company.law_firm_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (adminProfile?.email) {
        billingEmail = adminProfile.email;
        console.log("[admin-create-stripe-subscription] Using admin profile email:", billingEmail);
      }
    }

    if (!billingEmail) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui email cadastrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check existing subscription
    const { data: existingSubscription } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("company_id", company.id)
      .maybeSingle();

    // Check if active Stripe subscription already exists
    if (existingSubscription?.stripe_subscription_id) {
      try {
        const existingSub = await stripe.subscriptions.retrieve(existingSubscription.stripe_subscription_id);
        if (existingSub.status === "active" || existingSub.status === "trialing") {
          console.log("[admin-create-stripe-subscription] Subscription already active:", existingSub.id);
          return new Response(
            JSON.stringify({ 
              error: "Esta empresa já possui uma assinatura ativa no Stripe. Use 'Atualizar Assinatura' para modificar o valor.",
              existing_subscription_id: existingSub.id,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      } catch (e) {
        // Subscription doesn't exist anymore in Stripe, continue
        console.log("[admin-create-stripe-subscription] Previous subscription not found in Stripe, continuing...");
      }
    }

    // Get or create Stripe customer
    let customerId: string = "";
    let needsCustomerUpdate = false;

    if (existingSubscription?.stripe_customer_id) {
      // Verify customer exists in current Stripe environment
      try {
        await stripe.customers.retrieve(existingSubscription.stripe_customer_id);
        customerId = existingSubscription.stripe_customer_id;
        console.log("[admin-create-stripe-subscription] Using existing Stripe customer:", customerId);
      } catch (e) {
        // Customer doesn't exist (likely switched from test to live mode)
        console.log("[admin-create-stripe-subscription] Existing customer not found in Stripe, will create new one");
        needsCustomerUpdate = true;
      }
    }

    // Create or find customer if needed
    if (!customerId || needsCustomerUpdate) {
      // Search for existing customer by email in current Stripe environment
      const customers = await stripe.customers.list({ email: billingEmail, limit: 1 });
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log("[admin-create-stripe-subscription] Found Stripe customer by email:", customerId);
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          name: company.name,
          email: billingEmail,
          phone: company.phone || undefined,
          metadata: {
            company_id: company.id,
            law_firm_id: company.law_firm_id || "",
          },
        });
        customerId = customer.id;
        console.log("[admin-create-stripe-subscription] Created new Stripe customer:", customerId);
      }
      
      // Update the subscription record with new customer ID
      if (needsCustomerUpdate && existingSubscription) {
        await supabase
          .from("company_subscriptions")
          .update({ stripe_customer_id: customerId })
          .eq("company_id", company.id);
        console.log("[admin-create-stripe-subscription] Updated subscription record with new customer ID");
      }
    }

    // ============ CALCULATE PRICE WITH ADD-ONS ============
    const planLimits = {
      max_users: company.plan.max_users || 0,
      max_instances: company.plan.max_instances || 0,
    };
    
    const effectiveLimits = {
      max_users: company.max_users || planLimits.max_users,
      max_instances: company.max_instances || planLimits.max_instances,
    };
    
    const additionalUsers = Math.max(0, effectiveLimits.max_users - planLimits.max_users);
    const additionalInstances = Math.max(0, effectiveLimits.max_instances - planLimits.max_instances);
    
    const usersCost = additionalUsers * PRICING_USER;
    const instancesCost = additionalInstances * PRICING_INSTANCE;
    const totalAdditional = usersCost + instancesCost;
    
    const basePlanPrice = company.plan.price || 0;
    const monthlyPrice = basePlanPrice + totalAdditional;
    const yearlyPrice = monthlyPrice * 11; // 11 months (1 free)
    const priceInReais = billing_type === "yearly" ? yearlyPrice : monthlyPrice;
    
    console.log(`[admin-create-stripe-subscription] Pricing breakdown:`, {
      basePlanPrice,
      additionalUsers,
      usersCost,
      additionalInstances,
      instancesCost,
      totalAdditional,
      monthlyPrice,
      priceInReais,
    });

    // Get the correct price ID from Stripe
    const planNameUpper = (company.plan.name || "BASIC").toUpperCase();
    const planPrices = PLAN_PRICES[planNameUpper] || PLAN_PRICES["STARTER"];
    const priceId = billing_type === "yearly" ? planPrices.yearly : planPrices.monthly;

    // Create subscription with invoice
    const subscriptionItems: Stripe.SubscriptionCreateParams.Item[] = [
      { price: priceId, quantity: 1 },
    ];

    // If there are add-ons, we need to create them as separate line items
    // For simplicity, we'll use a single price and adjust via invoice items later
    // Or create the subscription with the base price and add one-time charges

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: subscriptionItems,
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        company_id: company.id,
        law_firm_id: company.law_firm_id || "",
        plan_name: company.plan.name,
        additional_users: String(additionalUsers),
        additional_instances: String(additionalInstances),
      },
    });

    console.log("[admin-create-stripe-subscription] Subscription created:", subscription.id, "Status:", subscription.status);

    // Get the invoice URL for the customer to pay
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
    const hostedInvoiceUrl = invoice.hosted_invoice_url;

    // If there are add-ons, add them as invoice items to the next invoice
    if (totalAdditional > 0) {
      // Create invoice items for add-ons (will appear on next invoice)
      if (additionalUsers > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: Math.round(usersCost * 100), // Stripe uses cents
          currency: "brl",
          description: `Usuários adicionais (${additionalUsers}x R$ ${PRICING_USER.toFixed(2).replace('.', ',')})`,
        });
      }
      if (additionalInstances > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: Math.round(instancesCost * 100),
          currency: "brl",
          description: `WhatsApp adicionais (${additionalInstances}x R$ ${PRICING_INSTANCE.toFixed(2).replace('.', ',')})`,
        });
      }
      console.log("[admin-create-stripe-subscription] Added add-on invoice items");
    }

    // Calculate next due date (handle incomplete subscriptions)
    let nextDueDateStr: string | null = null;
    if (subscription.current_period_end) {
      const nextDueDate = new Date(subscription.current_period_end * 1000);
      if (!isNaN(nextDueDate.getTime())) {
        nextDueDateStr = nextDueDate.toISOString().split('T')[0];
      }
    }

    // Save subscription record
    await supabase
      .from("company_subscriptions")
      .upsert({
        company_id: company.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan_id: company.plan.id,
        billing_type,
        status: subscription.status === "active" ? "active" : "pending",
      }, { onConflict: "company_id" });

    // Log audit
    await supabase.from("audit_logs").insert({
      admin_user_id: userId,
      action: "ADMIN_CREATED_STRIPE_SUBSCRIPTION",
      entity_type: "company_subscription",
      entity_id: company.id,
      new_values: {
        company_name: company.name,
        plan_name: company.plan.name,
        billing_type,
        base_plan_price: basePlanPrice,
        additional_users: additionalUsers,
        users_cost: usersCost,
        additional_instances: additionalInstances,
        instances_cost: instancesCost,
        total_additional: totalAdditional,
        total_price: priceInReais,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        next_due_date: nextDueDateStr,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        next_due_date: nextDueDateStr,
        company_name: company.name,
        plan_name: company.plan.name,
        base_plan_price: basePlanPrice,
        additional_users: additionalUsers,
        additional_instances: additionalInstances,
        total_additional: totalAdditional,
        price: priceInReais,
        billing_type,
        stripe_customer_id: customerId,
        payment_url: hostedInvoiceUrl,
        message: `Assinatura criada com sucesso! O cliente receberá email do Stripe para pagamento.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[admin-create-stripe-subscription] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao criar assinatura";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
