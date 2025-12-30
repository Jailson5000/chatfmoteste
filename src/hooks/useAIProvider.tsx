import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { useCompanyPlan } from "./useCompanyPlan";

export type AIProviderType = "n8n" | "internal" | "openai";

export interface AIProviderConfig {
  provider: AIProviderType;
  capabilities: {
    auto_reply: boolean;
    summary: boolean;
    transcription: boolean;
    classification: boolean;
  };
  n8nConfigured: boolean;
  internalConfigured: boolean;
  openaiConfigured: boolean;
  isEnterprise: boolean;
}

/**
 * Hook to get the current AI provider configuration for the law firm.
 * Reads from law_firm_settings to determine which AI system is active.
 * Non-enterprise plans always use internal AI.
 */
export function useAIProvider() {
  const { lawFirm } = useLawFirm();
  const { isEnterprise } = useCompanyPlan();

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ["ai-provider-config", lawFirm?.id, isEnterprise],
    queryFn: async (): Promise<AIProviderConfig> => {
      if (!lawFirm?.id) {
        return getDefaultConfig();
      }

      // Non-enterprise plans always use internal AI
      if (!isEnterprise) {
        return {
          ...getDefaultConfig(),
          isEnterprise: false,
        };
      }

      // Get law firm settings for Enterprise plans
      const { data: settings } = await supabase
        .from("law_firm_settings")
        .select("ai_provider, ai_capabilities, openai_api_key, evolution_api_url")
        .eq("law_firm_id", lawFirm.id)
        .single();

      // Check if n8n is configured (has Evolution API URL)
      const n8nConfigured = Boolean(settings?.evolution_api_url);
      
      // Check if OpenAI is configured
      const openaiConfigured = Boolean(settings?.openai_api_key);

      const provider = (settings?.ai_provider as AIProviderType) || "internal";
      const capabilities = (settings?.ai_capabilities as AIProviderConfig["capabilities"]) || {
        auto_reply: true,
        summary: true,
        transcription: true,
        classification: true,
      };

      return {
        provider,
        capabilities,
        n8nConfigured,
        internalConfigured: true, // Internal AI (MiauChat AI) is always available
        openaiConfigured,
        isEnterprise: true,
      };
    },
    enabled: !!lawFirm?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  return {
    config: config || getDefaultConfig(),
    isLoading,
    refetch,
    isN8N: config?.provider === "n8n",
    isInternal: config?.provider === "internal",
    isOpenAI: config?.provider === "openai",
    isEnterprise: config?.isEnterprise || false,
    providerLabel: getProviderLabel(config?.provider || "internal"),
  };
}

function getDefaultConfig(): AIProviderConfig {
  return {
    provider: "internal",
    capabilities: {
      auto_reply: true,
      summary: true,
      transcription: true,
      classification: true,
    },
    n8nConfigured: false,
    internalConfigured: true,
    openaiConfigured: false,
    isEnterprise: false,
  };
}

function getProviderLabel(provider: AIProviderType): string {
  switch (provider) {
    case "n8n":
      return "N8N";
    case "internal":
      return "MiauChat AI";
    case "openai":
      return "OpenAI";
    default:
      return "MiauChat AI";
  }
}
