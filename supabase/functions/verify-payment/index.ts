import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plan limits configuration
const PLAN_LIMITS = {
  basic: {
    max_users: 3,
    max_instances: 1,
    max_agents: 1,
    max_ai_conversations: 200,
    max_tts_minutes: 10,
    max_workspaces: 1,
  },
  starter: {
    max_users: 4,
    max_instances: 2,
    max_agents: 2,
    max_ai_conversations: 300,
    max_tts_minutes: 25,
    max_workspaces: 1,
  },
  professional: {
    max_users: 5,
    max_instances: 4,
    max_agents: 4,
    max_ai_conversations: 500,
    max_tts_minutes: 40,
    max_workspaces: 2,
  },
  enterprise: {
    max_users: 10,
    max_instances: 6,
    max_agents: 10,
    max_ai_conversations: 600,
    max_tts_minutes: 60,
    max_workspaces: 4,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[VERIFY-PAYMENT] Starting payment verification");

    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Session ID não fornecido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Initialize Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    console.log("[VERIFY-PAYMENT] Session retrieved:", session.id, "Status:", session.payment_status, "Session status:", session.status);

    // Accept both paid and no_payment_required (for 100% discount coupons)
    const isPaid = session.payment_status === "paid";
    const isNoPaymentRequired = session.payment_status === "no_payment_required" && session.status === "complete";

    if (!isPaid && !isNoPaymentRequired) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Pagamento não confirmado",
          status: session.payment_status,
          session_status: session.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log("[VERIFY-PAYMENT] Payment verified:", { isPaid, isNoPaymentRequired, paymentStatus: session.payment_status });

    // Extract metadata with fallbacks for customer details
    const metadata = session.metadata || {};
    const planKey = metadata.plan || metadata.plan_name || "starter";
    const companyName = metadata.company_name;
    const adminName = metadata.admin_name;
    // Fallback to customer email if not in metadata
    const adminEmail = metadata.admin_email || session.customer_email || (session.customer_details as any)?.email;
    const adminPhone = metadata.admin_phone || (session.customer_details as any)?.phone;
    const document = metadata.document;

    console.log("[VERIFY-PAYMENT] Metadata:", { planKey, companyName, adminEmail, source: metadata.admin_email ? "metadata" : "customer_details" });

    if (!companyName || !adminEmail) {
      console.error("[VERIFY-PAYMENT] Missing required data:", { companyName, adminEmail, metadata, customer_email: session.customer_email });
      return new Response(
        JSON.stringify({ error: "Dados da empresa não encontrados na sessão" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Initialize Supabase with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Supabase não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Check if company already exists with this email
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id, name")
      .eq("email", adminEmail)
      .single();

    if (existingCompany) {
      console.log("[VERIFY-PAYMENT] Company already exists:", existingCompany.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          alreadyProvisioned: true,
          companyId: existingCompany.id,
          companyName: existingCompany.name,
          message: "Empresa já cadastrada. Use suas credenciais para acessar."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get plan ID from database
    const { data: planData } = await supabase
      .from("plans")
      .select("id")
      .ilike("name", `%${planKey}%`)
      .single();

    const planId = planData?.id;
    const typedPlanKey = planKey as keyof typeof PLAN_LIMITS;
    const planLimits = PLAN_LIMITS[typedPlanKey] || PLAN_LIMITS.starter;

    // Generate subdomain from company name
    const subdomain = companyName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 30);

    // ========================================
    // STEP 1: Create law_firm (tenant)
    // ========================================
    console.log("[VERIFY-PAYMENT] Creating law_firm");
    const { data: lawFirm, error: lawFirmError } = await supabase
      .from("law_firms")
      .insert({
        name: companyName,
        email: adminEmail,
        phone: adminPhone || null,
        document: document || null,
        subdomain: subdomain,
      })
      .select()
      .single();

    if (lawFirmError) {
      console.error("[VERIFY-PAYMENT] Error creating law_firm:", lawFirmError);
      throw new Error(`Erro ao criar organização: ${lawFirmError.message}`);
    }

    console.log("[VERIFY-PAYMENT] Law firm created:", lawFirm.id);

    // ========================================
    // STEP 2: Create law_firm_settings
    // ========================================
    const { error: settingsError } = await supabase
      .from("law_firm_settings")
      .insert({
        law_firm_id: lawFirm.id,
        ai_provider: "lovable",
      });

    if (settingsError) {
      console.error("[VERIFY-PAYMENT] Error creating settings:", settingsError);
      // Non-critical, continue
    }

    // ========================================
    // STEP 3: Create company record
    // ========================================
    console.log("[VERIFY-PAYMENT] Creating company record");
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        email: adminEmail,
        phone: adminPhone || null,
        document: document || null,
        law_firm_id: lawFirm.id,
        plan_id: planId,
        status: "active",
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        provisioning_status: "pending",
        client_app_status: "created",
        ...planLimits,
      })
      .select()
      .single();

    if (companyError) {
      console.error("[VERIFY-PAYMENT] Error creating company:", companyError);
      // Rollback law_firm
      await supabase.from("law_firms").delete().eq("id", lawFirm.id);
      throw new Error(`Erro ao criar empresa: ${companyError.message}`);
    }

    console.log("[VERIFY-PAYMENT] Company created:", company.id);

    // ========================================
    // STEP 4: Clone template for the company
    // ========================================
    console.log("[VERIFY-PAYMENT] Cloning template");
    const { data: cloneResult } = await supabase.rpc("clone_template_for_company", {
      _law_firm_id: lawFirm.id,
      _company_id: company.id,
    });

    console.log("[VERIFY-PAYMENT] Template clone result:", cloneResult);

    // ========================================
    // STEP 5: Create company_subscriptions record with Stripe IDs
    // ========================================
    console.log("[VERIFY-PAYMENT] Creating company subscription record");
    
    const subscription = session.subscription as Stripe.Subscription | string | null;
    const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    
    const { error: subscriptionError } = await supabase
      .from("company_subscriptions")
      .upsert({
        company_id: company.id,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "company_id"
      });

    if (subscriptionError) {
      console.error("[VERIFY-PAYMENT] Error creating subscription record:", subscriptionError);
      // Non-critical, continue
    } else {
      console.log("[VERIFY-PAYMENT] Subscription record created with Stripe IDs");
    }

    // ========================================
    // STEP 6: Create admin user via create-company-admin
    // (Uses secure crypto.getRandomValues for password generation)
    // ========================================
    console.log("[VERIFY-PAYMENT] Creating admin user via create-company-admin");
    
    let adminUserResult = null;
    let adminError: string | null = null;
    
    try {
      const createAdminResponse = await fetch(`${supabaseUrl}/functions/v1/create-company-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          company_id: company.id,
          company_name: companyName,
          law_firm_id: lawFirm.id,
          subdomain: subdomain,
          admin_email: adminEmail,
          admin_name: adminName || companyName,
        }),
      });

      if (createAdminResponse.ok) {
        adminUserResult = await createAdminResponse.json();
        console.log("[VERIFY-PAYMENT] Admin user created successfully:", adminUserResult.user_id);
        
        // Update company with admin_user_id and provisioning status
        await supabase
          .from("companies")
          .update({
            admin_user_id: adminUserResult.user_id,
            provisioning_status: "completed",
            initial_access_email_sent: adminUserResult.email_sent,
            initial_access_email_sent_at: adminUserResult.email_sent ? new Date().toISOString() : null,
            initial_access_email_error: adminUserResult.email_error,
          })
          .eq("id", company.id);
      } else {
        const errorText = await createAdminResponse.text();
        adminError = `Failed to create admin: ${errorText}`;
        console.error("[VERIFY-PAYMENT] Error creating admin user:", errorText);
        
        // Update company with error status
        await supabase
          .from("companies")
          .update({
            provisioning_status: "partial",
            initial_access_email_error: adminError,
          })
          .eq("id", company.id);
      }
    } catch (error) {
      adminError = error instanceof Error ? error.message : "Unknown error";
      console.error("[VERIFY-PAYMENT] Exception creating admin:", error);
      
      await supabase
        .from("companies")
        .update({
          provisioning_status: "partial",
          initial_access_email_error: adminError,
        })
        .eq("id", company.id);
    }

    // Return success even if admin creation had issues (company is created)
    return new Response(
      JSON.stringify({
        success: true,
        companyId: company.id,
        companyName: companyName,
        subdomain: subdomain,
        loginUrl: `https://${subdomain}.miauchat.com.br/auth`,
        adminUserId: adminUserResult?.user_id || null,
        emailSent: adminUserResult?.email_sent || false,
        adminError: adminError,
        message: adminUserResult?.email_sent 
          ? "Empresa criada com sucesso! Verifique seu e-mail para as credenciais de acesso."
          : "Empresa criada. Entre em contato com o suporte para obter suas credenciais.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("[VERIFY-PAYMENT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao verificar pagamento";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
