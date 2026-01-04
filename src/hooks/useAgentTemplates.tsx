import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  ai_prompt: string;
  ai_temperature: number;
  response_delay_seconds: number;
  trigger_type: string;
  trigger_config: Json;
  voice_enabled: boolean;
  voice_id: string | null;
  category: string;
  tags: string[];
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export function useAgentTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all active templates (for client panel)
  const {
    data: templates = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["agent-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_templates")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as AgentTemplate[];
    },
  });

  // Fetch all templates including inactive (for global admin)
  const {
    data: allTemplates = [],
    isLoading: isLoadingAll,
  } = useQuery({
    queryKey: ["agent-templates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_templates")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as AgentTemplate[];
    },
  });

  // Create template (global admin only)
  const createTemplate = useMutation({
    mutationFn: async (template: {
      name: string;
      description?: string | null;
      icon?: string;
      ai_prompt: string;
      ai_temperature?: number;
      response_delay_seconds?: number;
      trigger_type?: string;
      trigger_config?: Json;
      voice_enabled?: boolean;
      voice_id?: string | null;
      category?: string;
      tags?: string[];
      is_active?: boolean;
      is_featured?: boolean;
      display_order?: number;
    }) => {
      const { data, error } = await supabase
        .from("agent_templates")
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-templates"] });
      queryClient.invalidateQueries({ queryKey: ["agent-templates-all"] });
      toast({
        title: "Template criado",
        description: "O template de agente foi criado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update template (global admin only)
  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: { 
      id: string;
      name?: string;
      description?: string | null;
      icon?: string;
      ai_prompt?: string;
      ai_temperature?: number;
      response_delay_seconds?: number;
      trigger_type?: string;
      trigger_config?: Json;
      voice_enabled?: boolean;
      voice_id?: string | null;
      category?: string;
      tags?: string[];
      is_active?: boolean;
      is_featured?: boolean;
      display_order?: number;
    }) => {
      const { data, error } = await supabase
        .from("agent_templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-templates"] });
      queryClient.invalidateQueries({ queryKey: ["agent-templates-all"] });
      toast({
        title: "Template atualizado",
        description: "O template foi atualizado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete template (global admin only)
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-templates"] });
      queryClient.invalidateQueries({ queryKey: ["agent-templates-all"] });
      toast({
        title: "Template excluído",
        description: "O template foi excluído com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Increment usage count when cloning (manual update)
  const incrementUsageCount = useMutation({
    mutationFn: async (id: string) => {
      const { data: template } = await supabase
        .from("agent_templates")
        .select("usage_count")
        .eq("id", id)
        .single();
      
      if (template) {
        const { error } = await supabase
          .from("agent_templates")
          .update({ usage_count: (template.usage_count || 0) + 1 })
          .eq("id", id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-templates"] });
      queryClient.invalidateQueries({ queryKey: ["agent-templates-all"] });
    },
  });

  return {
    templates,
    allTemplates,
    isLoading,
    isLoadingAll,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    incrementUsageCount,
  };
}
