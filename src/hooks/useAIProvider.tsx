import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";

export type AIProviderType = "n8n" | "internal" | "hybrid";

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
}

/**
 * Hook to get the current AI provider configuration for the law firm.
 * Reads from law_firm_settings to determine which AI system is active.
 */
export function useAIProvider() {
  const { lawFirm } = useLawFirm();

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ["ai-provider-config", lawFirm?.id],
    queryFn: async (): Promise<AIProviderConfig> => {
      if (!lawFirm?.id) {
        return getDefaultConfig();
      }

      // Get law firm settings to check n8n configuration
      const { data: settings } = await supabase
        .from("law_firm_settings")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .single();

      // Check if n8n is configured (has API URL)
      const n8nConfigured = Boolean(settings?.evolution_api_url);

      // Check for AI provider setting in system_settings
      const { data: providerSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "ai_provider")
        .single();

      const { data: capabilitiesSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "ai_capabilities")
        .single();

      const provider = (providerSetting?.value as AIProviderType) || "n8n";
      const capabilities = (capabilitiesSetting?.value as AIProviderConfig["capabilities"]) || {
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
    isHybrid: config?.provider === "hybrid",
    providerLabel: getProviderLabel(config?.provider || "n8n"),
  };
}

function getDefaultConfig(): AIProviderConfig {
  return {
    provider: "n8n",
    capabilities: {
      auto_reply: true,
      summary: true,
      transcription: true,
      classification: true,
    },
    n8nConfigured: false,
    internalConfigured: true,
  };
}

function getProviderLabel(provider: AIProviderType): string {
  switch (provider) {
    case "n8n":
      return "N8N";
    case "internal":
      return "MiauChat AI";
    case "hybrid":
      return "Híbrido";
    default:
      return "N8N";
  }
}
