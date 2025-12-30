import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Wifi, Bot, Layers, MessageSquare, Volume2, Info, Lock, Unlock } from "lucide-react";

interface Plan {
  id: string;
  name: string;
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

  const limitFields = [
    {
      key: "max_users" as const,
      label: "Máx. Usuários",
      icon: <Users className="h-4 w-4" />,
      planValue: selectedPlan?.max_users,
      description: "Limite de usuários/funcionários cadastrados",
    },
    {
      key: "max_instances" as const,
      label: "Máx. Conexões",
      icon: <Wifi className="h-4 w-4" />,
      planValue: selectedPlan?.max_instances,
      description: "Limite de conexões WhatsApp",
    },
    {
      key: "max_agents" as const,
      label: "Máx. Agentes IA",
      icon: <Bot className="h-4 w-4" />,
      planValue: selectedPlan?.max_agents,
      description: "Limite de agentes de IA ativos",
    },
    {
      key: "max_workspaces" as const,
      label: "Máx. Workspaces",
      icon: <Layers className="h-4 w-4" />,
      planValue: selectedPlan?.max_workspaces,
      description: "Limite de workspaces/departamentos",
    },
    {
      key: "max_ai_conversations" as const,
      label: "Conversas IA/mês",
      icon: <MessageSquare className="h-4 w-4" />,
      planValue: selectedPlan?.max_ai_conversations,
      description: "Limite de conversas com IA por mês",
    },
    {
      key: "max_tts_minutes" as const,
      label: "Áudio TTS/mês",
      icon: <Volume2 className="h-4 w-4" />,
      planValue: selectedPlan?.max_tts_minutes,
      description: "Limite de minutos de áudio gerado por mês",
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
    </Card>
  );
}
