import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * List ASAAS Invoices
 * 
 * Fetches invoices (payments) from ASAAS for the authenticated company.
 * Returns both pending and confirmed payments.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  netValue: number;
  billingType: string;
  status: string;
  description: string;
  dueDate: string;
  paymentDate: string | null;
  confirmedDate: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  invoiceNumber: string | null;
  externalReference: string | null;
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
      console.error("[list-asaas-invoices] ASAAS_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Sistema de pagamento não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Get company and subscription data
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name")
      .eq("law_firm_id", profile.law_firm_id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Get ASAAS customer ID from subscription
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("asaas_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (!subscription?.asaas_customer_id) {
      console.log("[list-asaas-invoices] No ASAAS customer for company:", company.id);
      return new Response(
        JSON.stringify({ 
          invoices: [],
          message: "Nenhuma fatura encontrada. Você ainda não possui uma assinatura ativa."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const asaasBaseUrl = "https://api.asaas.com/v3";
    const customerId = subscription.asaas_customer_id;

    console.log("[list-asaas-invoices] Fetching payments for customer:", customerId);

    // Fetch payments from ASAAS
    const paymentsResponse = await fetch(
      `${asaasBaseUrl}/payments?customer=${customerId}&limit=12&offset=0`,
      {
        headers: {
          "access_token": asaasApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentsData = await paymentsResponse.json();

    if (paymentsData.errors) {
      console.error("[list-asaas-invoices] ASAAS error:", paymentsData.errors);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar faturas: " + paymentsData.errors[0]?.description }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Map payments to invoice format
    const invoices = (paymentsData.data || []).map((payment: AsaasPayment) => {
      // Determine status label in Portuguese
      let statusLabel = "Pendente";
      let statusColor = "yellow";
      
      switch (payment.status) {
        case "CONFIRMED":
        case "RECEIVED":
        case "RECEIVED_IN_CASH":
          statusLabel = "Pago";
          statusColor = "green";
          break;
        case "PENDING":
          statusLabel = "Pendente";
          statusColor = "yellow";
          break;
        case "OVERDUE":
          statusLabel = "Vencido";
          statusColor = "red";
          break;
        case "REFUNDED":
          statusLabel = "Reembolsado";
          statusColor = "gray";
          break;
        case "REFUND_REQUESTED":
          statusLabel = "Reembolso Solicitado";
          statusColor = "gray";
          break;
        case "CHARGEBACK_REQUESTED":
        case "CHARGEBACK_DISPUTE":
          statusLabel = "Contestação";
          statusColor = "orange";
          break;
        case "AWAITING_CHARGEBACK_REVERSAL":
          statusLabel = "Aguardando Reversão";
          statusColor = "orange";
          break;
        case "DUNNING_REQUESTED":
        case "DUNNING_RECEIVED":
          statusLabel = "Negativado";
          statusColor = "red";
          break;
        case "AWAITING_RISK_ANALYSIS":
          statusLabel = "Em Análise";
          statusColor = "blue";
          break;
      }

      // Get billing type label
      let billingTypeLabel = payment.billingType;
      switch (payment.billingType) {
        case "BOLETO": billingTypeLabel = "Boleto"; break;
        case "CREDIT_CARD": billingTypeLabel = "Cartão"; break;
        case "PIX": billingTypeLabel = "PIX"; break;
        case "UNDEFINED": billingTypeLabel = "Pendente"; break;
      }

      return {
        id: payment.id,
        value: payment.value,
        netValue: payment.netValue,
        billingType: billingTypeLabel,
        status: payment.status,
        statusLabel,
        statusColor,
        description: payment.description || "Assinatura MiauChat",
        dueDate: payment.dueDate,
        paymentDate: payment.paymentDate || payment.confirmedDate,
        invoiceUrl: payment.invoiceUrl,
        bankSlipUrl: payment.bankSlipUrl,
        invoiceNumber: payment.invoiceNumber,
      };
    });

    console.log("[list-asaas-invoices] Found", invoices.length, "invoices");

    return new Response(
      JSON.stringify({
        invoices,
        total: paymentsData.totalCount || invoices.length,
        hasMore: paymentsData.hasMore || false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[list-asaas-invoices] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao buscar faturas";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
