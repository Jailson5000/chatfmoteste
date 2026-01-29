import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Generate Payment Link
 * 
 * Creates an ASAAS payment link for an existing company.
 * Used by trial users to subscribe or by expired trial users to pay.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

    if (!asaasApiKey) {
      console.error("[generate-payment-link] ASAAS_API_KEY not configured");
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

    // Get company data
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(`
        *,
        plan:plans!companies_plan_id_fkey(id, name, price, billing_period)
      `)
      .eq("law_firm_id", profile.law_firm_id)
      .single();

    if (companyError || !company) {
      console.error("[generate-payment-link] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!company.plan) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui plano selecionado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { billing_type = "monthly" } = await req.json().catch(() => ({}));

    console.log("[generate-payment-link] Generating link for company:", company.id, "plan:", company.plan.name);

    const asaasBaseUrl = "https://api.asaas.com/v3";

    // Check or create ASAAS customer
    let customerId: string | null = null;

    // Check existing subscription record
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("asaas_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (subscription?.asaas_customer_id) {
      customerId = subscription.asaas_customer_id;
      console.log("[generate-payment-link] Using existing ASAAS customer:", customerId);
    } else {
      // Search by email
      const searchResponse = await fetch(
        `${asaasBaseUrl}/customers?email=${encodeURIComponent(company.email)}`,
        {
          headers: {
            "access_token": asaasApiKey,
            "Content-Type": "application/json",
          },
        }
      );

      const searchData = await searchResponse.json();
      
      if (searchData.data && searchData.data.length > 0) {
        customerId = searchData.data[0].id;
        console.log("[generate-payment-link] Found ASAAS customer by email:", customerId);
      } else {
        // Create new customer
        const customerPayload = {
          name: company.name,
          email: company.email,
          phone: company.phone?.replace(/\D/g, "") || undefined,
          cpfCnpj: company.document?.replace(/\D/g, "") || undefined,
          externalReference: `company_${company.id}`,
        };

        const createResponse = await fetch(`${asaasBaseUrl}/customers`, {
          method: "POST",
          headers: {
            "access_token": asaasApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(customerPayload),
        });

        const customerData = await createResponse.json();

        if (customerData.errors) {
          console.error("[generate-payment-link] ASAAS customer error:", customerData.errors);
          return new Response(
            JSON.stringify({ error: "Erro ao criar cliente: " + customerData.errors[0]?.description }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        customerId = customerData.id;
        console.log("[generate-payment-link] Created ASAAS customer:", customerId);
      }

      // Save or update subscription record
      await supabase
        .from("company_subscriptions")
        .upsert({
          company_id: company.id,
          asaas_customer_id: customerId,
          plan_id: company.plan.id,
          billing_type,
          status: "pending",
        }, { onConflict: "company_id" });
    }

    // Calculate price
    const monthlyPrice = company.plan.price || 0;
    const yearlyPrice = monthlyPrice * 11; // 11 months (1 free)
    const priceInReais = billing_type === "yearly" ? yearlyPrice : monthlyPrice;

    // Create payment link
    // NOTE: ASAAS externalReference has a max length of 100 characters
    const origin = req.headers.get("origin") || "https://miauchat.com.br";
    const externalReference = `company:${company.id}`.slice(0, 100);

    const paymentLinkPayload = {
      name: `${company.plan.name} - ${billing_type === "yearly" ? "Anual" : "Mensal"}`,
      description: `Assinatura MiauChat ${company.plan.name}`,
      value: priceInReais,
      billingType: "UNDEFINED", // Customer chooses payment method
      chargeType: "RECURRENT",
      subscriptionCycle: billing_type === "yearly" ? "YEARLY" : "MONTHLY",
      dueDateLimitDays: 7,
      externalReference,
      callback: {
        successUrl: `${origin}/payment-success?provider=asaas&company_id=${company.id}`,
        autoRedirect: true,
      },
    };

    console.log("[generate-payment-link] Creating payment link:", paymentLinkPayload.name);

    const paymentLinkResponse = await fetch(`${asaasBaseUrl}/paymentLinks`, {
      method: "POST",
      headers: {
        "access_token": asaasApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentLinkPayload),
    });

    const paymentLinkData = await paymentLinkResponse.json();

    if (paymentLinkData.errors) {
      console.error("[generate-payment-link] Payment link error:", paymentLinkData.errors);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar link: " + paymentLinkData.errors[0]?.description }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("[generate-payment-link] Payment link created:", paymentLinkData.url);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentLinkData.url,
        plan_name: company.plan.name,
        price: priceInReais,
        billing_type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[generate-payment-link] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao gerar link de pagamento";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
