import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Get Billing Status (Stripe)
 * 
 * Fetches overdue and pending invoices from Stripe and enriches them with company data.
 * Used by the Global Admin Payments dashboard to track delinquent companies.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BillingStatusResponse {
  summary: {
    totalOverdue: number;
    totalPending: number;
    totalAmountOverdue: number;
    totalAmountPending: number;
    totalActive: number;
  };
  overdue: PaymentRecord[];
  pending: PaymentRecord[];
  upcomingThisWeek: PaymentRecord[];
}

interface PaymentRecord {
  paymentId: string;
  customerId: string;
  companyId: string | null;
  companyName: string;
  planName: string;
  value: number;
  dueDate: string;
  daysOverdue: number;
  daysUntilDue: number;
  invoiceUrl: string | null;
  status: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      console.error("[get-billing-status] STRIPE_SECRET_KEY not configured");
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
    
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const userId = user.id;

    // Check if user is a global admin
    const { data: adminRole } = await supabase.rpc('is_admin', { _user_id: userId });

    if (!adminRole) {
      console.warn(`[get-billing-status] Unauthorized access attempt by user: ${userId}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores globais." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    console.log(`[get-billing-status] Admin ${userId} fetching billing status`);

    // Fetch company mappings for enrichment
    const { data: subscriptions } = await supabase
      .from("company_subscriptions")
      .select(`
        company_id,
        stripe_customer_id,
        companies(id, name, plan:plans(name))
      `);

    // Create lookup map: customer_id -> company info
    const customerToCompany = new Map<string, { id: string; name: string; planName: string }>();
    if (subscriptions) {
      for (const sub of subscriptions) {
        if (sub.stripe_customer_id && sub.companies) {
          const company = sub.companies as unknown as { id: string; name: string; plan: { name: string } | null };
          customerToCompany.set(sub.stripe_customer_id, {
            id: company.id,
            name: company.name,
            planName: company.plan?.name || "-",
          });
        }
      }
    }

    // Helper to calculate days difference
    const daysDiff = (timestamp: number, fromNow = true): number => {
      const date = new Date(timestamp * 1000);
      const now = new Date();
      const diffTime = fromNow ? now.getTime() - date.getTime() : date.getTime() - now.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    // Fetch overdue invoices (past_due status)
    const overdueInvoices = await stripe.invoices.list({
      status: "open",
      limit: 100,
    });

    // Process overdue invoices (due date in the past)
    const now = new Date();
    const overduePayments: PaymentRecord[] = [];
    const pendingPayments: PaymentRecord[] = [];
    const upcomingThisWeek: PaymentRecord[] = [];

    const weekFromNow = new Date();
    weekFromNow.setDate(now.getDate() + 7);

    for (const invoice of overdueInvoices.data) {
      const dueDate = invoice.due_date ? new Date(invoice.due_date * 1000) : new Date(invoice.created * 1000);
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || "";
      const companyInfo = customerToCompany.get(customerId);
      
      const record: PaymentRecord = {
        paymentId: invoice.id,
        customerId,
        companyId: companyInfo?.id || null,
        companyName: companyInfo?.name || invoice.customer_name || "Desconhecido",
        planName: companyInfo?.planName || "-",
        value: (invoice.amount_due || 0) / 100, // Stripe uses cents
        dueDate: dueDate.toISOString().split('T')[0],
        daysOverdue: dueDate < now ? daysDiff(dueDate.getTime() / 1000, true) : 0,
        daysUntilDue: dueDate >= now ? daysDiff(dueDate.getTime() / 1000, false) : 0,
        invoiceUrl: invoice.hosted_invoice_url || null,
        status: dueDate < now ? "OVERDUE" : "PENDING",
      };

      if (dueDate < now) {
        overduePayments.push(record);
      } else if (dueDate <= weekFromNow) {
        upcomingThisWeek.push(record);
      } else {
        pendingPayments.push(record);
      }
    }

    console.log(`[get-billing-status] Found invoices: ${overduePayments.length} overdue, ${upcomingThisWeek.length} upcoming, ${pendingPayments.length} pending`);

    // Sort: overdue by days (most overdue first), upcoming by days until (soonest first)
    overduePayments.sort((a, b) => b.daysOverdue - a.daysOverdue);
    upcomingThisWeek.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    pendingPayments.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    // Calculate summary
    const totalAmountOverdue = overduePayments.reduce((sum, p) => sum + p.value, 0);
    const totalAmountPending = [...pendingPayments, ...upcomingThisWeek].reduce((sum, p) => sum + p.value, 0);

    // Count active subscriptions
    const { count: activeCount } = await supabase
      .from("company_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    const response: BillingStatusResponse = {
      summary: {
        totalOverdue: overduePayments.length,
        totalPending: pendingPayments.length + upcomingThisWeek.length,
        totalAmountOverdue,
        totalAmountPending,
        totalActive: activeCount || 0,
      },
      overdue: overduePayments,
      pending: pendingPayments,
      upcomingThisWeek,
    };

    console.log(`[get-billing-status] Response summary:`, response.summary);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[get-billing-status] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao buscar status de cobrança";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
