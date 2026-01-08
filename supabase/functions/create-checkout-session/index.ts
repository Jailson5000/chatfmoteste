import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map plan names to Stripe price IDs
// TODO: Create BASIC products in Stripe dashboard and add price IDs here
const PLAN_PRICES = {
  basic: {
    monthly: "price_basic_monthly", // TODO: Replace with actual Stripe price ID
    yearly: "price_basic_yearly"    // TODO: Replace with actual Stripe price ID
  },
  starter: {
    monthly: "price_1Sn4HqPuIhszhOCIJeKQV8Zw",
    yearly: "price_1Sn4K7PuIhszhOCItPywPXua"
  },
  professional: {
    monthly: "price_1Sn4I3PuIhszhOCIkzaV5obi",
    yearly: "price_1Sn4KcPuIhszhOCIe4PRabMr"
  },
  enterprise: {
    monthly: "price_1Sn4IJPuIhszhOCIIzHxe05Q",
    yearly: "price_1Sn4KnPuIhszhOCIGtWyHEST"
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CREATE-CHECKOUT] Starting checkout session creation");

    const { 
      plan, 
      billingPeriod = "monthly",
      companyName, 
      adminName, 
      adminEmail, 
      adminPhone,
      document 
    } = await req.json();

    console.log("[CREATE-CHECKOUT] Request data:", { plan, billingPeriod, companyName, adminEmail });

    // Validate required fields
    if (!plan || !companyName || !adminName || !adminEmail) {
      console.error("[CREATE-CHECKOUT] Missing required fields");
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios não preenchidos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate plan
    const planKey = plan.toLowerCase() as keyof typeof PLAN_PRICES;
    if (!PLAN_PRICES[planKey]) {
      console.error("[CREATE-CHECKOUT] Invalid plan:", plan);
      return new Response(
        JSON.stringify({ error: "Plano inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const planPrices = PLAN_PRICES[planKey];
    const priceId = (billingPeriod === "yearly" ? planPrices.yearly : planPrices.monthly) || planPrices.monthly;
    console.log("[CREATE-CHECKOUT] Selected price:", priceId);

    // Initialize Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[CREATE-CHECKOUT] STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Stripe não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer already exists
    const customers = await stripe.customers.list({ email: adminEmail, limit: 1 });
    let customerId: string | undefined;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("[CREATE-CHECKOUT] Found existing customer:", customerId);
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://miauchat.com.br";

    // Create checkout session with metadata for provisioning
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : adminEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#planos`,
      metadata: {
        plan: planKey,
        billing_period: billingPeriod,
        company_name: companyName,
        admin_name: adminName,
        admin_email: adminEmail,
        admin_phone: adminPhone || "",
        document: document || "",
      },
      subscription_data: {
        metadata: {
          plan: planKey,
          company_name: companyName,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      phone_number_collection: {
        enabled: true,
      },
    });

    console.log("[CREATE-CHECKOUT] Session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("[CREATE-CHECKOUT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao criar sessão de checkout";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
