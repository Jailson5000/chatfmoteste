import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string | null;
  action_label: string | null;
  action_route: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStepInsert {
  title: string;
  description?: string | null;
  youtube_id?: string | null;
  action_label?: string | null;
  action_route?: string | null;
  position: number;
  is_active: boolean;
}

export interface OnboardingStepUpdate extends Partial<OnboardingStepInsert> {
  id: string;
}

// Hook para buscar todas as etapas (admin - inclui inativas)
export function useOnboardingStepsAdmin() {
  return useQuery({
    queryKey: ["onboarding-steps-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps")
        .select("*")
        .order("position", { ascending: true });

      if (error) throw error;
      return data as OnboardingStep[];
    },
  });
}

// Hook para buscar URL de agendamento
export function useOnboardingMeetingUrl() {
  return useQuery({
    queryKey: ["onboarding-meeting-url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "onboarding_meeting_url")
        .maybeSingle();

      if (error) throw error;
      // Ensure we always return a string
      const value = data?.value;
      return typeof value === "string" ? value : "";
    },
  });
}

// Mutation para criar etapa
export function useCreateOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (step: OnboardingStepInsert) => {
      const { data, error } = await supabase
        .from("onboarding_steps")
        .insert(step)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps-admin"] });
      toast.success("Etapa criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar etapa: ${error.message}`);
    },
  });
}

// Mutation para atualizar etapa
export function useUpdateOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (step: OnboardingStepUpdate) => {
      const { id, ...updates } = step;
      const { data, error } = await supabase
        .from("onboarding_steps")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps-admin"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps"] });
      toast.success("Etapa atualizada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar etapa: ${error.message}`);
    },
  });
}

// Mutation para excluir etapa
export function useDeleteOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_steps")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps-admin"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps"] });
      toast.success("Etapa excluída com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir etapa: ${error.message}`);
    },
  });
}

// Mutation para atualizar URL de agendamento
export function useUpdateMeetingUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          { key: "onboarding_meeting_url", value: url },
          { onConflict: "key" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-meeting-url"] });
      toast.success("URL de agendamento atualizada!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar URL: ${error.message}`);
    },
  });
}
