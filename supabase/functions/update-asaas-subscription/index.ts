import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UpdateRequest {
  company_id: string;
  new_value: number;
  reason?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    const ASAAS_API_URL =
      Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3";

    if (!ASAAS_API_KEY) {
      console.error("Missing ASAAS_API_KEY");
      return new Response(
        JSON.stringify({ error: "ASAAS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is a global admin
    const { data: adminRole } = await supabase
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!adminRole) {
      console.error("Caller is not a global admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Global admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: UpdateRequest = await req.json();
    const { company_id, new_value, reason } = body;

    if (!company_id || new_value === undefined || new_value === null) {
      return new Response(
        JSON.stringify({ error: "company_id and new_value are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Updating subscription for company ${company_id} to value ${new_value}`);

    // Fetch company data with plan info for description generation
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(`
        name,
        max_users,
        max_instances,
        plan:plans!companies_plan_id_fkey(name, max_users, max_instances)
      `)
      .eq("id", company_id)
      .single();

    if (companyError) {
      console.log("Warning: Could not fetch company data for description:", companyError);
    }

    // Fetch company subscription from database
    const { data: subscription, error: subError } = await supabase
      .from("company_subscriptions")
      .select("*")
      .eq("company_id", company_id)
      .single();

    if (subError || !subscription) {
      console.log("No subscription found for company:", company_id);
      return new Response(
        JSON.stringify({ 
          success: false,
          skipped: true,
          message: "Empresa sem assinatura ativa no ASAAS. O valor será aplicado quando ela assinar.",
          new_value: new_value
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscription.asaas_subscription_id) {
      console.log("No ASAAS subscription ID for company:", company_id);
      return new Response(
        JSON.stringify({ 
          success: false,
          skipped: true,
          message: "Empresa sem ID de assinatura ASAAS. O valor será aplicado quando ela assinar.",
          new_value: new_value
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate updated description based on current limits
    let newDescription: string | undefined;
    if (company) {
      const planData = company.plan as { name?: string; max_users?: number; max_instances?: number } | null;
      const planName = planData?.name || "PLANO";
      const planMaxUsers = planData?.max_users || 0;
      const planMaxInstances = planData?.max_instances || 0;
      
      const additionalUsers = Math.max(0, (company.max_users || 0) - planMaxUsers);
      const additionalInstances = Math.max(0, (company.max_instances || 0) - planMaxInstances);
      
      const descriptionParts: string[] = [`Assinatura MiauChat ${planName.toUpperCase()}`];
      
      if (additionalUsers > 0 || additionalInstances > 0) {
        descriptionParts.push("Inclui:");
        if (additionalUsers > 0) {
          descriptionParts.push(`+${additionalUsers} usuário(s)`);
        }
        if (additionalInstances > 0) {
          descriptionParts.push(`+${additionalInstances} WhatsApp`);
        }
      }
      
      descriptionParts.push(`- ${company.name}`);
      newDescription = descriptionParts.join(" ");
      console.log("Generated new description:", newDescription);
    }

    // Fetch current subscription from ASAAS to get old value
    const getSubResponse = await fetch(
      `${ASAAS_API_URL}/subscriptions/${subscription.asaas_subscription_id}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          access_token: ASAAS_API_KEY,
        },
      }
    );

    let oldValue = subscription.plan_id ? 0 : 0;
    if (getSubResponse.ok) {
      const currentSub = await getSubResponse.json();
      oldValue = currentSub.value || 0;
      console.log(`Current ASAAS subscription value: ${oldValue}`);
    }

    // Update subscription in ASAAS - include description if generated
    const updatePayload: { value: number; description?: string; updatePendingPayments: boolean } = {
      value: new_value,
      updatePendingPayments: true, // Apply to next invoice
    };
    
    if (newDescription) {
      updatePayload.description = newDescription;
    }

    console.log(`Calling ASAAS API to update subscription ${subscription.asaas_subscription_id}:`, updatePayload);

    const updateResponse = await fetch(
      `${ASAAS_API_URL}/subscriptions/${subscription.asaas_subscription_id}`,
      {
        method: "PUT",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify(updatePayload),
      }
    );

    const responseText = await updateResponse.text();
    console.log(`ASAAS response status: ${updateResponse.status}`);
    console.log(`ASAAS response body: ${responseText}`);

    if (!updateResponse.ok) {
      let errorDetails;
      try {
        errorDetails = JSON.parse(responseText);
      } catch {
        errorDetails = { message: responseText };
      }

      console.error("ASAAS update failed:", errorDetails);
      return new Response(
        JSON.stringify({ 
          error: "Erro ao atualizar assinatura no ASAAS",
          asaas_error: errorDetails
        }),
        { status: updateResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updatedSubscription = JSON.parse(responseText);

    // Log the change in audit_logs
    await supabase.from("audit_logs").insert({
      admin_user_id: user.id,
      action: "SUBSCRIPTION_VALUE_UPDATED",
      entity_type: "company_subscription",
      entity_id: company_id,
      old_values: { value: oldValue },
      new_values: { 
        value: new_value, 
        reason: reason || "Addon approval",
        asaas_subscription_id: subscription.asaas_subscription_id
      },
    });

    console.log(`Successfully updated subscription for company ${company_id}: ${oldValue} -> ${new_value}`);

    return new Response(
      JSON.stringify({
        success: true,
        old_value: oldValue,
        new_value: new_value,
        asaas_subscription_id: subscription.asaas_subscription_id,
        next_due_date: updatedSubscription.nextDueDate,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
