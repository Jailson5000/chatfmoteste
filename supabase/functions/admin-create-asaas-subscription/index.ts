import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Admin Create ASAAS Subscription
 * 
 * Allows global admins to generate ASAAS invoices/subscriptions for existing companies.
 * This is useful for companies that were created before ASAAS integration or for manual billing.
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
      console.error("[admin-create-asaas-subscription] ASAAS_API_KEY not configured");
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
    const { data: adminRole } = await supabase
      .rpc('is_admin', { _user_id: userId });

    if (!adminRole) {
      console.warn(`[admin-create-asaas-subscription] Unauthorized access attempt by user: ${userId}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores globais." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Parse request body
    const { company_id, billing_type = "monthly" } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`[admin-create-asaas-subscription] Admin ${userId} creating subscription for company ${company_id}`);

    // Get company data with plan
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(`
        *,
        plan:plans!companies_plan_id_fkey(id, name, price, billing_period)
      `)
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      console.error("[admin-create-asaas-subscription] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!company.plan) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui plano selecionado. Atribua um plano antes de gerar cobrança." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get email: prefer company.email, fallback to admin user email from law_firm
    let billingEmail = company.email;
    
    if (!billingEmail && company.law_firm_id) {
      // Try to get the admin user's email from profiles
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("law_firm_id", company.law_firm_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (adminProfile?.email) {
        billingEmail = adminProfile.email;
        console.log("[admin-create-asaas-subscription] Using admin profile email:", billingEmail);
      }
    }

    if (!billingEmail) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui email cadastrado e não foi encontrado email do administrador" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const asaasBaseUrl = "https://api.asaas.com/v3";

    // Check or create ASAAS customer
    let customerId: string | null = null;

    // Check existing subscription record
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("asaas_customer_id, asaas_subscription_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (subscription?.asaas_customer_id) {
      customerId = subscription.asaas_customer_id;
      console.log("[admin-create-asaas-subscription] Using existing ASAAS customer:", customerId);
    } else {
      // Search by email
      const searchResponse = await fetch(
        `${asaasBaseUrl}/customers?email=${encodeURIComponent(billingEmail)}`,
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
        console.log("[admin-create-asaas-subscription] Found ASAAS customer by email:", customerId);
      } else {
        // Create new customer
        const customerPayload = {
          name: company.name,
          email: billingEmail,
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
          console.error("[admin-create-asaas-subscription] ASAAS customer error:", customerData.errors);
          return new Response(
            JSON.stringify({ error: "Erro ao criar cliente no ASAAS: " + customerData.errors[0]?.description }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        customerId = customerData.id;
        console.log("[admin-create-asaas-subscription] Created ASAAS customer:", customerId);
      }
    }

    // Calculate price
    const monthlyPrice = company.plan.price || 0;
    const yearlyPrice = monthlyPrice * 11; // 11 months (1 free)
    const priceInReais = billing_type === "yearly" ? yearlyPrice : monthlyPrice;

    // Create payment link
    // NOTE: ASAAS externalReference has a max length of 100 characters
    const origin = "https://miauchat.com.br";
    const externalReference = `company:${company.id}`.slice(0, 100);

    const paymentLinkPayload = {
      name: `${company.plan.name} - ${billing_type === "yearly" ? "Anual" : "Mensal"} (Admin)`,
      description: `Assinatura MiauChat ${company.plan.name} - ${company.name}`,
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

    console.log("[admin-create-asaas-subscription] Creating payment link for:", company.name);

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
      console.error("[admin-create-asaas-subscription] Payment link error:", paymentLinkData.errors);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar link: " + paymentLinkData.errors[0]?.description }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("[admin-create-asaas-subscription] Payment link created:", paymentLinkData.url);

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

    // Log audit
    await supabase.from("audit_logs").insert({
      admin_user_id: userId,
      action: "ADMIN_CREATED_ASAAS_SUBSCRIPTION",
      entity_type: "company_subscription",
      entity_id: company.id,
      new_values: {
        company_name: company.name,
        plan_name: company.plan.name,
        billing_type,
        price: priceInReais,
        payment_url: paymentLinkData.url,
        asaas_customer_id: customerId,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentLinkData.url,
        company_name: company.name,
        plan_name: company.plan.name,
        price: priceInReais,
        billing_type,
        asaas_customer_id: customerId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[admin-create-asaas-subscription] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao criar cobrança";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
