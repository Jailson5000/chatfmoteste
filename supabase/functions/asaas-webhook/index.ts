import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * ASAAS Webhook Handler
 * 
 * Receives payment events from ASAAS and updates company status accordingly.
 * 
 * Events handled:
 * - PAYMENT_CONFIRMED: Activates company, removes trial block
 * - PAYMENT_RECEIVED: Updates last payment date
 * - PAYMENT_OVERDUE: Marks company as overdue
 * - SUBSCRIPTION_CANCELLED: Handles cancellation
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

interface AsaasPaymentEvent {
  event: string;
  payment?: {
    id: string;
    customer: string;
    subscription?: string;
    value: number;
    status: string;
    externalReference?: string;
    confirmedDate?: string;
    paymentDate?: string;
  };
  subscription?: {
    id: string;
    customer: string;
    status: string;
    externalReference?: string;
  };
}

// Helper to extract value from externalReference
function extractFromReference(ref: string, key: string): string | null {
  // Format: "key:value;key2:value2" or "key:value"
  const regex = new RegExp(`${key}[:|]([^;]+)`, 'i');
  const match = ref.match(regex);
  return match ? match[1].trim() : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Optional: Validate webhook token if configured
    if (webhookToken) {
      const receivedToken = req.headers.get("asaas-access-token");
      if (receivedToken !== webhookToken) {
        console.warn("[asaas-webhook] Invalid token received");
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }
    }

    const body: AsaasPaymentEvent = await req.json();
    const { event, payment, subscription } = body;

    console.log("[asaas-webhook] Received event:", event, JSON.stringify(body).slice(0, 500));

    // Parse company ID from externalReference with multiple fallback strategies
    let companyId: string | null = null;
    let identifiedVia = "unknown";
    const externalRef = payment?.externalReference || subscription?.externalReference;
    
    console.log("[asaas-webhook] Parsing externalReference:", externalRef);
    
    if (externalRef) {
      // Strategy 1: Direct company ID (format: "company:uuid" or "company_uuid")
      const companyMatch = externalRef.match(/company[_:|]([a-f0-9-]+)/i);
      if (companyMatch) {
        companyId = companyMatch[1];
        identifiedVia = "company_ref";
        console.log("[asaas-webhook] Found company from externalReference:", companyId);
      }
      
      // Strategy 2: Email lookup (format: "email:user@example.com;...")
      if (!companyId) {
        const email = extractFromReference(externalRef, "email");
        if (email) {
          console.log("[asaas-webhook] Looking up company by email:", email);
          
          // Find company by admin email
          const { data: companyData } = await supabase
            .from("companies")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          
          if (companyData) {
            companyId = companyData.id;
            identifiedVia = "email_lookup";
            console.log("[asaas-webhook] Found company by email:", companyId);
          }
        }
      }
    }

    // Strategy 3: Fallback to ASAAS customer ID lookup
    if (!companyId && payment?.customer) {
      console.log("[asaas-webhook] Looking up by asaas_customer_id:", payment.customer);
      
      const { data: subData } = await supabase
        .from("company_subscriptions")
        .select("company_id")
        .eq("asaas_customer_id", payment.customer)
        .maybeSingle();
      
      if (subData) {
        companyId = subData.company_id;
        identifiedVia = "asaas_customer";
        console.log("[asaas-webhook] Found company by asaas_customer_id:", companyId);
      }
    }

    if (!companyId) {
      console.warn("[asaas-webhook] Could not identify company from event", {
        externalRef,
        customerId: payment?.customer,
      });
      // Don't return error - ASAAS might retry
      return new Response(
        JSON.stringify({ received: true, warning: "Company not identified" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    
    console.log("[asaas-webhook] Identified company:", companyId, "via:", identifiedVia);

    console.log("[asaas-webhook] Processing event for company:", companyId);

    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        // Update subscription status
        await supabase
          .from("company_subscriptions")
          .update({
            status: "active",
            last_payment_at: payment?.confirmedDate || payment?.paymentDate || new Date().toISOString(),
            asaas_subscription_id: payment?.subscription || null,
            current_period_start: new Date().toISOString(),
            // Set next period end based on billing cycle
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("company_id", companyId);

        // Activate company - remove trial block
        const { error: companyError } = await supabase
          .from("companies")
          .update({
            approval_status: "approved",
            trial_type: "paid", // Mark as paid user
            // Don't clear trial_ends_at so we have historical data
          })
          .eq("id", companyId);

        if (companyError) {
          console.error("[asaas-webhook] Error updating company:", companyError);
        } else {
          console.log("[asaas-webhook] Company activated successfully:", companyId);
        }

        // Log the event
        await supabase.from("audit_logs").insert({
          action: "PAYMENT_CONFIRMED",
          entity_type: "company",
          entity_id: companyId,
          new_values: {
            event,
            payment_id: payment?.id,
            value: payment?.value,
            subscription_id: payment?.subscription,
            timestamp: new Date().toISOString(),
          },
        });

        break;
      }

      case "PAYMENT_OVERDUE": {
        // Update subscription status
        await supabase
          .from("company_subscriptions")
          .update({
            status: "overdue",
          })
          .eq("company_id", companyId);

        // Optionally block company access
        // For now, just log - implement blocking logic as needed
        console.log("[asaas-webhook] Payment overdue for company:", companyId);

        await supabase.from("audit_logs").insert({
          action: "PAYMENT_OVERDUE",
          entity_type: "company",
          entity_id: companyId,
          new_values: {
            event,
            payment_id: payment?.id,
            value: payment?.value,
            timestamp: new Date().toISOString(),
          },
        });

        break;
      }

      case "SUBSCRIPTION_CANCELLED": {
        await supabase
          .from("company_subscriptions")
          .update({
            status: "cancelled",
          })
          .eq("company_id", companyId);

        console.log("[asaas-webhook] Subscription cancelled for company:", companyId);

        await supabase.from("audit_logs").insert({
          action: "SUBSCRIPTION_CANCELLED",
          entity_type: "company",
          entity_id: companyId,
          new_values: {
            event,
            subscription_id: subscription?.id,
            timestamp: new Date().toISOString(),
          },
        });

        break;
      }

      default:
        console.log("[asaas-webhook] Unhandled event type:", event);
    }

    return new Response(
      JSON.stringify({ received: true, event, company_id: companyId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[asaas-webhook] Error:", error);
    // Return 200 to prevent ASAAS from retrying
    return new Response(
      JSON.stringify({ received: true, error: "Processing error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
