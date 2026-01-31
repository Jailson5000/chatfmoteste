import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { toast } from "sonner";

export interface AddonRequest {
  id: string;
  company_id: string;
  law_firm_id: string;
  requested_by: string | null;
  additional_users: number;
  additional_instances: number;
  monthly_cost: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function useAddonRequests() {
  const { lawFirm } = useLawFirm();
  const queryClient = useQueryClient();

  // Fetch addon requests for the current law firm
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["addon-requests", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("addon_requests")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AddonRequest[];
    },
    enabled: !!lawFirm?.id,
  });

  // Create a new addon request
  const createRequest = useMutation({
    mutationFn: async (params: {
      companyId: string;
      additionalUsers: number;
      additionalInstances: number;
      monthlyCost: number;
    }) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");

      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("addon_requests")
        .insert({
          company_id: params.companyId,
          law_firm_id: lawFirm.id,
          requested_by: userData.user?.id || null,
          additional_users: params.additionalUsers,
          additional_instances: params.additionalInstances,
          monthly_cost: params.monthlyCost,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addon-requests"] });
      toast.success("Solicitação enviada! O administrador será notificado e entrará em contato.");
    },
    onError: (error: Error) => {
      console.error("Error creating addon request:", error);
      toast.error("Erro ao enviar solicitação. Tente novamente.");
    },
  });

  // Cancel a pending request
  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("addon_requests")
        .update({ status: "cancelled" })
        .eq("id", requestId)
        .eq("status", "pending");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addon-requests"] });
      toast.success("Solicitação cancelada.");
    },
    onError: (error: Error) => {
      console.error("Error cancelling addon request:", error);
      toast.error("Erro ao cancelar solicitação.");
    },
  });

  return {
    requests,
    isLoading,
    createRequest,
    cancelRequest,
    pendingRequests: requests.filter((r) => r.status === "pending"),
  };
}

// Hook for Global Admin to manage all addon requests
export function useAdminAddonRequests() {
  const queryClient = useQueryClient();

  // Fetch all pending addon requests (for global admin)
  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ["admin-addon-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_requests")
        .select(`
          *,
          company:companies(id, name, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Approve request using the database function + update ASAAS subscription
  const approveRequest = useMutation({
    mutationFn: async (params: { requestId: string; newMonthlyValue?: number; companyId?: string }) => {
      const { requestId, newMonthlyValue, companyId } = params;
      
      console.log("[Addon Approval] Starting approval flow:", { requestId, newMonthlyValue, companyId });
      
      // 1. Approve in database (updates company limits)
      const { data, error } = await supabase.rpc("approve_addon_request", {
        _request_id: requestId,
      });

      if (error) {
        console.error("[Addon Approval] Database approval error:", error);
        throw error;
      }
      
      const result = data as { 
        success: boolean; 
        new_max_users?: number; 
        new_max_instances?: number; 
        company_name?: string; 
        error?: string;
        plan_base_users?: number;
        plan_base_instances?: number;
      } | null;
      
      if (!result?.success) {
        console.error("[Addon Approval] RPC returned failure:", result);
        throw new Error(result?.error || "Erro ao aprovar");
      }
      
      console.log("[Addon Approval] Database approval success:", result);
      
      // 2. ALWAYS try to update ASAAS subscription if we have the required data
      let asaasUpdated = false;
      let asaasError: string | null = null;
      let asaasSkipped = false;
      let asaasMessage = "";
      
      // Calculate new monthly value if not provided
      let effectiveNewValue = newMonthlyValue;
      let effectiveCompanyId = companyId;
      
      // If companyId wasn't passed, try to get it from the request
      if (!effectiveCompanyId) {
        const { data: requestData } = await supabase
          .from("addon_requests")
          .select("company_id")
          .eq("id", requestId)
          .single();
        
        if (requestData) {
          effectiveCompanyId = requestData.company_id;
          console.log("[Addon Approval] Retrieved company_id from request:", effectiveCompanyId);
        }
      }
      
      // If we still don't have a monthly value, calculate it
      if (!effectiveNewValue && effectiveCompanyId) {
        const { data: companyData } = await supabase
          .from("companies")
          .select(`
            max_users,
            max_instances,
            plan:plans!companies_plan_id_fkey(price, max_users, max_instances)
          `)
          .eq("id", effectiveCompanyId)
          .single();
        
        if (companyData?.plan) {
          const planData = companyData.plan as { price: number; max_users: number; max_instances: number };
          const additionalUsers = Math.max(0, (companyData.max_users || 0) - planData.max_users);
          const additionalInstances = Math.max(0, (companyData.max_instances || 0) - planData.max_instances);
          
          // Use billing-config pricing constants (imported at top)
          const ADDITIONAL_PRICING = { user: 29.90, whatsappInstance: 57.90 };
          const additionalCost = (additionalUsers * ADDITIONAL_PRICING.user) + (additionalInstances * ADDITIONAL_PRICING.whatsappInstance);
          effectiveNewValue = planData.price + additionalCost;
          
          console.log("[Addon Approval] Calculated new monthly value:", {
            planPrice: planData.price,
            additionalUsers,
            additionalInstances,
            additionalCost,
            effectiveNewValue
          });
        }
      }
      
      if (effectiveNewValue && effectiveCompanyId) {
        console.log("[Addon Approval] Calling update-asaas-subscription:", {
          company_id: effectiveCompanyId,
          new_value: effectiveNewValue
        });
        
        try {
          const { data: asaasResult, error: asaasErr } = await supabase.functions.invoke(
            "update-asaas-subscription",
            {
              body: { 
                company_id: effectiveCompanyId, 
                new_value: effectiveNewValue,
                reason: "Addon request approved"
              },
            }
          );

          console.log("[Addon Approval] ASAAS response:", asaasResult, "Error:", asaasErr);

          if (asaasErr) {
            console.error("[Addon Approval] ASAAS invocation error:", asaasErr);
            asaasError = asaasErr.message;
          } else if (asaasResult?.skipped) {
            // Company doesn't have active ASAAS subscription yet - this is expected
            asaasSkipped = true;
            asaasMessage = asaasResult.message;
            console.log("[Addon Approval] ASAAS update skipped:", asaasResult);
          } else if (asaasResult?.error) {
            console.error("[Addon Approval] ASAAS update failed:", asaasResult);
            asaasError = asaasResult.details || asaasResult.error;
          } else if (asaasResult?.success) {
            asaasUpdated = true;
            console.log("[Addon Approval] ASAAS subscription updated successfully:", asaasResult);
          }
        } catch (e) {
          console.error("[Addon Approval] Exception calling update-asaas-subscription:", e);
          asaasError = e instanceof Error ? e.message : "Erro desconhecido";
        }
      } else {
        console.warn("[Addon Approval] Missing data for ASAAS update:", { 
          effectiveNewValue, 
          effectiveCompanyId 
        });
        asaasError = "Não foi possível calcular o novo valor para atualizar ASAAS";
      }
      
      return { 
        ...result, 
        asaas_updated: asaasUpdated,
        asaas_skipped: asaasSkipped,
        asaas_message: asaasMessage,
        asaas_error: asaasError,
        calculated_value: effectiveNewValue
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-addon-requests"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-usage-dashboard"] });
      
      if (data.asaas_updated) {
        toast.success(`Aprovado! Limites: ${data.new_max_users} usuários, ${data.new_max_instances} conexões. Cobrança ASAAS atualizada ✓`, {
          description: `Novo valor mensal: R$ ${data.calculated_value?.toFixed(2).replace(".", ",")}`
        });
      } else if (data.asaas_skipped) {
        toast.success(`Aprovado! Limites: ${data.new_max_users} usuários, ${data.new_max_instances} conexões.`, {
          description: "Empresa ainda sem assinatura ativa - valor será aplicado quando assinar."
        });
      } else if (data.asaas_error) {
        toast.warning(`Aprovado! Limites atualizados.`, {
          description: `Aviso ASAAS: ${data.asaas_error}. Sincronize manualmente em Empresas.`
        });
      } else {
        toast.success(`Aprovado! Novos limites: ${data.new_max_users} usuários, ${data.new_max_instances} conexões.`);
      }
    },
    onError: (error: Error) => {
      console.error("[Addon Approval] Error:", error);
      toast.error(`Erro ao aprovar: ${error.message}`);
    },
  });

  // Reject request using the database function
  const rejectRequest = useMutation({
    mutationFn: async (params: { requestId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc("reject_addon_request", {
        _request_id: params.requestId,
        _reason: params.reason || null,
      });

      if (error) throw error;
      
      const result = data as Record<string, unknown> | null;
      if (!result?.success) throw new Error((result?.error as string) || "Erro ao rejeitar");
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-addon-requests"] });
      toast.success("Solicitação rejeitada.");
    },
    onError: (error: Error) => {
      console.error("Error rejecting addon request:", error);
      toast.error(`Erro ao rejeitar: ${error.message}`);
    },
  });

  return {
    allRequests,
    pendingRequests: allRequests.filter((r) => r.status === "pending"),
    isLoading,
    approveRequest,
    rejectRequest,
  };
}
