import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !webhookSecret) {
      logStep("ERROR: Missing Stripe configuration");
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      logStep("ERROR: Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Supabase not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Enhanced logging for debugging
    logStep("Request received", { 
      hasSignature: !!signature,
      signaturePreview: signature ? signature.substring(0, 30) + "..." : "none",
      bodyLength: body.length,
      webhookSecretConfigured: !!webhookSecret,
      webhookSecretPreview: webhookSecret ? webhookSecret.substring(0, 10) + "..." : "none"
    });

    if (!signature) {
      logStep("ERROR: Missing Stripe signature");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logStep("Signature verified successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logStep("ERROR: Signature verification failed", { 
        error: message,
        signaturePreview: signature.substring(0, 30) + "...",
        bodyPreview: body.substring(0, 100) + "..."
      });
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Event received", { type: event.type, id: event.id });

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout session completed", {
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          email: session.customer_email,
        });

        // Extract metadata
        const metadata = session.metadata || {};
        const companyId = metadata.company_id;
        const adminEmail = session.customer_email || metadata.admin_email;

        if (companyId) {
          // Update existing company with Stripe IDs
          const { error: updateError } = await supabase
            .from("company_subscriptions")
            .upsert({
              company_id: companyId,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              status: "active",
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "company_id"
            });

          if (updateError) {
            logStep("ERROR: Failed to update company subscription", { error: updateError });
          } else {
            logStep("Company subscription updated", { companyId });
          }

          // Update company status to active
          await supabase
            .from("companies")
            .update({ status: "active", updated_at: new Date().toISOString() })
            .eq("id", companyId);
        } else if (adminEmail) {
          // Find company by email
          const { data: company } = await supabase
            .from("companies")
            .select("id")
            .eq("email", adminEmail)
            .single();

          if (company) {
            await supabase
              .from("company_subscriptions")
              .upsert({
                company_id: company.id,
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string,
                status: "active",
                updated_at: new Date().toISOString(),
              }, {
                onConflict: "company_id"
              });

            logStep("Company subscription created from email", { companyId: company.id });
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice paid", {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          amountPaid: invoice.amount_paid,
        });

        // Find company by Stripe customer ID
        const { data: subscription } = await supabase
          .from("company_subscriptions")
          .select("company_id")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        if (subscription) {
          // Update company status to active
          await supabase
            .from("companies")
            .update({ 
              status: "active",
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.company_id);

          // Update subscription status
          await supabase
            .from("company_subscriptions")
            .update({ 
              status: "active",
              last_payment_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("company_id", subscription.company_id);

          logStep("Company marked as active after payment", { companyId: subscription.company_id });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice payment failed", {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          attemptCount: invoice.attempt_count,
        });

        // Find company by Stripe customer ID
        const { data: subscription } = await supabase
          .from("company_subscriptions")
          .select("company_id")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        if (subscription) {
          // Update subscription status to overdue
          await supabase
            .from("company_subscriptions")
            .update({ 
              status: "overdue",
              updated_at: new Date().toISOString()
            })
            .eq("company_id", subscription.company_id);

          // If too many failures, suspend company
          if (invoice.attempt_count && invoice.attempt_count >= 3) {
            await supabase
              .from("companies")
              .update({ 
                status: "suspended",
                updated_at: new Date().toISOString()
              })
              .eq("id", subscription.company_id);

            logStep("Company suspended after payment failures", { 
              companyId: subscription.company_id,
              attempts: invoice.attempt_count 
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription updated", {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
        });

        // Find company by Stripe subscription ID
        const { data: companySubscription } = await supabase
          .from("company_subscriptions")
          .select("company_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (companySubscription) {
          // Map Stripe status to our status
          let newStatus = "active";
          if (subscription.status === "past_due") newStatus = "overdue";
          if (subscription.status === "canceled") newStatus = "cancelled";
          if (subscription.status === "unpaid") newStatus = "suspended";

          await supabase
            .from("company_subscriptions")
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("company_id", companySubscription.company_id);

          logStep("Subscription status updated", { 
            companyId: companySubscription.company_id,
            newStatus 
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted", {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
        });

        // Find company by Stripe subscription ID
        const { data: companySubscription } = await supabase
          .from("company_subscriptions")
          .select("company_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (companySubscription) {
          // Mark subscription as cancelled
          await supabase
            .from("company_subscriptions")
            .update({ 
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("company_id", companySubscription.company_id);

          // Suspend the company
          await supabase
            .from("companies")
            .update({ 
              status: "suspended",
              updated_at: new Date().toISOString()
            })
            .eq("id", companySubscription.company_id);

          logStep("Company suspended after subscription cancellation", { 
            companyId: companySubscription.company_id 
          });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(
      JSON.stringify({ received: true, type: event.type }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR: Unhandled exception", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
