import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrphanLawFirm {
  id: string;
  name: string;
  subdomain: string | null;
  email: string | null;
  created_at: string;
  user_count: number;
  conversation_count: number;
  client_count: number;
  message_count: number;
  automation_count: number;
  has_data: boolean;
  risk_level: 'safe' | 'low' | 'attention';
}

export interface CleanupResult {
  success: boolean;
  deleted_count: number;
  errors: { law_firm_id: string; error: string }[];
  audit_log_ids: string[];
}

export function useOrphanLawFirms() {
  const queryClient = useQueryClient();

  const { data: orphans = [], isLoading, refetch } = useQuery({
    queryKey: ["orphan-law-firms"],
    queryFn: async () => {
      // Fetch law_firms that don't have an associated company
      const { data: lawFirms, error: lfError } = await supabase
        .from("law_firms")
        .select("id, name, subdomain, email, created_at");

      if (lfError) throw lfError;

      // Fetch all companies to find which law_firms are orphans
      const { data: companies, error: cError } = await supabase
        .from("companies")
        .select("law_firm_id");

      if (cError) throw cError;

      const companyLawFirmIds = new Set(companies.map(c => c.law_firm_id).filter(Boolean));
      
      // Filter to only orphan law_firms
      const orphanLawFirms = lawFirms.filter(lf => !companyLawFirmIds.has(lf.id));

      // Fetch metrics for each orphan
      const orphansWithMetrics: OrphanLawFirm[] = await Promise.all(
        orphanLawFirms.map(async (lf) => {
          // Count users (profiles)
          const { count: userCount } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("law_firm_id", lf.id);

          // Count conversations
          const { count: conversationCount } = await supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("law_firm_id", lf.id);

          // Count clients
          const { count: clientCount } = await supabase
            .from("clients")
            .select("*", { count: "exact", head: true })
            .eq("law_firm_id", lf.id);

          // Count messages
          const { count: messageCount } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("law_firm_id", lf.id);

          // Count automations
          const { count: automationCount } = await supabase
            .from("automations")
            .select("*", { count: "exact", head: true })
            .eq("law_firm_id", lf.id);

          const user_count = userCount || 0;
          const conversation_count = conversationCount || 0;
          const client_count = clientCount || 0;
          const message_count = messageCount || 0;
          const automation_count = automationCount || 0;

          const has_data = user_count > 0 || conversation_count > 0 || client_count > 0 || message_count > 0;
          
          // Determine risk level
          let risk_level: 'safe' | 'low' | 'attention' = 'safe';
          if (message_count > 0 || client_count > 0) {
            risk_level = 'attention';
          } else if (user_count > 0) {
            risk_level = 'low';
          }

          return {
            id: lf.id,
            name: lf.name,
            subdomain: lf.subdomain,
            email: lf.email,
            created_at: lf.created_at,
            user_count,
            conversation_count,
            client_count,
            message_count,
            automation_count,
            has_data,
            risk_level,
          };
        })
      );

      // Sort by risk level (attention first, then low, then safe)
      return orphansWithMetrics.sort((a, b) => {
        const riskOrder = { attention: 0, low: 1, safe: 2 };
        return riskOrder[a.risk_level] - riskOrder[b.risk_level];
      });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async ({ 
      lawFirmIds, 
      confirmDataDeletion 
    }: { 
      lawFirmIds: string[]; 
      confirmDataDeletion: boolean 
    }) => {
      const { data, error } = await supabase.functions.invoke("cleanup-orphan-lawfirm", {
        body: {
          law_firm_ids: lawFirmIds,
          confirm_data_deletion: confirmDataDeletion,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro desconhecido");
      
      return data as CleanupResult;
    },
    onSuccess: (result) => {
      toast.success(`${result.deleted_count} law firm(s) órfão(s) excluído(s) com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["orphan-law-firms"] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao limpar órfãos: ${error.message}`);
    },
  });

  // Summary stats
  const summary = {
    total: orphans.length,
    safe: orphans.filter(o => o.risk_level === 'safe').length,
    low: orphans.filter(o => o.risk_level === 'low').length,
    attention: orphans.filter(o => o.risk_level === 'attention').length,
  };

  return {
    orphans,
    isLoading,
    refetch,
    cleanup: cleanupMutation.mutateAsync,
    isCleaningUp: cleanupMutation.isPending,
    summary,
  };
}
