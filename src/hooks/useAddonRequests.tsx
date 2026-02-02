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

  // Approve request using the database function (no ASAAS sync)
  const approveRequest = useMutation({
    mutationFn: async (params: { requestId: string; newMonthlyValue?: number; companyId?: string }) => {
      const { requestId } = params;
      
      console.log("[Addon Approval] Starting approval flow:", { requestId });
      
      // Approve in database (updates company limits)
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
      } | null;
      
      if (!result?.success) {
        console.error("[Addon Approval] RPC returned failure:", result);
        throw new Error(result?.error || "Erro ao aprovar");
      }
      
      console.log("[Addon Approval] Database approval success:", result);
      
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-addon-requests"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-usage-dashboard"] });
      
      toast.success(`Aprovado! Novos limites: ${data.new_max_users} usuários, ${data.new_max_instances} conexões.`);
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
