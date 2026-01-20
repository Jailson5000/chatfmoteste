import { useState, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Users, Wifi, Bot, Layers, MessageSquare, Volume2, Info, Lock, Unlock, DollarSign, TrendingUp } from "lucide-react";
import { calculateAdditionalCosts, formatCurrency, ADDITIONAL_PRICING } from "@/lib/billing-config";

interface Plan {
  id: string;
  name: string;
  price?: number;
  max_users: number;
  max_instances: number;
  max_agents: number;
  max_workspaces: number;
  max_ai_conversations: number;
  max_tts_minutes: number;
}

interface CompanyLimits {
  use_custom_limits: boolean;
  max_users: number;
  max_instances: number;
  max_agents: number;
  max_workspaces: number;
  max_ai_conversations: number;
  max_tts_minutes: number;
}

interface CompanyLimitsEditorProps {
  selectedPlan: Plan | null;
  limits: CompanyLimits;
  onLimitsChange: (limits: CompanyLimits) => void;
}

export function CompanyLimitsEditor({
  selectedPlan,
  limits,
  onLimitsChange,
}: CompanyLimitsEditorProps) {
  const [useCustomLimits, setUseCustomLimits] = useState(limits.use_custom_limits);

  // When plan changes and not using custom limits, update to plan defaults
  useEffect(() => {
    if (selectedPlan && !useCustomLimits) {
      onLimitsChange({
        use_custom_limits: false,
        max_users: selectedPlan.max_users,
        max_instances: selectedPlan.max_instances,
        max_agents: selectedPlan.max_agents,
        max_workspaces: selectedPlan.max_workspaces,
        max_ai_conversations: selectedPlan.max_ai_conversations,
        max_tts_minutes: selectedPlan.max_tts_minutes,
      });
    }
  }, [selectedPlan?.id, useCustomLimits]);

  const handleToggleCustomLimits = (checked: boolean) => {
    setUseCustomLimits(checked);
    if (!checked && selectedPlan) {
      // Reset to plan defaults
      onLimitsChange({
        use_custom_limits: false,
        max_users: selectedPlan.max_users,
        max_instances: selectedPlan.max_instances,
        max_agents: selectedPlan.max_agents,
        max_workspaces: selectedPlan.max_workspaces,
        max_ai_conversations: selectedPlan.max_ai_conversations,
        max_tts_minutes: selectedPlan.max_tts_minutes,
      });
    } else {
      onLimitsChange({ ...limits, use_custom_limits: true });
    }
  };

  const handleLimitChange = (field: keyof CompanyLimits, value: number) => {
    onLimitsChange({ ...limits, [field]: value, use_custom_limits: true });
    setUseCustomLimits(true);
  };

  // Calcular custos dos adicionais em tempo real
  const additionalCosts = useMemo(() => {
    if (!selectedPlan) {
      return null;
    }

    const planLimits = {
      max_users: selectedPlan.max_users,
      max_instances: selectedPlan.max_instances,
      max_agents: selectedPlan.max_agents,
      max_ai_conversations: selectedPlan.max_ai_conversations,
      max_tts_minutes: selectedPlan.max_tts_minutes,
    };

    const effectiveLimits = {
      use_custom_limits: useCustomLimits,
      max_users: limits.max_users,
      max_instances: limits.max_instances,
      max_agents: limits.max_agents,
      max_ai_conversations: limits.max_ai_conversations,
      max_tts_minutes: limits.max_tts_minutes,
    };

    const basePlanPrice = selectedPlan.price || 0;

    return calculateAdditionalCosts(planLimits, effectiveLimits, basePlanPrice);
  }, [selectedPlan, limits, useCustomLimits]);

  const limitFields = [
    {
      key: "max_users" as const,
      label: "Máx. Usuários",
      icon: <Users className="h-4 w-4" />,
      planValue: selectedPlan?.max_users,
      description: "Limite de usuários/funcionários cadastrados",
      additionalPrice: ADDITIONAL_PRICING.user,
      additionalLabel: "/ usuário",
    },
    {
      key: "max_instances" as const,
      label: "Máx. Conexões",
      icon: <Wifi className="h-4 w-4" />,
      planValue: selectedPlan?.max_instances,
      description: "Limite de conexões WhatsApp",
      additionalPrice: ADDITIONAL_PRICING.whatsappInstance,
      additionalLabel: "/ conexão",
    },
    {
      key: "max_agents" as const,
      label: "Máx. Agentes IA",
      icon: <Bot className="h-4 w-4" />,
      planValue: selectedPlan?.max_agents,
      description: "Limite de agentes de IA ativos",
      additionalPrice: null, // Negociação comercial
      additionalLabel: null,
    },
    {
      key: "max_workspaces" as const,
      label: "Máx. Workspaces",
      icon: <Layers className="h-4 w-4" />,
      planValue: selectedPlan?.max_workspaces,
      description: "Limite de workspaces/departamentos",
      additionalPrice: null,
      additionalLabel: null,
    },
    {
      key: "max_ai_conversations" as const,
      label: "Conversas IA/mês",
      icon: <MessageSquare className="h-4 w-4" />,
      planValue: selectedPlan?.max_ai_conversations,
      description: "Limite de conversas com IA por mês (cobrado por uso)",
      additionalPrice: ADDITIONAL_PRICING.aiConversation,
      additionalLabel: "/ conversa",
    },
    {
      key: "max_tts_minutes" as const,
      label: "Áudio TTS/mês",
      icon: <Volume2 className="h-4 w-4" />,
      planValue: selectedPlan?.max_tts_minutes,
      description: "Limite de minutos de áudio gerado por mês (cobrado por uso)",
      additionalPrice: ADDITIONAL_PRICING.ttsMinute,
      additionalLabel: "/ minuto",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Limites da Empresa</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {useCustomLimits ? (
                <Unlock className="h-4 w-4 text-yellow-600" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <Label htmlFor="custom-limits" className="text-sm cursor-pointer">
                Limites personalizados
              </Label>
              <Switch
                id="custom-limits"
                checked={useCustomLimits}
                onCheckedChange={handleToggleCustomLimits}
              />
            </div>
          </div>
        </div>
        {useCustomLimits && (
          <Badge variant="outline" className="w-fit text-xs bg-yellow-50 text-yellow-700 border-yellow-300 mt-2">
            Os limites abaixo sobrescrevem o plano selecionado
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {limitFields.map((field) => {
            const isModified = useCustomLimits && limits[field.key] !== field.planValue;
            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {field.icon}
                    <Label htmlFor={field.key} className="text-sm">
                      {field.label}
                    </Label>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{field.description}</p>
                        {field.planValue !== undefined && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Padrão do plano: {field.planValue}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="relative">
                  <Input
                    id={field.key}
                    type="number"
                    min={0}
                    value={limits[field.key]}
                    onChange={(e) => handleLimitChange(field.key, parseInt(e.target.value) || 0)}
                    disabled={!useCustomLimits}
                    className={`${isModified ? 'border-yellow-500 bg-yellow-50/50' : ''} ${!useCustomLimits ? 'bg-muted/50' : ''}`}
                  />
                  {!useCustomLimits && field.planValue !== undefined && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      (plano)
                    </span>
                  )}
                </div>
                {isModified && (
                  <p className="text-xs text-yellow-600">
                    Alterado de {field.planValue} para {limits[field.key]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Resumo de custos */}
      {additionalCosts && selectedPlan?.price && (
        <CardFooter className="flex-col items-start gap-3 border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-4 w-4 text-primary" />
            <span>Resumo de Faturamento Mensal</span>
          </div>
          
          <div className="w-full space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano {selectedPlan.name}</span>
              <span>{formatCurrency(additionalCosts.basePlanPrice)}</span>
            </div>

            {additionalCosts.breakdown.users.quantity > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>+ {additionalCosts.breakdown.users.quantity} usuário(s) adicional(is)</span>
                <span className="text-foreground">{formatCurrency(additionalCosts.breakdown.users.cost)}</span>
              </div>
            )}

            {additionalCosts.breakdown.instances.quantity > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>+ {additionalCosts.breakdown.instances.quantity} conexão(ões) adicional(is)</span>
                <span className="text-foreground">{formatCurrency(additionalCosts.breakdown.instances.cost)}</span>
              </div>
            )}

            {additionalCosts.breakdown.totalAdditional > 0 && (
              <>
                <Separator className="my-2" />
                <div className="flex justify-between font-medium text-base">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Total Mensal Estimado
                  </span>
                  <span className="text-primary">{formatCurrency(additionalCosts.totalMonthly)}</span>
                </div>
              </>
            )}

            {additionalCosts.breakdown.aiConversations.quantity > 0 || additionalCosts.breakdown.ttsMinutes.quantity > 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                * Conversas IA e minutos de áudio adicionais são cobrados por uso real, não pelo limite.
              </p>
            ) : null}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
