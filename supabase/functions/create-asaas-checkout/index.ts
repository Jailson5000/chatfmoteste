import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plan prices in cents (BRL)
const PLAN_PRICES = {
  starter: {
    monthly: 29700, // R$ 297,00
    yearly: 326700, // R$ 3.267,00 (11 meses)
  },
  professional: {
    monthly: 69700, // R$ 697,00
    yearly: 766700, // R$ 7.667,00 (11 meses)
  },
  enterprise: {
    monthly: 149700, // R$ 1.497,00
    yearly: 1646700, // R$ 16.467,00 (11 meses)
  },
};

const PLAN_NAMES = {
  starter: "MiauChat Starter",
  professional: "MiauChat Professional",
  enterprise: "MiauChat Enterprise",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[ASAAS-CHECKOUT] Starting checkout session creation");

    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasApiKey) {
      console.error("[ASAAS-CHECKOUT] ASAAS_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "ASAAS não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const {
      plan,
      billingPeriod = "monthly",
      companyName,
      adminName,
      adminEmail,
      adminPhone,
      document,
    } = await req.json();

    console.log("[ASAAS-CHECKOUT] Request data:", { plan, billingPeriod, companyName, adminEmail });

    // Validate required fields
    if (!plan || !companyName || !adminName || !adminEmail) {
      console.error("[ASAAS-CHECKOUT] Missing required fields");
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios não preenchidos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate plan
    const planKey = plan.toLowerCase() as keyof typeof PLAN_PRICES;
    if (!PLAN_PRICES[planKey]) {
      console.error("[ASAAS-CHECKOUT] Invalid plan:", plan);
      return new Response(
        JSON.stringify({ error: "Plano inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const planPrices = PLAN_PRICES[planKey];
    const priceInCents = billingPeriod === "yearly" ? planPrices.yearly : planPrices.monthly;
    const priceInReais = priceInCents / 100;

    // ASAAS API base URL (production)
    const asaasBaseUrl = "https://api.asaas.com/v3";

    // 1. Check if customer exists or create new one
    let customerId: string | null = null;

    // Search for existing customer by email
    const searchResponse = await fetch(
      `${asaasBaseUrl}/customers?email=${encodeURIComponent(adminEmail)}`,
      {
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const searchData = await searchResponse.json();
    console.log("[ASAAS-CHECKOUT] Customer search result:", searchData);

    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
      console.log("[ASAAS-CHECKOUT] Found existing customer:", customerId);
    } else {
      // Create new customer
      const customerPayload = {
        name: adminName,
        email: adminEmail,
        phone: adminPhone?.replace(/\D/g, "") || undefined,
        cpfCnpj: document?.replace(/\D/g, "") || undefined,
        company: companyName,
        externalReference: `company_${companyName.toLowerCase().replace(/\s+/g, "_")}`.slice(0, 100),
      };

      const createCustomerResponse = await fetch(`${asaasBaseUrl}/customers`, {
        method: "POST",
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerPayload),
      });

      const customerData = await createCustomerResponse.json();
      console.log("[ASAAS-CHECKOUT] Created customer:", customerData);

      if (customerData.errors) {
        console.error("[ASAAS-CHECKOUT] Error creating customer:", customerData.errors);
        return new Response(
          JSON.stringify({ error: "Erro ao criar cliente no ASAAS: " + customerData.errors[0]?.description }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      customerId = customerData.id;
    }

    // 2. Create subscription with identifiable external reference
    // NOTE: ASAAS externalReference has a max length of 100 characters.
    const externalReference = `source:miauchat;plan:${planKey};period:${billingPeriod}`.slice(0, 100);

    const subscriptionPayload = {
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: priceInReais,
      nextDueDate: new Date().toISOString().split("T")[0],
      description: `MiauChat ${PLAN_NAMES[planKey]} - ${billingPeriod === "yearly" ? "Anual" : "Mensal"}`,
      cycle: billingPeriod === "yearly" ? "YEARLY" : "MONTHLY",
      externalReference,
    };

    console.log("[ASAAS-CHECKOUT] Creating subscription:", subscriptionPayload);

    const subscriptionResponse = await fetch(`${asaasBaseUrl}/subscriptions`, {
      method: "POST",
      headers: {
        "access_token": asaasApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscriptionPayload),
    });

    const subscriptionData = await subscriptionResponse.json();
    console.log("[ASAAS-CHECKOUT] Subscription created:", subscriptionData);

    if (subscriptionData.errors) {
      console.error("[ASAAS-CHECKOUT] Error creating subscription:", subscriptionData.errors);
      return new Response(
        JSON.stringify({ error: "Erro ao criar assinatura: " + subscriptionData.errors[0]?.description }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 3. Get payment link for first payment
    const paymentsResponse = await fetch(
      `${asaasBaseUrl}/subscriptions/${subscriptionData.id}/payments`,
      {
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentsData = await paymentsResponse.json();
    console.log("[ASAAS-CHECKOUT] Subscription payments:", paymentsData);

    let paymentUrl = null;
    if (paymentsData.data && paymentsData.data.length > 0) {
      const firstPayment = paymentsData.data[0];
      // Get invoice URL
      paymentUrl = `https://www.asaas.com/c/${firstPayment.id}`;
    }

    // Fallback: create a payment link
    if (!paymentUrl) {
      const origin = req.headers.get("origin") || "https://miauchat.com.br";
      
      const paymentLinkPayload = {
        name: `${PLAN_NAMES[planKey]} - ${billingPeriod === "yearly" ? "Anual" : "Mensal"}`,
        description: `Assinatura ${PLAN_NAMES[planKey]}`,
        value: priceInReais,
        billingType: "UNDEFINED", // Let customer choose
        subscriptionCycle: billingPeriod === "yearly" ? "YEARLY" : "MONTHLY",
        chargeType: "RECURRENT",
        dueDateLimitDays: 7,
        externalReference,
        callback: {
          successUrl: `${origin}/payment-success?provider=asaas&subscription_id=${subscriptionData.id}`,
          autoRedirect: true,
        },
      };

      const paymentLinkResponse = await fetch(`${asaasBaseUrl}/paymentLinks`, {
        method: "POST",
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentLinkPayload),
      });

      const paymentLinkData = await paymentLinkResponse.json();
      console.log("[ASAAS-CHECKOUT] Payment link created:", paymentLinkData);

      if (paymentLinkData.url) {
        paymentUrl = paymentLinkData.url;
      }
    }

    if (!paymentUrl) {
      // Final fallback
      paymentUrl = `https://www.asaas.com/c/${subscriptionData.id}`;
    }

    console.log("[ASAAS-CHECKOUT] Final payment URL:", paymentUrl);

    return new Response(
      JSON.stringify({
        url: paymentUrl,
        subscriptionId: subscriptionData.id,
        customerId: customerId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("[ASAAS-CHECKOUT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao criar sessão de checkout";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
