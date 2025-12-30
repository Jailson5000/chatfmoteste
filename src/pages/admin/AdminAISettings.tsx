import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Bot, 
  Sparkles, 
  Workflow, 
  CheckCircle2, 
  AlertCircle,
  Zap,
  Brain,
  MessageSquare,
  FileText,
  Mic,
  Tags
} from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";
import { toast } from "sonner";

type AIProvider = "lovable" | "n8n" | "hybrid";

interface AICapability {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  lovableSupport: boolean;
  n8nSupport: boolean;
}

const AI_CAPABILITIES: AICapability[] = [
  {
    id: "auto_reply",
    name: "Respostas Automáticas",
    description: "Responder mensagens automaticamente via WhatsApp",
    icon: <MessageSquare className="h-4 w-4" />,
    lovableSupport: true,
    n8nSupport: true
  },
  {
    id: "summary",
    name: "Resumo de Conversas",
    description: "Gerar resumos automáticos das conversas",
    icon: <FileText className="h-4 w-4" />,
    lovableSupport: true,
    n8nSupport: true
  },
  {
    id: "transcription",
    name: "Transcrição de Áudio",
    description: "Transcrever mensagens de áudio para texto",
    icon: <Mic className="h-4 w-4" />,
    lovableSupport: true,
    n8nSupport: false
  },
  {
    id: "classification",
    name: "Classificação de Casos",
    description: "Classificar área jurídica e prioridade automaticamente",
    icon: <Tags className="h-4 w-4" />,
    lovableSupport: true,
    n8nSupport: true
  }
];

export default function AdminAISettings() {
  const { settings, updateSetting, createSetting, isLoading } = useSystemSettings();
  const { settings: lawFirmSettings } = useLawFirmSettings();
  const [provider, setProvider] = useState<AIProvider>("lovable");
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({
    auto_reply: true,
    summary: true,
    transcription: true,
    classification: true
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load settings
  useEffect(() => {
    if (settings) {
      const providerSetting = settings.find(s => s.key === "ai_provider");
      if (providerSetting) {
        setProvider(providerSetting.value as AIProvider);
      }
      
      const capabilitiesSetting = settings.find(s => s.key === "ai_capabilities");
      if (capabilitiesSetting && typeof capabilitiesSetting.value === "object") {
        setCapabilities(capabilitiesSetting.value as Record<string, boolean>);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const providerSetting = settings?.find(s => s.key === "ai_provider");
      if (providerSetting) {
        await updateSetting.mutateAsync({ key: "ai_provider", value: provider });
      } else {
        await createSetting.mutateAsync({ 
          key: "ai_provider", 
          value: provider,
          category: "ai",
          description: "Provedor de IA ativo"
        });
      }

      const capabilitiesSetting = settings?.find(s => s.key === "ai_capabilities");
      if (capabilitiesSetting) {
        await updateSetting.mutateAsync({ key: "ai_capabilities", value: capabilities });
      } else {
        await createSetting.mutateAsync({ 
          key: "ai_capabilities", 
          value: capabilities,
          category: "ai",
          description: "Funcionalidades de IA habilitadas"
        });
      }

      toast.success("Configurações de IA salvas com sucesso!");
    } catch (error) {
      console.error("Error saving AI settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const hasN8nConfigured = Boolean(lawFirmSettings?.evolution_api_url);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6" />
          Configurações de IA
        </h1>
        <p className="text-muted-foreground">
          Escolha o provedor de IA e configure as funcionalidades
        </p>
      </div>

      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Provedor de IA
          </CardTitle>
          <CardDescription>
            Selecione qual sistema de IA será usado para processar as mensagens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            value={provider} 
            onValueChange={(value) => setProvider(value as AIProvider)}
            className="space-y-4"
          >
            {/* Lovable AI Option */}
            <div className={`relative flex items-start space-x-4 rounded-lg border p-4 transition-colors ${provider === "lovable" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="lovable" id="lovable" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="lovable" className="font-semibold text-base cursor-pointer">
                    Lovable AI
                  </Label>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Recomendado
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  IA integrada com modelos GPT-5 e Gemini. Sem necessidade de API key externa.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    Gratuito incluso
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1 text-amber-500" />
                    Alta velocidade
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Brain className="h-3 w-3 mr-1 text-purple-500" />
                    Múltiplos modelos
                  </Badge>
                </div>
              </div>
            </div>

            {/* N8N Option */}
            <div className={`relative flex items-start space-x-4 rounded-lg border p-4 transition-colors ${provider === "n8n" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="n8n" id="n8n" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="n8n" className="font-semibold text-base cursor-pointer">
                    N8N + OpenAI
                  </Label>
                  {!hasN8nConfigured && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Não configurado
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Automação via workflows N8N com integração OpenAI. Requer configuração externa.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Workflow className="h-3 w-3 mr-1 text-blue-500" />
                    Workflows customizados
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Bot className="h-3 w-3 mr-1 text-orange-500" />
                    API key necessária
                  </Badge>
                </div>
              </div>
            </div>

            {/* Hybrid Option */}
            <div className={`relative flex items-start space-x-4 rounded-lg border p-4 transition-colors ${provider === "hybrid" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="hybrid" id="hybrid" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="hybrid" className="font-semibold text-base cursor-pointer">
                    Híbrido
                  </Label>
                  <Badge variant="outline" className="text-xs">Avançado</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use Lovable AI para funcionalidades básicas e N8N para automações avançadas.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1 text-emerald-500" />
                    Lovable para chat
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Workflow className="h-3 w-3 mr-1 text-blue-500" />
                    N8N para workflows
                  </Badge>
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Funcionalidades
          </CardTitle>
          <CardDescription>
            Ative ou desative funcionalidades específicas de IA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {AI_CAPABILITIES.map((capability, index) => {
            const isSupported = provider === "lovable" 
              ? capability.lovableSupport 
              : provider === "n8n" 
                ? capability.n8nSupport 
                : capability.lovableSupport || capability.n8nSupport;

            return (
              <div key={capability.id}>
                {index > 0 && <Separator className="my-4" />}
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      {capability.icon}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={capability.id} className="font-medium">
                          {capability.name}
                        </Label>
                        {!isSupported && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            Não suportado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {capability.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={capability.id}
                    checked={capabilities[capability.id] && isSupported}
                    onCheckedChange={(checked) => 
                      setCapabilities(prev => ({ ...prev, [capability.id]: checked }))
                    }
                    disabled={!isSupported}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Comparação de Provedores</CardTitle>
          <CardDescription>
            Veja as diferenças entre Lovable AI e N8N
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Recurso</th>
                  <th className="text-center py-3 px-4 font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      Lovable AI
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <Workflow className="h-4 w-4 text-blue-500" />
                      N8N
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-4">Configuração</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                      Automática
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="outline">Manual</Badge>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">API Key</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                      Não necessária
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="outline">Necessária</Badge>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Modelos</td>
                  <td className="py-3 px-4 text-center">GPT-5, Gemini 2.5</td>
                  <td className="py-3 px-4 text-center">OpenAI (config.)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Transcrição de Áudio</td>
                  <td className="py-3 px-4 text-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Workflows Customizados</td>
                  <td className="py-3 px-4 text-center">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Custo</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                      Incluído
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="outline">Por uso</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
