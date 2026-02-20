import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validate admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is a global admin
    const { data: adminRole } = await supabase
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Fetch all subscriptions with stripe_subscription_id
    const { data: subscriptions, error: dbError } = await supabase
      .from("company_subscriptions")
      .select("id, stripe_subscription_id, company_id, status")
      .not("stripe_subscription_id", "is", null);

    if (dbError) {
      throw new Error(`DB error: ${dbError.message}`);
    }

    console.log(`[SYNC-STRIPE] Found ${subscriptions?.length ?? 0} subscriptions to sync`);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const sub of subscriptions ?? []) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id!);

        const currentPeriodStart = new Date(stripeSub.current_period_start * 1000).toISOString();
        const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

        const { error: updateError } = await supabase
          .from("company_subscriptions")
          .update({
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            next_payment_at: currentPeriodEnd,
            status: stripeSub.status === "active" ? "active" :
                    stripeSub.status === "canceled" ? "canceled" :
                    stripeSub.status === "past_due" ? "past_due" : sub.status,
          })
          .eq("id", sub.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        synced++;
        console.log(`[SYNC-STRIPE] Synced sub ${sub.stripe_subscription_id} → ends ${currentPeriodEnd}`);
      } catch (err: any) {
        failed++;
        const msg = `${sub.stripe_subscription_id}: ${err.message}`;
        errors.push(msg);
        console.error(`[SYNC-STRIPE] Failed to sync ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: subscriptions?.length ?? 0,
        synced,
        failed,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[SYNC-STRIPE] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message ?? "Erro ao sincronizar" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
