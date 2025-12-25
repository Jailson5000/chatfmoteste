import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  trigger_type: string;
  trigger_config: {
    departmentId?: string;
    keywords?: string[];
    canChangeStatus?: boolean;
    canMoveDepartment?: boolean;
  } | null;
  ai_prompt: string | null;
  ai_temperature: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  law_firm_id: string;
}

export interface CreateAutomationParams {
  name: string;
  description?: string;
  webhook_url: string;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  ai_prompt?: string;
  ai_temperature?: number;
  is_active?: boolean;
}

export interface UpdateAutomationParams extends Partial<CreateAutomationParams> {
  id: string;
}

export function useAutomations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch all automations
  const { data: automations = [], isLoading, error, refetch } = useQuery({
    queryKey: ["automations", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Automation[];
    },
    enabled: !!lawFirm?.id,
  });

  // Create automation
  const createAutomation = useMutation({
    mutationFn: async (params: CreateAutomationParams) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");

      const { data, error } = await supabase
        .from("automations")
        .insert({
          ...params,
          law_firm_id: lawFirm.id,
          trigger_config: params.trigger_config as any,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ title: "Automação criada com sucesso" });
    },
    onError: (error) => {
      console.error("Error creating automation:", error);
      toast({
        title: "Erro ao criar automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update automation
  const updateAutomation = useMutation({
    mutationFn: async ({ id, ...params }: UpdateAutomationParams) => {
      const { data, error } = await supabase
        .from("automations")
        .update({
          ...params,
          trigger_config: params.trigger_config as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ title: "Automação atualizada" });
    },
    onError: (error) => {
      console.error("Error updating automation:", error);
      toast({
        title: "Erro ao atualizar automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete automation
  const deleteAutomation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automations")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ title: "Automação excluída" });
    },
    onError: (error) => {
      console.error("Error deleting automation:", error);
      toast({
        title: "Erro ao excluir automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle automation active state
  const toggleAutomation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("automations")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ 
        title: variables.is_active ? "Automação ativada" : "Automação desativada" 
      });
    },
    onError: (error) => {
      console.error("Error toggling automation:", error);
      toast({
        title: "Erro ao alterar automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test n8n webhook via edge function (avoids CORS issues)
  const testWebhook = useMutation({
    mutationFn: async (webhookUrl: string) => {
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: { webhookUrl }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || "Falha ao testar webhook");
      }

      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: "Webhook testado com sucesso",
        description: "A conexão com o n8n está funcionando"
      });
    },
    onError: (error) => {
      console.error("Error testing webhook:", error);
      toast({
        title: "Erro ao testar webhook",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    automations,
    isLoading,
    error,
    refetch,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
    testWebhook,
  };
}
