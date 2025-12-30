import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { useCompanyPlan } from "./useCompanyPlan";

export type UsageType = 'ai_conversation' | 'tts_audio' | 'transcription';

interface UsageRecord {
  id: string;
  law_firm_id: string;
  usage_type: UsageType;
  count: number;
  duration_seconds: number | null;
  billing_period: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface UsageSummary {
  ai_conversations: number;
  tts_minutes: number;
  transcriptions: number;
}

interface UsageLimits {
  max_ai_conversations: number;
  max_tts_minutes: number;
  // transcriptions are unlimited
}

interface UsageStatus {
  usage: UsageSummary;
  limits: UsageLimits;
  isOverLimit: {
    ai_conversations: boolean;
    tts_minutes: boolean;
  };
  percentUsed: {
    ai_conversations: number;
    tts_minutes: number;
  };
}

/**
 * Get the current billing period in YYYY-MM format
 */
function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Hook to track and query usage records for billing purposes.
 * Tracks: AI conversations, TTS audio minutes, and transcriptions.
 */
export function useUsageTracking() {
  const { lawFirm } = useLawFirm();
  const { plan } = useCompanyPlan();
  const queryClient = useQueryClient();
  const billingPeriod = getCurrentBillingPeriod();

  // Fetch usage summary for current billing period
  const { data: usage, isLoading: isLoadingUsage } = useQuery({
    queryKey: ["usage-summary", lawFirm?.id, billingPeriod],
    queryFn: async (): Promise<UsageSummary> => {
      if (!lawFirm?.id) {
        return { ai_conversations: 0, tts_minutes: 0, transcriptions: 0 };
      }

      const { data, error } = await supabase
        .from("usage_records")
        .select("usage_type, count, duration_seconds")
        .eq("law_firm_id", lawFirm.id)
        .eq("billing_period", billingPeriod);

      if (error) {
        console.error("[useUsageTracking] Error fetching usage:", error);
        return { ai_conversations: 0, tts_minutes: 0, transcriptions: 0 };
      }

      // Aggregate by type
      const summary: UsageSummary = {
        ai_conversations: 0,
        tts_minutes: 0,
        transcriptions: 0,
      };

      for (const record of data || []) {
        switch (record.usage_type) {
          case 'ai_conversation':
            summary.ai_conversations += record.count || 1;
            break;
          case 'tts_audio':
            // Convert seconds to minutes
            summary.tts_minutes += (record.duration_seconds || 0) / 60;
            break;
          case 'transcription':
            summary.transcriptions += record.count || 1;
            break;
        }
      }

      // Round TTS minutes to 2 decimals
      summary.tts_minutes = Math.round(summary.tts_minutes * 100) / 100;

      return summary;
    },
    enabled: !!lawFirm?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Get usage status with limits and percentages
  const usageStatus: UsageStatus | null = usage && plan ? {
    usage,
    limits: {
      max_ai_conversations: (plan as any).maxAiConversations ?? 250,
      max_tts_minutes: (plan as any).maxTtsMinutes ?? 40,
    },
    isOverLimit: {
      ai_conversations: usage.ai_conversations >= ((plan as any).maxAiConversations ?? 250),
      tts_minutes: usage.tts_minutes >= ((plan as any).maxTtsMinutes ?? 40),
    },
    percentUsed: {
      ai_conversations: Math.min(100, Math.round((usage.ai_conversations / ((plan as any).maxAiConversations ?? 250)) * 100)),
      tts_minutes: Math.min(100, Math.round((usage.tts_minutes / ((plan as any).maxTtsMinutes ?? 40)) * 100)),
    },
  } : null;

  // Record a new usage event (typically called from edge functions)
  const recordUsage = useMutation({
    mutationFn: async (params: {
      usage_type: UsageType;
      count?: number;
      duration_seconds?: number;
      metadata?: Record<string, unknown>;
    }) => {
      if (!lawFirm?.id) {
        throw new Error("No law firm context");
      }

      const insertData = {
        law_firm_id: lawFirm.id,
        usage_type: params.usage_type,
        count: params.count || 1,
        duration_seconds: params.duration_seconds,
        billing_period: billingPeriod,
        metadata: params.metadata || {},
      };

      const { data, error } = await supabase
        .from("usage_records")
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usage-summary", lawFirm?.id] });
    },
  });

  return {
    usage: usage ?? { ai_conversations: 0, tts_minutes: 0, transcriptions: 0 },
    usageStatus,
    billingPeriod,
    isLoading: isLoadingUsage,
    recordUsage,
  };
}
