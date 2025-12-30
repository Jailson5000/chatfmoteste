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
  Shield,
  Loader2,
  TestTube,
  Clock,
  User,
  Activity
} from "lucide-react";
import { useCompanyPlan } from "@/hooks/useCompanyPlan";
import { useTenantAISettings, TenantAIProvider } from "@/hooks/useTenantAISettings";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
    maskedWebhookSecret,
    hasN8nWebhook,
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
  
  // OpenAI fields
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  
  // N8N fields
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
  const [n8nWebhookSecret, setN8nWebhookSecret] = useState("");
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  
  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingOpenai, setIsTestingOpenai] = useState(false);
  const [isTestingN8n, setIsTestingN8n] = useState(false);
  
  // Test results
  const [openaiTestResult, setOpenaiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [n8nTestResult, setN8nTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load settings from tenant AI settings
  useEffect(() => {
    if (aiSettings) {
      setProvider(aiSettings.aiProvider);
      setCapabilities(aiSettings.aiCapabilities);
      // Load N8N URL if exists
      if (aiSettings.n8nWebhookUrl) {
        setN8nWebhookUrl(aiSettings.n8nWebhookUrl);
      }
    }
  }, [aiSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData: {
        aiProvider: TenantAIProvider;
        aiCapabilities: Record<string, boolean>;
        openaiApiKey?: string | null;
        n8nWebhookUrl?: string | null;
        n8nWebhookSecret?: string | null;
      } = {
        aiProvider: provider,
        aiCapabilities: capabilities,
      };

      // Only update OpenAI API key if user entered a new one
      if (openaiApiKey.trim()) {
        updateData.openaiApiKey = openaiApiKey.trim();
      }

      // Update N8N settings
      if (provider === "n8n") {
        updateData.n8nWebhookUrl = n8nWebhookUrl.trim() || null;
        if (n8nWebhookSecret.trim()) {
          updateData.n8nWebhookSecret = n8nWebhookSecret.trim();
        }
      }

      await updateSettings.mutateAsync(updateData);
      setOpenaiApiKey(""); // Clear input after save
      setN8nWebhookSecret(""); // Clear secret after save
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

  const handleTestOpenaiKey = async () => {
    const keyToTest = openaiApiKey.trim();
    if (!keyToTest) {
      toast.error("Digite uma API Key para testar");
      return;
    }

    setIsTestingOpenai(true);
    setOpenaiTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("test-openai-key", {
        body: { apiKey: keyToTest },
      });

      if (error) throw error;

      const now = new Date().toISOString();
      
      if (data.success) {
        setOpenaiTestResult({ success: true, message: data.message || "Conexão validada com sucesso!" });
        toast.success("API Key válida!");
        // Update test status
        await updateSettings.mutateAsync({ 
          openaiLastTestAt: now, 
          openaiLastTestStatus: "success" 
        });
      } else {
        setOpenaiTestResult({ success: false, message: data.error || "API Key inválida" });
        toast.error("API Key inválida");
        await updateSettings.mutateAsync({ 
          openaiLastTestAt: now, 
          openaiLastTestStatus: "error" 
        });
      }
    } catch (error) {
      console.error("Error testing API key:", error);
      setOpenaiTestResult({ success: false, message: "Erro ao testar conexão" });
      toast.error("Erro ao testar conexão");
    } finally {
      setIsTestingOpenai(false);
    }
  };

  const handleTestN8nWebhook = async () => {
    const urlToTest = n8nWebhookUrl.trim();
    if (!urlToTest) {
      toast.error("Digite a URL do webhook para testar");
      return;
    }

    setIsTestingN8n(true);
    setN8nTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("test-n8n-webhook", {
        body: { 
          webhookUrl: urlToTest, 
          secret: n8nWebhookSecret.trim() || aiSettings?.n8nWebhookSecret || undefined 
        },
      });

      if (error) throw error;

      const now = new Date().toISOString();
      
      if (data.success) {
        setN8nTestResult({ success: true, message: data.message || "Conexão bem-sucedida!" });
        toast.success("Webhook N8N conectado!");
        await updateSettings.mutateAsync({ 
          n8nLastTestAt: now, 
          n8nLastTestStatus: "success" 
        });
      } else {
        setN8nTestResult({ success: false, message: data.error || "Erro na conexão" });
        toast.error("Erro na conexão com N8N");
        await updateSettings.mutateAsync({ 
          n8nLastTestAt: now, 
          n8nLastTestStatus: "error" 
        });
      }
    } catch (error) {
      console.error("Error testing N8N webhook:", error);
      setN8nTestResult({ success: false, message: "Erro ao testar conexão" });
      toast.error("Erro ao testar conexão");
    } finally {
      setIsTestingN8n(false);
    }
  };

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
  const getProviderLabel = () => {
    switch (provider) {
      case "internal": return "MiauChat AI";
      case "n8n": return "N8N (Webhook)";
      case "openai": return "OpenAI (API Key Própria)";
      default: return "Desconhecido";
    }
  };

  const getProviderStatus = () => {
    switch (provider) {
      case "internal": 
        return { color: "emerald", status: "Ativo" };
      case "n8n": 
        if (!hasN8nWebhook) return { color: "amber", status: "Não Configurado" };
        if (aiSettings?.n8nLastTestStatus === "success") return { color: "emerald", status: "Conectado" };
        if (aiSettings?.n8nLastTestStatus === "error") return { color: "red", status: "Erro" };
        return { color: "amber", status: "Pendente Teste" };
      case "openai":
        if (!aiSettings?.hasOpenAIKey) return { color: "amber", status: "Sem API Key" };
        if (aiSettings?.openaiLastTestStatus === "success") return { color: "emerald", status: "Validado" };
        if (aiSettings?.openaiLastTestStatus === "error") return { color: "red", status: "Inválido" };
        return { color: "amber", status: "Pendente Teste" };
      default:
        return { color: "gray", status: "Desconhecido" };
    }
  };

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

      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Status Atual
          </CardTitle>
          <CardDescription>
            Informações sobre a configuração de IA ativa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Active Provider */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Bot className="h-4 w-4" />
                Provedor Ativo
              </div>
              <p className="font-semibold">{getProviderLabel()}</p>
              <Badge 
                variant="secondary" 
                className={`mt-2 ${
                  getProviderStatus().color === "emerald" ? "bg-emerald-500/10 text-emerald-600" :
                  getProviderStatus().color === "amber" ? "bg-amber-500/10 text-amber-600" :
                  getProviderStatus().color === "red" ? "bg-red-500/10 text-red-600" :
                  "bg-gray-500/10 text-gray-600"
                }`}
              >
                {getProviderStatus().status}
              </Badge>
            </div>

            {/* Last Update */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                Última Alteração
              </div>
              <p className="font-semibold">
                {aiSettings?.aiSettingsUpdatedAt 
                  ? format(new Date(aiSettings.aiSettingsUpdatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : "Nunca alterado"
                }
              </p>
            </div>

            {/* Last Test */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TestTube className="h-4 w-4" />
                Último Teste
              </div>
              {provider === "n8n" && aiSettings?.n8nLastTestAt ? (
                <div>
                  <p className="font-semibold">
                    {format(new Date(aiSettings.n8nLastTestAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  <Badge 
                    variant="secondary" 
                    className={`mt-1 ${aiSettings.n8nLastTestStatus === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
                  >
                    {aiSettings.n8nLastTestStatus === "success" ? "Sucesso" : "Erro"}
                  </Badge>
                </div>
              ) : provider === "openai" && aiSettings?.openaiLastTestAt ? (
                <div>
                  <p className="font-semibold">
                    {format(new Date(aiSettings.openaiLastTestAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  <Badge 
                    variant="secondary" 
                    className={`mt-1 ${aiSettings.openaiLastTestStatus === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
                  >
                    {aiSettings.openaiLastTestStatus === "success" ? "Sucesso" : "Erro"}
                  </Badge>
                </div>
              ) : (
                <p className="font-semibold text-muted-foreground">Nenhum teste</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Provedor de IA Ativo
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
                    IA do Site (Padrão)
                  </Label>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Recomendado
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
                    N8N (Webhook)
                  </Label>
                  {!hasN8nWebhook && provider !== "n8n" && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Requer Configuração
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Automação via workflows N8N. Todas as mensagens passam pelo webhook configurado.
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
                  {!aiSettings?.hasOpenAIKey && provider !== "openai" && (
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

      {/* N8N Configuration */}
      {provider === "n8n" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Configuração N8N
            </CardTitle>
            <CardDescription>
              Configure o webhook do N8N para processar mensagens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Webhook URL */}
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL *</Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://seu-n8n.com/webhook/..."
                value={n8nWebhookUrl}
                onChange={(e) => setN8nWebhookUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                URL do webhook de produção do seu workflow N8N
              </p>
            </div>

            {/* Webhook Secret */}
            <div className="space-y-2">
              <Label htmlFor="webhookSecret">
                Secret/Token (opcional)
              </Label>
              {aiSettings?.n8nWebhookSecret && !n8nWebhookSecret && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50 mb-2">
                  <Lock className="h-4 w-4 text-emerald-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Secret configurado</p>
                    <p className="text-xs text-muted-foreground font-mono">{maskedWebhookSecret}</p>
                  </div>
                </div>
              )}
              <div className="relative">
                <Input
                  id="webhookSecret"
                  type={showWebhookSecret ? "text" : "password"}
                  placeholder={aiSettings?.n8nWebhookSecret ? "Novo secret (deixe vazio para manter)" : "Bearer token ou secret"}
                  value={n8nWebhookSecret}
                  onChange={(e) => setN8nWebhookSecret(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                >
                  {showWebhookSecret ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Será enviado como header Authorization: Bearer [token]
              </p>
            </div>

            {/* Test Connection Button */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleTestN8nWebhook}
                disabled={isTestingN8n || !n8nWebhookUrl.trim()}
                className="gap-2"
              >
                {isTestingN8n ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4" />
                )}
                {isTestingN8n ? "Testando..." : "Testar Conexão"}
              </Button>

              {n8nTestResult && (
                <div className={`flex items-center gap-2 text-sm ${n8nTestResult.success ? "text-emerald-600" : "text-destructive"}`}>
                  {n8nTestResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {n8nTestResult.message}
                </div>
              )}
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Importante</AlertTitle>
              <AlertDescription>
                Quando N8N estiver ativo, todas as mensagens recebidas passarão pelo webhook configurado.
                Certifique-se de que o workflow está ativo e funcionando.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

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
                {aiSettings?.hasOpenAIKey ? "Nova API Key (substituir)" : "API Key *"}
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

            {/* Test Connection Button */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleTestOpenaiKey}
                disabled={isTestingOpenai || !openaiApiKey.trim()}
                className="gap-2"
              >
                {isTestingOpenai ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4" />
                )}
                {isTestingOpenai ? "Testando..." : "Testar Chave"}
              </Button>

              {openaiTestResult && (
                <div className={`flex items-center gap-2 text-sm ${openaiTestResult.success ? "text-emerald-600" : "text-destructive"}`}>
                  {openaiTestResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {openaiTestResult.message}
                </div>
              )}
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

      {/* MiauChat AI Info */}
      {provider === "internal" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              MiauChat AI
            </CardTitle>
            <CardDescription>
              Informações sobre a IA integrada do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
              <div className="p-2 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold">Ativo e Funcionando</p>
                <p className="text-sm text-muted-foreground">
                  A IA do MiauChat está processando suas mensagens automaticamente
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              A IA do MiauChat é a opção padrão e mais simples. Ela já vem configurada e 
              não requer nenhuma ação adicional. As mensagens são processadas internamente 
              com alta velocidade e segurança.
            </p>
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

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar Configurações"
          )}
        </Button>
      </div>
    </div>
  );
}
