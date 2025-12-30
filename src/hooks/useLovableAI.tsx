import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChatOptions {
  conversationId: string;
  message: string;
  automationId?: string;
  context?: {
    clientName?: string;
    clientPhone?: string;
    currentStatus?: string;
    previousMessages?: Array<{ role: string; content: string }>;
  };
}

interface ClassifyOptions {
  text: string;
  conversationId?: string;
}

interface ClassificationResult {
  legalArea: string;
  legalAreaConfidence: number;
  priority: "baixa" | "média" | "alta" | "urgente";
  priorityReason: string;
  suggestedStatus: string;
  keyTopics: string[];
  needsHumanReview: boolean;
  summary: string;
}

interface TranscriptionResult {
  success: boolean;
  transcription: string;
}

interface SummaryResult {
  summary: string;
}

export function useLovableAI() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Chat - Generate response for conversation
  const generateResponse = useCallback(async (options: ChatOptions): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-chat", {
        body: options,
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.response || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar resposta";
      setError(message);
      toast({
        title: "Erro na IA",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // AI Classify - Classify case by legal area and priority
  const classifyCase = useCallback(async (options: ClassifyOptions): Promise<ClassificationResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-classify", {
        body: options,
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.classification || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao classificar";
      setError(message);
      toast({
        title: "Erro na classificação",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Transcribe audio
  const transcribeAudio = useCallback(async (audioBase64: string, mimeType?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("transcribe-audio", {
        body: { audioBase64, mimeType },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.transcription || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao transcrever";
      setError(message);
      toast({
        title: "Erro na transcrição",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Generate conversation summary
  const generateSummary = useCallback(async (conversationId: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-summary", {
        body: { conversationId },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.summary || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar resumo";
      setError(message);
      toast({
        title: "Erro no resumo",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return {
    isLoading,
    error,
    generateResponse,
    classifyCase,
    transcribeAudio,
    generateSummary,
  };
}

// Legal area labels for display
export const LEGAL_AREA_LABELS: Record<string, string> = {
  civil: "Direito Civil",
  trabalhista: "Direito Trabalhista",
  penal: "Direito Penal",
  familia: "Direito de Família",
  consumidor: "Direito do Consumidor",
  empresarial: "Direito Empresarial",
  tributario: "Direito Tributário",
  ambiental: "Direito Ambiental",
  outros: "Outros",
};

// Priority labels and colors
export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-gray-100 text-gray-700" },
  média: { label: "Média", color: "bg-blue-100 text-blue-700" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-700" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700" },
};
