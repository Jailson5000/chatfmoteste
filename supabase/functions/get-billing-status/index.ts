import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Get Billing Status
 * 
 * Fetches overdue and pending payments from ASAAS and enriches them with company data.
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
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

    if (!asaasApiKey) {
      console.error("[get-billing-status] ASAAS_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Sistema de pagamento não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      console.warn(`[get-billing-status] Unauthorized access attempt by user: ${userId}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores globais." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    console.log(`[get-billing-status] Admin ${userId} fetching billing status`);

    const asaasBaseUrl = "https://api.asaas.com/v3";

    // Fetch company mappings for enrichment
    const { data: subscriptions } = await supabase
      .from("company_subscriptions")
      .select(`
        company_id,
        asaas_customer_id,
        companies(id, name, plan:plans(name))
      `);

    // Create lookup map: customer_id -> company info
    const customerToCompany = new Map<string, { id: string; name: string; planName: string }>();
    if (subscriptions) {
      for (const sub of subscriptions) {
        if (sub.asaas_customer_id && sub.companies) {
          const company = sub.companies as unknown as { id: string; name: string; plan: { name: string } | null };
          customerToCompany.set(sub.asaas_customer_id, {
            id: company.id,
            name: company.name,
            planName: company.plan?.name || "-",
          });
        }
      }
    }

    // Fetch overdue payments from ASAAS
    const overdueResponse = await fetch(
      `${asaasBaseUrl}/payments?status=OVERDUE&limit=100`,
      {
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
      }
    );
    const overdueData = await overdueResponse.json();
    console.log(`[get-billing-status] Overdue payments: ${overdueData.data?.length || 0}`);

    // Fetch pending payments from ASAAS
    const pendingResponse = await fetch(
      `${asaasBaseUrl}/payments?status=PENDING&limit=100`,
      {
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
      }
    );
    const pendingData = await pendingResponse.json();
    console.log(`[get-billing-status] Pending payments: ${pendingData.data?.length || 0}`);

    // Helper to calculate days difference
    const daysDiff = (dateStr: string, fromNow = true): number => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffTime = fromNow ? now.getTime() - date.getTime() : date.getTime() - now.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    // Process overdue payments
    const overduePayments: PaymentRecord[] = (overdueData.data || []).map((p: Record<string, unknown>) => {
      const companyInfo = customerToCompany.get(p.customer as string);
      return {
        paymentId: p.id as string,
        customerId: p.customer as string,
        companyId: companyInfo?.id || null,
        companyName: companyInfo?.name || "Desconhecido",
        planName: companyInfo?.planName || "-",
        value: p.value as number,
        dueDate: p.dueDate as string,
        daysOverdue: daysDiff(p.dueDate as string, true),
        daysUntilDue: 0,
        invoiceUrl: p.invoiceUrl as string | null,
        status: "OVERDUE",
      };
    });

    // Process pending payments - split into upcoming this week and others
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);

    const pendingPayments: PaymentRecord[] = [];
    const upcomingThisWeek: PaymentRecord[] = [];

    for (const p of (pendingData.data || [])) {
      const companyInfo = customerToCompany.get(p.customer as string);
      const dueDate = new Date(p.dueDate as string);
      const daysUntil = daysDiff(p.dueDate as string, false);
      
      const record: PaymentRecord = {
        paymentId: p.id as string,
        customerId: p.customer as string,
        companyId: companyInfo?.id || null,
        companyName: companyInfo?.name || "Desconhecido",
        planName: companyInfo?.planName || "-",
        value: p.value as number,
        dueDate: p.dueDate as string,
        daysOverdue: 0,
        daysUntilDue: daysUntil,
        invoiceUrl: p.invoiceUrl as string | null,
        status: "PENDING",
      };

      if (dueDate <= weekFromNow && dueDate >= today) {
        upcomingThisWeek.push(record);
      } else {
        pendingPayments.push(record);
      }
    }

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
