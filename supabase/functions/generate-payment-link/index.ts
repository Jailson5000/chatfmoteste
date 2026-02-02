import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Generate Payment Link (Stripe)
 * 
 * Creates a Stripe Checkout Session for an existing company.
 * Used by trial users to subscribe or by expired trial users to pay.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs from Stripe Dashboard
const PLAN_PRICES: Record<string, { monthly: string; yearly: string }> = {
  "BASIC": {
    monthly: "price_BASIC_MONTHLY", // TODO: Create in Stripe Dashboard
    yearly: "price_BASIC_YEARLY",
  },
  "STARTER": {
    monthly: "price_1Sn4HqPuIhszhOCIJeKQV8Zw",
    yearly: "price_1Sn4K7PuIhszhOCItPywPXua",
  },
  "PROFESSIONAL": {
    monthly: "price_1Sn4I3PuIhszhOCIkzaV5obi",
    yearly: "price_1Sn4KcPuIhszhOCIe4PRabMr",
  },
  "ENTERPRISE": {
    monthly: "price_1Sn4IJPuIhszhOCIIzHxe05Q",
    yearly: "price_1Sn4KnPuIhszhOCIGtWyHEST",
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
      console.error("[generate-payment-link] STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Sistema de pagamento não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Validate auth
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

    // Get user profile and law_firm
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.law_firm_id) {
      return new Response(
        JSON.stringify({ error: "Perfil não encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Get company data
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(`
        *,
        plan:plans!companies_plan_id_fkey(id, name, price, billing_period, max_users, max_instances)
      `)
      .eq("law_firm_id", profile.law_firm_id)
      .single();

    if (companyError || !company) {
      console.error("[generate-payment-link] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!company.plan) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui plano selecionado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { billing_type = "monthly" } = await req.json().catch(() => ({}));

    console.log("[generate-payment-link] Generating link for company:", company.id, "plan:", company.plan.name);

    // Check or create Stripe customer
    let customerId: string | undefined;

    // Check existing subscription record
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (subscription?.stripe_customer_id) {
      customerId = subscription.stripe_customer_id;
      console.log("[generate-payment-link] Using existing Stripe customer:", customerId);
    } else {
      // Search for existing customer by email
      const customers = await stripe.customers.list({ email: company.email, limit: 1 });
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log("[generate-payment-link] Found Stripe customer by email:", customerId);
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
    const yearlyPrice = monthlyPrice * 11;
    const priceInReais = billing_type === "yearly" ? yearlyPrice : monthlyPrice;
    
    console.log("[generate-payment-link] Pricing breakdown:", {
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

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price: priceId,
        quantity: 1,
      },
    ];

    // Add add-ons as separate line items if present
    if (additionalUsers > 0) {
      lineItems.push({
        price_data: {
          currency: "brl",
          product_data: {
            name: `Usuários Adicionais (${additionalUsers}x)`,
            description: `${additionalUsers} usuário(s) extra(s) além do plano base`,
          },
          unit_amount: Math.round(usersCost * 100),
          recurring: {
            interval: billing_type === "yearly" ? "year" : "month",
          },
        },
        quantity: 1,
      });
    }

    if (additionalInstances > 0) {
      lineItems.push({
        price_data: {
          currency: "brl",
          product_data: {
            name: `WhatsApp Adicionais (${additionalInstances}x)`,
            description: `${additionalInstances} conexão(ões) WhatsApp extra(s) além do plano base`,
          },
          unit_amount: Math.round(instancesCost * 100),
          recurring: {
            interval: billing_type === "yearly" ? "year" : "month",
          },
        },
        quantity: 1,
      });
    }

    // Create Checkout Session
    const origin = req.headers.get("origin") || "https://miauchat.com.br";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : company.email,
      line_items: lineItems,
      mode: "subscription",
      success_url: `${origin}/payment-success?provider=stripe&company_id=${company.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?tab=meu-plano`,
      metadata: {
        company_id: company.id,
        law_firm_id: company.law_firm_id || "",
        plan_name: company.plan.name,
        billing_type,
      },
      subscription_data: {
        metadata: {
          company_id: company.id,
          law_firm_id: company.law_firm_id || "",
          plan_name: company.plan.name,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
    });

    console.log("[generate-payment-link] Checkout session created:", session.url);

    // Save or update subscription record with customer if new
    if (session.customer && !subscription?.stripe_customer_id) {
      await supabase
        .from("company_subscriptions")
        .upsert({
          company_id: company.id,
          stripe_customer_id: session.customer as string,
          plan_id: company.plan.id,
          billing_type,
          status: "pending",
        }, { onConflict: "company_id" });
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: session.url,
        plan_name: company.plan.name,
        base_plan_price: basePlanPrice,
        additional_users: additionalUsers,
        additional_instances: additionalInstances,
        total_additional: totalAdditional,
        price: priceInReais,
        billing_type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[generate-payment-link] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao gerar link de pagamento";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
