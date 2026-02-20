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

    // Initialize metrics
    const metrics = {
      activeProvider: "stripe",
      stripe: {
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

        // Calculate MRR — fetch product names in batch to avoid N+1
        const productIds = new Set<string>();
        for (const sub of subscriptions.data) {
          for (const item of sub.items.data) {
            const pid = typeof item.price.product === "string" ? item.price.product : item.price.product?.id;
            if (pid) productIds.add(pid);
          }
        }

        // Fetch all product names at once
        const productNameMap: Record<string, string> = {};
        for (const pid of productIds) {
          try {
            const product = await stripe.products.retrieve(pid);
            productNameMap[pid] = product.name || "Outro";
          } catch {
            productNameMap[pid] = "Outro";
          }
        }

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

            // Count by real product name from Stripe
            const productId = typeof price.product === "string" ? price.product : price.product?.id;
            if (productId) {
              const planName = productNameMap[productId] || "Outro";
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
