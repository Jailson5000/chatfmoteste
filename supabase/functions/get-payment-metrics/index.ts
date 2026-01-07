import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[PAYMENT-METRICS] Fetching payment metrics");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get active payment provider
    const { data: providerSetting } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "payment_provider")
      .single();

    const activeProvider = String(providerSetting?.value || "stripe").replace(/"/g, "");

    // Initialize metrics
    const metrics = {
      activeProvider,
      stripe: {
        connected: false,
        mrr: 0,
        arr: 0,
        activeSubscriptions: 0,
        totalCustomers: 0,
        recentPayments: [] as any[],
        subscriptionsByPlan: {} as Record<string, number>,
      },
      asaas: {
        connected: false,
        mrr: 0,
        arr: 0,
        activeSubscriptions: 0,
        totalCustomers: 0,
        recentPayments: [] as any[],
        subscriptionsByPlan: {} as Record<string, number>,
      },
    };

    // Fetch Stripe metrics
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        metrics.stripe.connected = true;

        // Get active subscriptions
        const subscriptions = await stripe.subscriptions.list({
          status: "active",
          limit: 100,
        });

        metrics.stripe.activeSubscriptions = subscriptions.data.length;

        // Calculate MRR
        let monthlyRevenue = 0;
        for (const sub of subscriptions.data) {
          for (const item of sub.items.data) {
            const price = item.price;
            let amount = price.unit_amount || 0;
            
            if (price.recurring?.interval === "year") {
              amount = amount / 12;
            } else if (price.recurring?.interval === "week") {
              amount = amount * 4.33;
            } else if (price.recurring?.interval === "day") {
              amount = amount * 30;
            }
            
            monthlyRevenue += amount;

            // Count by plan
            const productId = typeof price.product === "string" ? price.product : price.product?.id;
            if (productId) {
              const planName = productId.includes("starter") ? "Starter" :
                             productId.includes("professional") ? "Professional" :
                             productId.includes("enterprise") ? "Enterprise" : "Outro";
              metrics.stripe.subscriptionsByPlan[planName] = (metrics.stripe.subscriptionsByPlan[planName] || 0) + 1;
            }
          }
        }

        metrics.stripe.mrr = monthlyRevenue / 100; // Convert from cents
        metrics.stripe.arr = metrics.stripe.mrr * 12;

        // Get total customers
        const customers = await stripe.customers.list({ limit: 1 });
        metrics.stripe.totalCustomers = customers.data.length > 0 ? 
          (await stripe.customers.list({ limit: 100 })).data.length : 0;

        // Get recent payments
        const charges = await stripe.charges.list({
          limit: 10,
        });

        metrics.stripe.recentPayments = charges.data.map((charge: Stripe.Charge) => ({
          id: charge.id,
          amount: (charge.amount || 0) / 100,
          currency: charge.currency?.toUpperCase() || "BRL",
          status: charge.status,
          customerEmail: charge.billing_details?.email || charge.receipt_email,
          createdAt: new Date(charge.created * 1000).toISOString(),
          description: charge.description,
        }));

        console.log("[PAYMENT-METRICS] Stripe metrics fetched successfully");
      } catch (stripeError) {
        console.error("[PAYMENT-METRICS] Stripe error:", stripeError);
      }
    }

    // Fetch ASAAS metrics
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (asaasKey) {
      try {
        const asaasBaseUrl = "https://api.asaas.com/v3";
        metrics.asaas.connected = true;

        // Get subscriptions
        const subsResponse = await fetch(`${asaasBaseUrl}/subscriptions?status=ACTIVE&limit=100`, {
          headers: { "access_token": asaasKey },
        });
        const subsData = await subsResponse.json();

        if (subsData.data) {
          metrics.asaas.activeSubscriptions = subsData.data.length;

          let monthlyRevenue = 0;
          for (const sub of subsData.data) {
            let amount = sub.value || 0;
            
            if (sub.cycle === "YEARLY") {
              amount = amount / 12;
            } else if (sub.cycle === "WEEKLY") {
              amount = amount * 4.33;
            }
            
            monthlyRevenue += amount;

            // Try to identify plan from description or value
            let planName = "Outro";
            if (sub.description?.toLowerCase().includes("starter") || sub.value === 297) {
              planName = "Starter";
            } else if (sub.description?.toLowerCase().includes("professional") || sub.value === 697) {
              planName = "Professional";
            } else if (sub.description?.toLowerCase().includes("enterprise") || sub.value === 1497) {
              planName = "Enterprise";
            }
            metrics.asaas.subscriptionsByPlan[planName] = (metrics.asaas.subscriptionsByPlan[planName] || 0) + 1;
          }

          metrics.asaas.mrr = monthlyRevenue;
          metrics.asaas.arr = monthlyRevenue * 12;
        }

        // Get customers
        const customersResponse = await fetch(`${asaasBaseUrl}/customers?limit=100`, {
          headers: { "access_token": asaasKey },
        });
        const customersData = await customersResponse.json();
        metrics.asaas.totalCustomers = customersData.data?.length || 0;

        // Get recent payments
        const paymentsResponse = await fetch(`${asaasBaseUrl}/payments?limit=10`, {
          headers: { "access_token": asaasKey },
        });
        const paymentsData = await paymentsResponse.json();

        if (paymentsData.data) {
          metrics.asaas.recentPayments = paymentsData.data.map((payment: any) => ({
            id: payment.id,
            amount: payment.value || 0,
            currency: "BRL",
            status: payment.status,
            customerEmail: payment.customer,
            createdAt: payment.dateCreated,
            description: payment.description,
          }));
        }

        console.log("[PAYMENT-METRICS] ASAAS metrics fetched successfully");
      } catch (asaasError) {
        console.error("[PAYMENT-METRICS] ASAAS error:", asaasError);
      }
    }

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    console.error("[PAYMENT-METRICS] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao buscar métricas";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
