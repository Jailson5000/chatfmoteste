import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { toast } from "sonner";

export type LimitType = 'users' | 'instances' | 'agents' | 'ai_conversations' | 'tts_minutes';

interface LimitCheckResult {
  allowed: boolean;
  warning?: boolean;
  current: number;
  max: number;
  buffer_max?: number;
  percent_used?: number;
  message?: string;
  needs_upgrade?: boolean;
  error?: string;
}

interface CompanyUsageSummary {
  company_id: string;
  law_firm_id: string;
  company_name: string;
  plan_id: string | null;
  plan_name: string | null;
  use_custom_limits: boolean;
  // Effective limits
  effective_max_users: number;
  effective_max_instances: number;
  effective_max_agents: number;
  effective_max_workspaces: number;
  effective_max_ai_conversations: number;
  effective_max_tts_minutes: number;
  // Current usage
  current_users: number;
  current_instances: number;
  current_agents: number;
  current_ai_conversations: number;
  current_tts_minutes: number;
}

/**
 * Hook to check and enforce company limits before actions.
 * Uses the check_company_limit database function with 10% buffer.
 */
export function useCompanyLimits() {
  const { lawFirm } = useLawFirm();

  // Fetch current usage summary
  const { data: usageSummary, isLoading, refetch } = useQuery({
    queryKey: ["company-usage-summary", lawFirm?.id],
    queryFn: async (): Promise<CompanyUsageSummary | null> => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("company_usage_summary")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) {
        console.error("[useCompanyLimits] Error fetching usage summary:", error);
        return null;
      }

      return data as CompanyUsageSummary;
    },
    enabled: !!lawFirm?.id,
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
  });

  /**
   * Check if an action is allowed based on limits.
   * Shows toast warnings/errors automatically.
   */
  const checkLimit = async (
    limitType: LimitType,
    increment: number = 1,
    showToast: boolean = true
  ): Promise<LimitCheckResult> => {
    if (!lawFirm?.id) {
      return { allowed: false, current: 0, max: 0, error: "Empresa não encontrada" };
    }

    try {
      const { data, error } = await supabase.rpc("check_company_limit", {
        _law_firm_id: lawFirm.id,
        _limit_type: limitType,
        _increment: increment,
      });

      if (error) {
        console.error("[useCompanyLimits] Error checking limit:", error);
        return { allowed: false, current: 0, max: 0, error: error.message };
      }

      const result = data as unknown as LimitCheckResult;

      // Show toast based on result
      if (showToast) {
        if (!result.allowed && result.needs_upgrade) {
          toast.error("Limite atingido", {
            description: result.message || "Entre em contato com o suporte para ampliar seu plano.",
          });
        } else if (result.warning) {
          toast.warning("Próximo do limite", {
            description: result.message || "Considere fazer um upgrade do seu plano.",
          });
        }
      }

      return result;
    } catch (err: any) {
      console.error("[useCompanyLimits] Exception:", err);
      return { allowed: false, current: 0, max: 0, error: err.message };
    }
  };

  /**
   * Calculate percentage of limit used
   */
  const getPercentUsed = (current: number, max: number): number => {
    if (max <= 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  };

  /**
   * Check if at 80% or more of limit (warning threshold)
   */
  const isNearLimit = (current: number, max: number): boolean => {
    return getPercentUsed(current, max) >= 80;
  };

  /**
   * Check if at or over limit
   */
  const isAtLimit = (current: number, max: number): boolean => {
    return current >= max;
  };

  // Pre-calculated status for each limit type
  const limitsStatus = usageSummary ? {
    users: {
      current: usageSummary.current_users,
      max: usageSummary.effective_max_users,
      percent: getPercentUsed(usageSummary.current_users, usageSummary.effective_max_users),
      nearLimit: isNearLimit(usageSummary.current_users, usageSummary.effective_max_users),
      atLimit: isAtLimit(usageSummary.current_users, usageSummary.effective_max_users),
    },
    instances: {
      current: usageSummary.current_instances,
      max: usageSummary.effective_max_instances,
      percent: getPercentUsed(usageSummary.current_instances, usageSummary.effective_max_instances),
      nearLimit: isNearLimit(usageSummary.current_instances, usageSummary.effective_max_instances),
      atLimit: isAtLimit(usageSummary.current_instances, usageSummary.effective_max_instances),
    },
    agents: {
      current: usageSummary.current_agents,
      max: usageSummary.effective_max_agents,
      percent: getPercentUsed(usageSummary.current_agents, usageSummary.effective_max_agents),
      nearLimit: isNearLimit(usageSummary.current_agents, usageSummary.effective_max_agents),
      atLimit: isAtLimit(usageSummary.current_agents, usageSummary.effective_max_agents),
    },
    ai_conversations: {
      current: usageSummary.current_ai_conversations,
      max: usageSummary.effective_max_ai_conversations,
      percent: getPercentUsed(usageSummary.current_ai_conversations, usageSummary.effective_max_ai_conversations),
      nearLimit: isNearLimit(usageSummary.current_ai_conversations, usageSummary.effective_max_ai_conversations),
      atLimit: isAtLimit(usageSummary.current_ai_conversations, usageSummary.effective_max_ai_conversations),
    },
    tts_minutes: {
      current: usageSummary.current_tts_minutes,
      max: usageSummary.effective_max_tts_minutes,
      percent: getPercentUsed(usageSummary.current_tts_minutes, usageSummary.effective_max_tts_minutes),
      nearLimit: isNearLimit(usageSummary.current_tts_minutes, usageSummary.effective_max_tts_minutes),
      atLimit: isAtLimit(usageSummary.current_tts_minutes, usageSummary.effective_max_tts_minutes),
    },
  } : null;

  return {
    usageSummary,
    limitsStatus,
    isLoading,
    checkLimit,
    getPercentUsed,
    isNearLimit,
    isAtLimit,
    refetch,
  };
}
