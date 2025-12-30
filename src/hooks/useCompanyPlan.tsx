import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";

interface PlanInfo {
  id: string;
  name: string;
  features: string[];
  maxUsers: number;
  maxInstances: number;
  maxAiConversations: number;
  maxTtsMinutes: number;
  maxAgents: number;
  maxWorkspaces: number;
}

interface CompanyPlanResult {
  plan: PlanInfo | null;
  isEnterprise: boolean;
  canConfigureAI: boolean;
  canUseN8N: boolean;
  canUseOpenAI: boolean;
  isLoading: boolean;
}

/**
 * Hook to get the company's plan and check feature availability.
 * Enterprise plan unlocks advanced AI configuration options.
 */
export function useCompanyPlan(): CompanyPlanResult {
  const { lawFirm } = useLawFirm();

  const { data, isLoading } = useQuery({
    queryKey: ["company-plan", lawFirm?.id],
    queryFn: async (): Promise<PlanInfo | null> => {
      if (!lawFirm?.id) return null;

      // Get company linked to this law firm
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("plan_id")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (companyError || !company?.plan_id) {
        console.log("[useCompanyPlan] No company or plan found for law firm");
        return null;
      }

      // Get plan details
      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("*")
        .eq("id", company.plan_id)
        .single();

      if (planError || !plan) {
        console.log("[useCompanyPlan] Plan not found:", planError);
        return null;
      }

      return {
        id: plan.id,
        name: plan.name,
        features: Array.isArray(plan.features) ? plan.features as string[] : [],
        maxUsers: plan.max_users ?? 5,
        maxInstances: plan.max_instances ?? 2,
        maxAiConversations: (plan as any).max_ai_conversations ?? 250,
        maxTtsMinutes: (plan as any).max_tts_minutes ?? 40,
        maxAgents: (plan as any).max_agents ?? 1,
        maxWorkspaces: (plan as any).max_workspaces ?? 1,
      };
    },
    enabled: !!lawFirm?.id,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Check if plan is Enterprise (case-insensitive)
  const isEnterprise = data?.name?.toLowerCase() === "enterprise";

  return {
    plan: data ?? null,
    isEnterprise,
    // Only Enterprise can configure AI provider
    canConfigureAI: isEnterprise,
    // Only Enterprise can use n8n
    canUseN8N: isEnterprise,
    // Only Enterprise can use own OpenAI API key
    canUseOpenAI: isEnterprise,
    isLoading,
  };
}
