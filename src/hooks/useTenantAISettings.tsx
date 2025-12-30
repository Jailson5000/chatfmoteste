import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";
import { useAuth } from "./useAuth";

export type TenantAIProvider = "internal" | "n8n" | "openai";

export interface TenantAISettings {
  id: string;
  lawFirmId: string;
  aiProvider: TenantAIProvider;
  openaiApiKey: string | null;
  aiCapabilities: {
    auto_reply: boolean;
    summary: boolean;
    transcription: boolean;
    classification: boolean;
  };
  hasOpenAIKey: boolean;
  // N8N settings
  n8nWebhookUrl: string | null;
  n8nWebhookSecret: string | null;
  n8nLastTestAt: string | null;
  n8nLastTestStatus: string | null;
  // OpenAI test status
  openaiLastTestAt: string | null;
  openaiLastTestStatus: string | null;
  // Audit
  aiSettingsUpdatedBy: string | null;
  aiSettingsUpdatedAt: string | null;
}

interface UpdateTenantAIParams {
  aiProvider?: TenantAIProvider;
  openaiApiKey?: string | null;
  aiCapabilities?: Record<string, boolean>;
  n8nWebhookUrl?: string | null;
  n8nWebhookSecret?: string | null;
  n8nLastTestAt?: string | null;
  n8nLastTestStatus?: string | null;
  openaiLastTestAt?: string | null;
  openaiLastTestStatus?: string | null;
}

/**
 * Hook to manage AI settings per tenant (law firm).
 * This is separate from system-wide settings - it's per-company.
 */
export function useTenantAISettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();
  const { user } = useAuth();

  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["tenant-ai-settings", lawFirm?.id],
    queryFn: async (): Promise<TenantAISettings | null> => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("law_firm_settings")
        .select(`
          id, law_firm_id, ai_provider, openai_api_key, ai_capabilities,
          n8n_webhook_url, n8n_webhook_secret, n8n_last_test_at, n8n_last_test_status,
          openai_last_test_at, openai_last_test_status,
          ai_settings_updated_by, ai_settings_updated_at
        `)
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) {
        console.error("[useTenantAISettings] Fetch error:", error);
        throw error;
      }

      if (!data) return null;

      // Parse ai_capabilities with fallback
      const capabilities = (data.ai_capabilities as TenantAISettings["aiCapabilities"]) || {
        auto_reply: true,
        summary: true,
        transcription: true,
        classification: true,
      };

      return {
        id: data.id,
        lawFirmId: data.law_firm_id,
        aiProvider: (data.ai_provider as TenantAIProvider) || "internal",
        openaiApiKey: data.openai_api_key,
        aiCapabilities: capabilities,
        hasOpenAIKey: Boolean(data.openai_api_key && data.openai_api_key.length > 0),
        // N8N
        n8nWebhookUrl: data.n8n_webhook_url,
        n8nWebhookSecret: data.n8n_webhook_secret,
        n8nLastTestAt: data.n8n_last_test_at,
        n8nLastTestStatus: data.n8n_last_test_status,
        // OpenAI test
        openaiLastTestAt: data.openai_last_test_at,
        openaiLastTestStatus: data.openai_last_test_status,
        // Audit
        aiSettingsUpdatedBy: data.ai_settings_updated_by,
        aiSettingsUpdatedAt: data.ai_settings_updated_at,
      };
    },
    enabled: Boolean(lawFirm?.id),
  });

  const updateSettings = useMutation({
    mutationFn: async (params: UpdateTenantAIParams) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");

      // Build update object
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        ai_settings_updated_at: new Date().toISOString(),
      };

      // Add user ID for audit if available
      if (user?.id) {
        updateData.ai_settings_updated_by = user.id;
      }

      if (params.aiProvider !== undefined) {
        updateData.ai_provider = params.aiProvider;
      }
      if (params.openaiApiKey !== undefined) {
        updateData.openai_api_key = params.openaiApiKey;
      }
      if (params.aiCapabilities !== undefined) {
        updateData.ai_capabilities = params.aiCapabilities;
      }
      if (params.n8nWebhookUrl !== undefined) {
        updateData.n8n_webhook_url = params.n8nWebhookUrl;
      }
      if (params.n8nWebhookSecret !== undefined) {
        updateData.n8n_webhook_secret = params.n8nWebhookSecret;
      }
      if (params.n8nLastTestAt !== undefined) {
        updateData.n8n_last_test_at = params.n8nLastTestAt;
      }
      if (params.n8nLastTestStatus !== undefined) {
        updateData.n8n_last_test_status = params.n8nLastTestStatus;
      }
      if (params.openaiLastTestAt !== undefined) {
        updateData.openai_last_test_at = params.openaiLastTestAt;
      }
      if (params.openaiLastTestStatus !== undefined) {
        updateData.openai_last_test_status = params.openaiLastTestStatus;
      }

      // Check if settings exist
      const { data: existing } = await supabase
        .from("law_firm_settings")
        .select("id")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("law_firm_settings")
          .update(updateData)
          .eq("law_firm_id", lawFirm.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("law_firm_settings")
          .insert({
            law_firm_id: lawFirm.id,
            ...updateData,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-ai-settings"] });
      toast({
        title: "Configurações de IA salvas",
        description: "As configurações foram atualizadas com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error("[useTenantAISettings] Update error:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper to mask API key for display
  const getMaskedApiKey = () => {
    if (!settings?.openaiApiKey) return "";
    const key = settings.openaiApiKey;
    if (key.length <= 8) return "••••••••";
    return `${key.substring(0, 4)}••••••••${key.substring(key.length - 4)}`;
  };

  // Helper to mask webhook secret
  const getMaskedWebhookSecret = () => {
    if (!settings?.n8nWebhookSecret) return "";
    const secret = settings.n8nWebhookSecret;
    if (secret.length <= 8) return "••••••••";
    return `${secret.substring(0, 4)}••••••••${secret.substring(secret.length - 4)}`;
  };

  return {
    settings,
    isLoading,
    error,
    refetch,
    updateSettings,
    // Computed values
    aiProvider: settings?.aiProvider || "internal",
    hasOpenAIKey: settings?.hasOpenAIKey || false,
    maskedApiKey: getMaskedApiKey(),
    maskedWebhookSecret: getMaskedWebhookSecret(),
    hasN8nWebhook: Boolean(settings?.n8nWebhookUrl),
    aiCapabilities: settings?.aiCapabilities || {
      auto_reply: true,
      summary: true,
      transcription: true,
      classification: true,
    },
  };
}
