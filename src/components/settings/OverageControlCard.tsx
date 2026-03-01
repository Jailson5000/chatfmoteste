import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MessageSquare, Mic, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, ADDITIONAL_PRICING } from "@/lib/billing-config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";

interface OverageControlCardProps {
  companyData: {
    id: string;
    allow_ai_overage?: boolean;
    allow_tts_overage?: boolean;
  } | null;
  onUpdate?: () => void;
}

export function OverageControlCard({ companyData, onUpdate }: OverageControlCardProps) {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState<'ai' | 'tts' | null>(null);
  const [allowAiOverage, setAllowAiOverage] = useState(companyData?.allow_ai_overage ?? false);
  const [allowTtsOverage, setAllowTtsOverage] = useState(companyData?.allow_tts_overage ?? false);

  useEffect(() => {
    if (companyData) {
      setAllowAiOverage(companyData.allow_ai_overage ?? false);
      setAllowTtsOverage(companyData.allow_tts_overage ?? false);
    }
  }, [companyData]);

  const handleToggleOverage = async (type: 'ai' | 'tts', enabled: boolean) => {
    if (!companyData?.id) {
      toast.error("Empresa não encontrada");
      return;
    }

    setIsUpdating(type);
    
    try {
      const updateData = type === 'ai' 
        ? { allow_ai_overage: enabled }
        : { allow_tts_overage: enabled };

      const { error } = await supabase
        .from("companies")
        .update(updateData)
        .eq("id", companyData.id);

      if (error) throw error;

      if (type === 'ai') {
        setAllowAiOverage(enabled);
      } else {
        setAllowTtsOverage(enabled);
      }

      toast.success(
        enabled 
          ? `Consumo adicional de ${type === 'ai' ? 'conversas IA' : 'áudio'} habilitado`
          : `Consumo adicional de ${type === 'ai' ? 'conversas IA' : 'áudio'} desabilitado`
      );

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["company-billing"] });
      queryClient.invalidateQueries({ queryKey: ["company-usage-summary"] });
      onUpdate?.();
    } catch (error) {
      console.error("Error updating overage setting:", error);
      toast.error("Erro ao atualizar configuração");
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Consumo Adicional</CardTitle>
        <CardDescription className="text-xs">
          Habilite para continuar usando além do limite do plano
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* AI Conversations */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">Conversas IA</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(ADDITIONAL_PRICING.aiConversation)}/conversa
                </p>
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    {isUpdating === 'ai' && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Switch
                      checked={allowAiOverage}
                      onCheckedChange={(checked) => handleToggleOverage('ai', checked)}
                      disabled={isUpdating !== null}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">
                    {allowAiOverage 
                      ? "Desabilitar: ao atingir o limite, a IA será pausada"
                      : "Habilitar: ao atingir o limite, você será cobrado por conversa adicional"
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* TTS Minutes */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              <Mic className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">Minutos de Áudio</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(ADDITIONAL_PRICING.ttsMinute)}/minuto
                </p>
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    {isUpdating === 'tts' && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Switch
                      checked={allowTtsOverage}
                      onCheckedChange={(checked) => handleToggleOverage('tts', checked)}
                      disabled={isUpdating !== null}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">
                    {allowTtsOverage 
                      ? "Desabilitar: ao atingir o limite, áudios não serão gerados"
                      : "Habilitar: ao atingir o limite, você será cobrado por minuto adicional"
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mt-3">
          * Quando desabilitado, o serviço será pausado ao atingir o limite do plano.
        </p>
      </CardContent>
    </Card>
  );
}
