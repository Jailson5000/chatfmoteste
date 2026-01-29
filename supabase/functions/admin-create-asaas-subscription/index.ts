import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Admin Create ASAAS Subscription
 * 
 * Allows global admins to create ASAAS subscriptions (recurring charges) for existing companies.
 * Creates a real subscription in ASAAS that generates automatic monthly charges.
 * Charges appear in "Cobranças" section in ASAAS dashboard.
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

    // Get company data with plan (including plan limits for add-on calculation)
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(`
        *,
        plan:plans!companies_plan_id_fkey(id, name, price, billing_period, max_users, max_instances)
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
    const { data: existingSubscription } = await supabase
      .from("company_subscriptions")
      .select("asaas_customer_id, asaas_subscription_id")
      .eq("company_id", company.id)
      .maybeSingle();

    // Check if subscription already exists and is active
    if (existingSubscription?.asaas_subscription_id) {
      // Verify if subscription is still active in ASAAS
      const checkResponse = await fetch(
        `${asaasBaseUrl}/subscriptions/${existingSubscription.asaas_subscription_id}`,
        {
          headers: {
            "access_token": asaasApiKey,
            "Content-Type": "application/json",
          },
        }
      );
      
      if (checkResponse.ok) {
        const existingSub = await checkResponse.json();
        if (existingSub.status === "ACTIVE") {
          console.log("[admin-create-asaas-subscription] Subscription already active:", existingSub.id);
          return new Response(
            JSON.stringify({ 
              error: "Esta empresa já possui uma assinatura ativa no ASAAS. Use 'Atualizar Assinatura' para modificar o valor.",
              existing_subscription_id: existingSub.id,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      }
    }

    if (existingSubscription?.asaas_customer_id) {
      customerId = existingSubscription.asaas_customer_id;
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

    // ============ CALCULATE PRICE WITH ADD-ONS ============
    // Pricing constants (must match src/lib/billing-config.ts)
    const PRICING_USER = 47.90;
    const PRICING_INSTANCE = 79.90;
    
    // Plan limits (base)
    const planLimits = {
      max_users: company.plan.max_users || 0,
      max_instances: company.plan.max_instances || 0,
    };
    
    // Effective limits (with add-ons)
    const effectiveLimits = {
      max_users: company.max_users || planLimits.max_users,
      max_instances: company.max_instances || planLimits.max_instances,
    };
    
    // Calculate add-ons
    const additionalUsers = Math.max(0, effectiveLimits.max_users - planLimits.max_users);
    const additionalInstances = Math.max(0, effectiveLimits.max_instances - planLimits.max_instances);
    
    const usersCost = additionalUsers * PRICING_USER;
    const instancesCost = additionalInstances * PRICING_INSTANCE;
    const totalAdditional = usersCost + instancesCost;
    
    // Final price
    const basePlanPrice = company.plan.price || 0;
    const monthlyPrice = basePlanPrice + totalAdditional;
    const yearlyPrice = monthlyPrice * 11; // 11 months (1 free)
    const priceInReais = billing_type === "yearly" ? yearlyPrice : monthlyPrice;
    
    // Build description with add-ons breakdown
    let descriptionParts = [`Assinatura MiauChat ${company.plan.name}`];
    if (additionalUsers > 0 || additionalInstances > 0) {
      descriptionParts.push("Inclui:");
      if (additionalUsers > 0) descriptionParts.push(`+${additionalUsers} usuário(s)`);
      if (additionalInstances > 0) descriptionParts.push(`+${additionalInstances} WhatsApp`);
    }
    descriptionParts.push(`- ${company.name}`);
    const description = descriptionParts.join(" ");
    
    console.log(`[admin-create-asaas-subscription] Pricing breakdown:`, {
      basePlanPrice,
      additionalUsers,
      usersCost,
      additionalInstances,
      instancesCost,
      totalAdditional,
      monthlyPrice,
      priceInReais,
    });

    // ============ CREATE SUBSCRIPTION (RECURRING CHARGE) ============
    // Calculate next due date (7 days from now)
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 7);
    const nextDueDateStr = nextDueDate.toISOString().split('T')[0];

    const externalReference = `company:${company.id}`.slice(0, 100);

    const subscriptionPayload = {
      customer: customerId,
      billingType: "UNDEFINED", // Customer chooses: Boleto, PIX, or Card
      nextDueDate: nextDueDateStr,
      value: priceInReais,
      cycle: billing_type === "yearly" ? "YEARLY" : "MONTHLY",
      description: description,
      externalReference: externalReference,
    };

    console.log("[admin-create-asaas-subscription] Creating subscription for:", company.name, subscriptionPayload);

    const subscriptionResponse = await fetch(`${asaasBaseUrl}/subscriptions`, {
      method: "POST",
      headers: {
        "access_token": asaasApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscriptionPayload),
    });

    const subscriptionData = await subscriptionResponse.json();

    if (subscriptionData.errors) {
      console.error("[admin-create-asaas-subscription] Subscription error:", subscriptionData.errors);
      return new Response(
        JSON.stringify({ error: "Erro ao criar assinatura: " + subscriptionData.errors[0]?.description }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("[admin-create-asaas-subscription] Subscription created:", subscriptionData.id, "Status:", subscriptionData.status);

    // Save or update subscription record with the ASAAS subscription ID
    await supabase
      .from("company_subscriptions")
      .upsert({
        company_id: company.id,
        asaas_customer_id: customerId,
        asaas_subscription_id: subscriptionData.id,
        plan_id: company.plan.id,
        billing_type,
        status: "active",
      }, { onConflict: "company_id" });

    // Log audit with add-ons breakdown
    await supabase.from("audit_logs").insert({
      admin_user_id: userId,
      action: "ADMIN_CREATED_ASAAS_SUBSCRIPTION",
      entity_type: "company_subscription",
      entity_id: company.id,
      new_values: {
        company_name: company.name,
        plan_name: company.plan.name,
        billing_type,
        base_plan_price: basePlanPrice,
        additional_users: additionalUsers,
        users_cost: usersCost,
        additional_instances: additionalInstances,
        instances_cost: instancesCost,
        total_additional: totalAdditional,
        total_price: priceInReais,
        asaas_subscription_id: subscriptionData.id,
        asaas_customer_id: customerId,
        next_due_date: nextDueDateStr,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscriptionData.id,
        next_due_date: nextDueDateStr,
        company_name: company.name,
        plan_name: company.plan.name,
        base_plan_price: basePlanPrice,
        additional_users: additionalUsers,
        additional_instances: additionalInstances,
        total_additional: totalAdditional,
        price: priceInReais,
        billing_type,
        asaas_customer_id: customerId,
        message: `Assinatura criada com sucesso! Primeira cobrança em ${nextDueDateStr}. O cliente receberá email/SMS do ASAAS para pagamento.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("[admin-create-asaas-subscription] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao criar assinatura";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
