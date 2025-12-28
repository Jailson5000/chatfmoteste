import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { useToast } from "./use-toast";
import type { Json } from "@/integrations/supabase/types";

export interface TriggerConfig {
  keywords?: string[];
  message_types?: string[];
  first_message_only?: boolean;
}

export interface Automation {
  id: string;
  law_firm_id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  trigger_type: string;
  trigger_config: TriggerConfig | null;
  ai_prompt: string | null;
  ai_temperature: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_prompt: string | null;
}

export interface CreateAutomationParams {
  name: string;
  description?: string;
  webhook_url: string;
  trigger_type: string;
  trigger_config?: TriggerConfig;
  ai_prompt?: string;
  ai_temperature?: number;
  is_active?: boolean;
}

export interface UpdateAutomationParams extends Partial<CreateAutomationParams> {
  id: string;
}

export function useAutomations() {
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: automations = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["automations", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        trigger_config: item.trigger_config as TriggerConfig | null,
      })) as Automation[];
    },
    enabled: !!lawFirm?.id,
  });

  const createAutomation = useMutation({
    mutationFn: async (params: CreateAutomationParams) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");

      const { data, error } = await supabase
        .from("automations")
        .insert({
          law_firm_id: lawFirm.id,
          name: params.name,
          description: params.description || null,
          webhook_url: params.webhook_url,
          trigger_type: params.trigger_type,
          trigger_config: (params.trigger_config || {}) as unknown as Json,
          ai_prompt: params.ai_prompt || null,
          ai_temperature: params.ai_temperature || 0.7,
          is_active: params.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({
        title: "Automação criada",
        description: "A automação foi criada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateAutomation = useMutation({
    mutationFn: async (params: UpdateAutomationParams) => {
      const { id, ...updateData } = params;

      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updateData.name !== undefined) updatePayload.name = updateData.name;
      if (updateData.description !== undefined) updatePayload.description = updateData.description;
      if (updateData.webhook_url !== undefined) updatePayload.webhook_url = updateData.webhook_url;
      if (updateData.trigger_type !== undefined) updatePayload.trigger_type = updateData.trigger_type;
      if (updateData.trigger_config !== undefined) updatePayload.trigger_config = updateData.trigger_config as unknown as Json;
      if (updateData.ai_prompt !== undefined) updatePayload.ai_prompt = updateData.ai_prompt;
      if (updateData.ai_temperature !== undefined) updatePayload.ai_temperature = updateData.ai_temperature;
      if (updateData.is_active !== undefined) updatePayload.is_active = updateData.is_active;

      const { data, error } = await supabase
        .from("automations")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({
        title: "Automação atualizada",
        description: "A automação foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
      toast({
        title: "Automação excluída",
        description: "A automação foi excluída com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir automação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleAutomation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from("automations")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({
        title: data.is_active ? "Automação ativada" : "Automação desativada",
        description: `A automação "${data.name}" foi ${data.is_active ? 'ativada' : 'desativada'}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar automação",
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
  };
}
