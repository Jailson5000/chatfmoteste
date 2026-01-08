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
    max_users: 2,
    max_instances: 1,
    max_agents: 1,
    max_ai_conversations: 200,
    max_tts_minutes: 10,
    max_workspaces: 1,
  },
  starter: {
    max_users: 4,
    max_instances: 1,
    max_agents: 1,
    max_ai_conversations: 250,
    max_tts_minutes: 30,
    max_workspaces: 1,
  },
  professional: {
    max_users: 6,
    max_instances: 2,
    max_agents: 4,
    max_ai_conversations: 500,
    max_tts_minutes: 40,
    max_workspaces: 2,
  },
  enterprise: {
    max_users: 20,
    max_instances: 4,
    max_agents: 20,
    max_ai_conversations: 1000,
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

    console.log("[VERIFY-PAYMENT] Session retrieved:", session.id, "Status:", session.payment_status);

    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Pagamento não confirmado",
          status: session.payment_status 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Extract metadata
    const metadata = session.metadata || {};
    const planKey = metadata.plan || "starter";
    const companyName = metadata.company_name;
    const adminName = metadata.admin_name;
    const adminEmail = metadata.admin_email;
    const adminPhone = metadata.admin_phone;
    const document = metadata.document;

    console.log("[VERIFY-PAYMENT] Metadata:", { planKey, companyName, adminEmail });

    if (!companyName || !adminEmail) {
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

    // Create law_firm
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

    // Create law_firm_settings
    const { error: settingsError } = await supabase
      .from("law_firm_settings")
      .insert({
        law_firm_id: lawFirm.id,
        ai_provider: "lovable",
      });

    if (settingsError) {
      console.error("[VERIFY-PAYMENT] Error creating settings:", settingsError);
    }

    // Generate random password
    const tempPassword = Math.random().toString(36).slice(-10) + 
                         Math.random().toString(36).slice(-2).toUpperCase() + 
                         "!";

    // Create admin user in auth
    console.log("[VERIFY-PAYMENT] Creating admin user");
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        law_firm_id: lawFirm.id,
      },
    });

    if (authError) {
      console.error("[VERIFY-PAYMENT] Error creating auth user:", authError);
      // Rollback law_firm
      await supabase.from("law_firms").delete().eq("id", lawFirm.id);
      throw new Error(`Erro ao criar usuário: ${authError.message}`);
    }

    console.log("[VERIFY-PAYMENT] Auth user created:", authUser.user.id);

    // Update profile with law_firm_id
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ law_firm_id: lawFirm.id })
      .eq("id", authUser.user.id);

    if (profileError) {
      console.error("[VERIFY-PAYMENT] Error updating profile:", profileError);
    }

    // Create user role (admin)
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: authUser.user.id,
        role: "admin",
      });

    if (roleError) {
      console.error("[VERIFY-PAYMENT] Error creating role:", roleError);
    }

    // Create company record
    console.log("[VERIFY-PAYMENT] Creating company record");
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        email: adminEmail,
        phone: adminPhone || null,
        document: document || null,
        law_firm_id: lawFirm.id,
        admin_user_id: authUser.user.id,
        plan_id: planId,
        status: "active",
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        provisioning_status: "completed",
        ...planLimits,
      })
      .select()
      .single();

    if (companyError) {
      console.error("[VERIFY-PAYMENT] Error creating company:", companyError);
    }

    // Clone template for the company
    console.log("[VERIFY-PAYMENT] Cloning template");
    const { data: cloneResult } = await supabase.rpc("clone_template_for_company", {
      _law_firm_id: lawFirm.id,
      _company_id: company?.id,
    });

    console.log("[VERIFY-PAYMENT] Template clone result:", cloneResult);

    // Send welcome email with credentials
    console.log("[VERIFY-PAYMENT] Sending welcome email");
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    try {
      await fetch(`${baseUrl}/functions/v1/send-auth-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          type: "initial_access",
          email: adminEmail,
          name: adminName,
          companyName: companyName,
          subdomain: subdomain,
          tempPassword: tempPassword,
        }),
      });
      console.log("[VERIFY-PAYMENT] Welcome email sent");
    } catch (emailError) {
      console.error("[VERIFY-PAYMENT] Error sending email:", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        companyId: company?.id,
        companyName: companyName,
        subdomain: subdomain,
        loginUrl: `https://${subdomain}.miauchat.com.br/auth`,
        message: "Empresa criada com sucesso! Verifique seu e-mail para as credenciais de acesso.",
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
