import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string | null;
  action_label: string | null;
  action_route: string | null;
  position: number;
  is_completed: boolean;
}

export type MeetingStatus = 'scheduled' | 'declined' | null;

export interface UseOnboardingReturn {
  steps: OnboardingStep[];
  progress: number;
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  isLoading: boolean;
  markComplete: (stepId: string) => Promise<void>;
  meetingUrl: string | null;
  meetingStatus: MeetingStatus;
  setMeetingStatus: (status: 'scheduled' | 'declined') => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch company ID from user's profile → law_firm → company
  const { data: companyId, isLoading: companyLoading } = useQuery({
    queryKey: ["user-company-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Get user's law_firm_id from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.law_firm_id) return null;

      // Get company_id from law_firm
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("law_firm_id", profile.law_firm_id)
        .maybeSingle();

      if (companyError || !company) return null;
      return company.id;
    },
    enabled: !!user?.id,
  });

  // Fetch onboarding steps
  const { data: stepsData = [], isLoading: stepsLoading } = useQuery({
    queryKey: ["onboarding-steps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Fetch company's progress
  const { data: progressData = [], isLoading: progressLoading } = useQuery({
    queryKey: ["onboarding-progress", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from("onboarding_progress")
        .select("step_id, completed_at")
        .eq("company_id", companyId);

      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch meeting URL from system_settings
  const { data: meetingUrl } = useQuery({
    queryKey: ["onboarding-meeting-url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "onboarding_meeting_url")
        .maybeSingle();

      if (error) throw error;
      
      // Parse the JSON value
      if (data?.value) {
        const parsed = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
        const cleaned = parsed.replace(/^"|"$/g, ''); // Remove surrounding quotes
        return cleaned || null;
      }
      return null;
    },
  });

  // Fetch meeting status from company
  const { data: meetingStatus } = useQuery({
    queryKey: ["onboarding-meeting-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      
      const { data, error } = await supabase
        .from("companies")
        .select("onboarding_meeting_status")
        .eq("id", companyId)
        .maybeSingle();

      if (error) throw error;
      return (data?.onboarding_meeting_status as MeetingStatus) || null;
    },
    enabled: !!companyId,
  });

  // Combine steps with progress
  const completedStepIds = new Set(progressData.map(p => p.step_id));
  
  const steps: OnboardingStep[] = stepsData.map(step => ({
    id: step.id,
    title: step.title,
    description: step.description,
    youtube_id: step.youtube_id,
    action_label: step.action_label,
    action_route: step.action_route,
    position: step.position,
    is_completed: completedStepIds.has(step.id),
  }));

  const totalCount = steps.length;
  const completedCount = steps.filter(s => s.is_completed).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isComplete = totalCount > 0 && completedCount === totalCount;

  // Mark step as complete mutation
  const markCompleteMutation = useMutation({
    mutationFn: async (stepId: string) => {
      if (!companyId || !user?.id) {
        throw new Error("Usuário ou empresa não identificados");
      }

      const { error } = await supabase
        .from("onboarding_progress")
        .insert({
          company_id: companyId,
          step_id: stepId,
          completed_by: user.id,
        });

      if (error) {
        // Ignore duplicate errors (already completed)
        if (error.code === "23505") {
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-progress", companyId] });
    },
    onError: (error) => {
      toast.error("Erro ao marcar etapa: " + error.message);
    },
  });

  // Set meeting status mutation
  const setMeetingStatusMutation = useMutation({
    mutationFn: async (status: 'scheduled' | 'declined') => {
      if (!companyId) {
        throw new Error("Empresa não identificada");
      }

      const { error } = await supabase
        .from("companies")
        .update({ onboarding_meeting_status: status })
        .eq("id", companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-meeting-status", companyId] });
    },
    onError: (error) => {
      toast.error("Erro ao salvar preferência: " + error.message);
    },
  });

  const markComplete = async (stepId: string) => {
    await markCompleteMutation.mutateAsync(stepId);
  };

  const setMeetingStatus = async (status: 'scheduled' | 'declined') => {
    await setMeetingStatusMutation.mutateAsync(status);
  };

  return {
    steps,
    progress,
    completedCount,
    totalCount,
    isComplete,
    isLoading: stepsLoading || progressLoading || companyLoading,
    markComplete,
    meetingUrl: meetingUrl || null,
    meetingStatus: meetingStatus || null,
    setMeetingStatus,
  };
}
