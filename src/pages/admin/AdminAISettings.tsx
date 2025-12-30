import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Tags,
  Key,
  Lock,
  Eye,
  EyeOff,
  Crown,
  Shield
} from "lucide-react";
import { useCompanyPlan } from "@/hooks/useCompanyPlan";
import { useTenantAISettings, TenantAIProvider } from "@/hooks/useTenantAISettings";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";
import { toast } from "sonner";

interface AICapability {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  internalSupport: boolean;
  n8nSupport: boolean;
  openaiSupport: boolean;
}

const AI_CAPABILITIES: AICapability[] = [
  {
    id: "auto_reply",
    name: "Respostas Automáticas",
    description: "Responder mensagens automaticamente via WhatsApp",
    icon: <MessageSquare className="h-4 w-4" />,
    internalSupport: true,
    n8nSupport: true,
    openaiSupport: true
  },
  {
    id: "summary",
    name: "Resumo de Conversas",
    description: "Gerar resumos automáticos das conversas",
    icon: <FileText className="h-4 w-4" />,
    internalSupport: true,
    n8nSupport: true,
    openaiSupport: true
  },
  {
    id: "transcription",
    name: "Transcrição de Áudio",
    description: "Transcrever mensagens de áudio para texto",
    icon: <Mic className="h-4 w-4" />,
    internalSupport: true,
    n8nSupport: false,
    openaiSupport: true
  },
  {
    id: "classification",
    name: "Classificação de Casos",
    description: "Classificar área jurídica e prioridade automaticamente",
    icon: <Tags className="h-4 w-4" />,
    internalSupport: true,
    n8nSupport: true,
    openaiSupport: true
  }
];

export default function AdminAISettings() {
  const { plan, isEnterprise, canConfigureAI, isLoading: planLoading } = useCompanyPlan();
  const { 
    settings: aiSettings, 
    updateSettings, 
    maskedApiKey,
    isLoading: aiLoading 
  } = useTenantAISettings();
  const { settings: lawFirmSettings } = useLawFirmSettings();
  
  const [provider, setProvider] = useState<TenantAIProvider>("internal");
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({
    auto_reply: true,
    summary: true,
    transcription: true,
    classification: true
  });
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings from tenant AI settings
  useEffect(() => {
    if (aiSettings) {
      setProvider(aiSettings.aiProvider);
      setCapabilities(aiSettings.aiCapabilities);
      // Don't load actual API key for security, just show if it exists
    }
  }, [aiSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData: {
        aiProvider: TenantAIProvider;
        aiCapabilities: Record<string, boolean>;
        openaiApiKey?: string | null;
      } = {
        aiProvider: provider,
        aiCapabilities: capabilities,
      };

      // Only update API key if user entered a new one
      if (openaiApiKey.trim()) {
        updateData.openaiApiKey = openaiApiKey.trim();
      }

      await updateSettings.mutateAsync(updateData);
      setOpenaiApiKey(""); // Clear input after save
      toast.success("Configurações de IA salvas com sucesso!");
    } catch (error) {
      console.error("Error saving AI settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({ openaiApiKey: null });
      toast.success("API Key removida com sucesso");
    } catch (error) {
      toast.error("Erro ao remover API Key");
    } finally {
      setIsSaving(false);
    }
  };

  const hasN8nConfigured = Boolean(lawFirmSettings?.evolution_api_url);
  const isLoading = planLoading || aiLoading;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Non-Enterprise users: Show limited view
  if (!canConfigureAI) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            Configurações de IA
          </h1>
          <p className="text-muted-foreground">
            Configurações de inteligência artificial do sistema
          </p>
        </div>

        {/* Plan indicator */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Plano {plan?.name || "Básico"}</AlertTitle>
          <AlertDescription>
            Seu plano utiliza a IA do MiauChat por padrão. Para configurar provedores 
            alternativos como N8N ou OpenAI, faça upgrade para o plano Enterprise.
          </AlertDescription>
        </Alert>

        {/* Current AI Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              IA Ativa
            </CardTitle>
            <CardDescription>
              Provedor de IA configurado para sua empresa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
              <div className="p-2 rounded-full bg-emerald-500/10">
                <Sparkles className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold">MiauChat AI</p>
                <p className="text-sm text-muted-foreground">
                  IA integrada do sistema • Incluída no plano
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto bg-emerald-500/10 text-emerald-600">
                Ativo
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Capabilities (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Funcionalidades Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {AI_CAPABILITIES.filter(c => c.internalSupport).map((capability, index) => (
              <div key={capability.id}>
                {index > 0 && <Separator className="my-4" />}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    {capability.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{capability.name}</p>
                    <p className="text-sm text-muted-foreground">{capability.description}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upgrade CTA */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <Crown className="h-5 w-5" />
              Upgrade para Enterprise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              O plano Enterprise desbloqueia configurações avançadas de IA:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Escolha do provedor de IA
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Integração com N8N + workflows personalizados
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Usar sua própria API Key da OpenAI
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Controle total sobre o processamento de IA
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Enterprise users: Full configuration
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6" />
          Configurações de IA
          <Badge variant="secondary" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
            <Crown className="h-3 w-3 mr-1" />
            Enterprise
          </Badge>
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
            onValueChange={(value) => setProvider(value as TenantAIProvider)}
            className="space-y-4"
          >
            {/* MiauChat AI (Internal) Option */}
            <div className={`relative flex items-start space-x-4 rounded-lg border p-4 transition-colors ${provider === "internal" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="internal" id="internal" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="internal" className="font-semibold text-base cursor-pointer">
                    MiauChat AI
                  </Label>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Padrão
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  IA integrada do MiauChat. Processamento interno sem dependências externas.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    Incluído no plano
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1 text-amber-500" />
                    Alta velocidade
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
                    N8N + Workflows
                  </Label>
                  {!hasN8nConfigured && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Não configurado
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Automação via workflows N8N. Requer configuração do webhook N8N.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Workflow className="h-3 w-3 mr-1 text-blue-500" />
                    Workflows customizados
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Bot className="h-3 w-3 mr-1 text-orange-500" />
                    Controle total
                  </Badge>
                </div>
              </div>
            </div>

            {/* OpenAI Option */}
            <div className={`relative flex items-start space-x-4 rounded-lg border p-4 transition-colors ${provider === "openai" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="openai" id="openai" className="mt-1" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="openai" className="font-semibold text-base cursor-pointer">
                    OpenAI (API Key Própria)
                  </Label>
                  {!aiSettings?.hasOpenAIKey && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      <Key className="h-3 w-3 mr-1" />
                      Requer API Key
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Use sua própria API Key da OpenAI. Você tem controle total sobre custos e modelos.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Key className="h-3 w-3 mr-1 text-purple-500" />
                    Sua API Key
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1 text-emerald-500" />
                    Dados isolados
                  </Badge>
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* OpenAI API Key Configuration */}
      {provider === "openai" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              OpenAI API Key
            </CardTitle>
            <CardDescription>
              Configure sua API Key da OpenAI para processamento de mensagens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current key status */}
            {aiSettings?.hasOpenAIKey && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                <Lock className="h-4 w-4 text-emerald-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">API Key configurada</p>
                  <p className="text-xs text-muted-foreground font-mono">{maskedApiKey}</p>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleRemoveApiKey}
                  disabled={isSaving}
                >
                  Remover
                </Button>
              </div>
            )}

            {/* New key input */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                {aiSettings?.hasOpenAIKey ? "Nova API Key (substituir)" : "API Key"}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sua API Key é armazenada de forma segura e nunca é exposta.
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Importante</AlertTitle>
              <AlertDescription>
                Ao usar sua própria API Key, você assume os custos de uso da OpenAI. 
                Nenhuma requisição passará pela infraestrutura do MiauChat.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

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
            const isSupported = provider === "internal" 
              ? capability.internalSupport 
              : provider === "n8n" 
                ? capability.n8nSupport 
                : capability.openaiSupport;

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
            Veja as diferenças entre os provedores de IA disponíveis
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
                      MiauChat
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <Workflow className="h-4 w-4 text-blue-500" />
                      N8N
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <Key className="h-4 w-4 text-purple-500" />
                      OpenAI
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
                    <Badge variant="outline">Webhook</Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="outline">API Key</Badge>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Custo</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                      Incluído
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="outline">Externo</Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="outline">Por uso</Badge>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Controle</td>
                  <td className="py-3 px-4 text-center">Básico</td>
                  <td className="py-3 px-4 text-center">Total</td>
                  <td className="py-3 px-4 text-center">Total</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Dados</td>
                  <td className="py-3 px-4 text-center">MiauChat</td>
                  <td className="py-3 px-4 text-center">Seu N8N</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="bg-purple-500/10 text-purple-600">
                      Isolados
                    </Badge>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Workflows</td>
                  <td className="py-3 px-4 text-center">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mx-auto" />
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
