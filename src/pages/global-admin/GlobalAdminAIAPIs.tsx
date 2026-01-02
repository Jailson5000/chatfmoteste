import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, Workflow, Key, CheckCircle2, XCircle, Eye, EyeOff, TestTube, RefreshCw, AlertTriangle, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVAILABLE_VOICES, DEFAULT_VOICE_ID } from "@/lib/voiceConfig";

interface AIProvider {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  configFields?: React.ReactNode;
}

export default function GlobalAdminAIAPIs() {
  const { settings, isLoading, updateSetting, createSetting } = useSystemSettings();
  
  // State for each provider
  const [internalEnabled, setInternalEnabled] = useState(true);
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [n8nEnabled, setN8nEnabled] = useState(false);
  
  // OpenAI config
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [testingOpenai, setTestingOpenai] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // N8N config
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
  const [n8nSecret, setN8nSecret] = useState("");
  const [showN8nSecret, setShowN8nSecret] = useState(false);
  const [testingN8n, setTestingN8n] = useState(false);
  const [n8nTestResult, setN8nTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Speaktor config
  const [speaktorEnabled, setSpeaktorEnabled] = useState(false);
  const [speaktorApiKey, setSpeaktorApiKey] = useState("");
  const [speaktorVoice, setSpeaktorVoice] = useState(DEFAULT_VOICE_ID);
  const [showSpeaktorKey, setShowSpeaktorKey] = useState(false);
  const [testingSpeaktor, setTestingSpeaktor] = useState(false);
  const [speaktorTestResult, setSpeaktorTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    if (settings) {
      const getSetting = (key: string, defaultValue: any = "") => {
        const setting = settings.find(s => s.key === key);
        return setting?.value ?? defaultValue;
      };
      
      setInternalEnabled(getSetting("ai_internal_enabled", true) === true || getSetting("ai_internal_enabled", true) === "true");
      setOpenaiEnabled(getSetting("ai_openai_enabled", false) === true || getSetting("ai_openai_enabled", false) === "true");
      setN8nEnabled(getSetting("ai_n8n_enabled", false) === true || getSetting("ai_n8n_enabled", false) === "true");
      setOpenaiApiKey(getSetting("ai_openai_api_key", ""));
      setOpenaiModel(getSetting("ai_openai_model", "gpt-4o-mini"));
      setN8nWebhookUrl(getSetting("ai_n8n_webhook_url", ""));
      setN8nSecret(getSetting("ai_n8n_secret", ""));
      
      // Speaktor settings
      setSpeaktorEnabled(getSetting("tts_speaktor_enabled", false) === true || getSetting("tts_speaktor_enabled", false) === "true");
      setSpeaktorApiKey(getSetting("tts_speaktor_api_key", ""));
      setSpeaktorVoice(getSetting("tts_speaktor_voice", DEFAULT_VOICE_ID));
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsToSave = [
        { key: "ai_internal_enabled", value: internalEnabled, category: "ai" },
        { key: "ai_openai_enabled", value: openaiEnabled, category: "ai" },
        { key: "ai_n8n_enabled", value: n8nEnabled, category: "ai" },
        { key: "ai_openai_api_key", value: openaiApiKey, category: "ai" },
        { key: "ai_openai_model", value: openaiModel, category: "ai" },
        { key: "ai_n8n_webhook_url", value: n8nWebhookUrl, category: "ai" },
        { key: "ai_n8n_secret", value: n8nSecret, category: "ai" },
        // Speaktor settings
        { key: "tts_speaktor_enabled", value: speaktorEnabled, category: "tts" },
        { key: "tts_speaktor_api_key", value: speaktorApiKey, category: "tts" },
        { key: "tts_speaktor_voice", value: speaktorVoice, category: "tts" },
      ];

      for (const setting of settingsToSave) {
        const existing = settings?.find(s => s.key === setting.key);
        if (existing) {
          await updateSetting.mutateAsync({ key: setting.key, value: setting.value });
        } else {
          await createSetting.mutateAsync({ key: setting.key, value: setting.value, category: setting.category });
        }
      }

      toast.success("Configurações de IA salvas com sucesso!");
    } catch (error) {
      console.error("Error saving AI settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSpeaktor = async () => {
    if (!speaktorApiKey) {
      toast.error("Insira a API Key do Speaktor");
      return;
    }
    
    setTestingSpeaktor(true);
    setSpeaktorTestResult(null);
    
    try {
      const response = await fetch("https://api.tor.app/developer/text_to_speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${speaktorApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Teste de conexão com Speaktor.",
          language: "pt-BR",
          voice_name: speaktorVoice
        }),
      });
      
      if (response.ok) {
        setSpeaktorTestResult({
          success: true,
          message: "Conexão validada com sucesso!"
        });
        toast.success("Conexão com Speaktor validada!");
      } else {
        const errorData = await response.text();
        setSpeaktorTestResult({
          success: false,
          message: `Erro: ${response.status} - ${errorData}`
        });
        toast.error("Falha ao validar API Key do Speaktor");
      }
    } catch (error: any) {
      setSpeaktorTestResult({
        success: false,
        message: error.message || "Erro ao testar conexão"
      });
      toast.error("Erro ao testar conexão com Speaktor");
    } finally {
      setTestingSpeaktor(false);
    }
  };

  const handleTestOpenai = async () => {
    if (!openaiApiKey) {
      toast.error("Insira a API Key da OpenAI");
      return;
    }
    
    setTestingOpenai(true);
    setOpenaiTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("test-openai-key", {
        body: { apiKey: openaiApiKey }
      });
      
      if (error) throw error;
      
      setOpenaiTestResult({
        success: data.success,
        message: data.message
      });
      
      if (data.success) {
        toast.success("Conexão com OpenAI validada!");
      } else {
        toast.error(data.message || "Falha ao validar API Key");
      }
    } catch (error: any) {
      setOpenaiTestResult({
        success: false,
        message: error.message || "Erro ao testar conexão"
      });
      toast.error("Erro ao testar conexão com OpenAI");
    } finally {
      setTestingOpenai(false);
    }
  };

  const handleTestN8n = async () => {
    if (!n8nWebhookUrl) {
      toast.error("Insira a URL do Webhook n8n");
      return;
    }
    
    setTestingN8n(true);
    setN8nTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("test-n8n-webhook", {
        body: { 
          webhookUrl: n8nWebhookUrl,
          secret: n8nSecret 
        }
      });
      
      if (error) throw error;
      
      setN8nTestResult({
        success: data.success,
        message: data.message
      });
      
      if (data.success) {
        toast.success("Conexão com n8n validada!");
      } else {
        toast.error(data.message || "Falha ao validar webhook");
      }
    } catch (error: any) {
      setN8nTestResult({
        success: false,
        message: error.message || "Erro ao testar conexão"
      });
      toast.error("Erro ao testar conexão com n8n");
    } finally {
      setTestingN8n(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">IAs APIs</h1>
        <p className="text-white/60">Configure os provedores de IA disponíveis no sistema</p>
      </div>

      {/* Provider Cards */}
      <div className="grid gap-6">
        {/* Internal AI */}
        <Card className="bg-[#1a1a1a] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Bot className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-white">IA do Site (Interna)</CardTitle>
                <CardDescription className="text-white/50">
                  Processamento de IA padrão do sistema
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={internalEnabled ? "default" : "secondary"} className={internalEnabled ? "bg-green-600" : "bg-white/20"}>
                {internalEnabled ? "Ativo" : "Inativo"}
              </Badge>
              <Switch
                checked={internalEnabled}
                onCheckedChange={setInternalEnabled}
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/50">
              A IA interna do sistema é processada automaticamente sem necessidade de configuração adicional. 
              Ideal para funcionalidades básicas de atendimento automático.
            </p>
          </CardContent>
        </Card>

        {/* OpenAI */}
        <Card className="bg-[#1a1a1a] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Key className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-white">OpenAI API</CardTitle>
                <CardDescription className="text-white/50">
                  Integração direta com a API da OpenAI
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={openaiEnabled ? "default" : "secondary"} className={openaiEnabled ? "bg-green-600" : "bg-white/20"}>
                {openaiEnabled ? "Ativo" : "Inativo"}
              </Badge>
              <Switch
                checked={openaiEnabled}
                onCheckedChange={setOpenaiEnabled}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="openai-key" className="text-white/70">API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="openai-key"
                      type={showOpenaiKey ? "text" : "password"}
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="bg-white/5 border-white/10 text-white pr-10"
                      disabled={!openaiEnabled}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full text-white/50 hover:text-white"
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                      disabled={!openaiEnabled}
                    >
                      {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleTestOpenai}
                    disabled={!openaiEnabled || testingOpenai || !openaiApiKey}
                    className="border-white/10 text-white hover:bg-white/10"
                  >
                    {testingOpenai ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                    <span className="ml-2">Testar</span>
                  </Button>
                </div>
                {openaiTestResult && (
                  <div className={`flex items-center gap-2 text-sm ${openaiTestResult.success ? "text-green-400" : "text-red-400"}`}>
                    {openaiTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {openaiTestResult.message}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="openai-model" className="text-white/70">Modelo</Label>
                <Select value={openaiModel} onValueChange={setOpenaiModel} disabled={!openaiEnabled}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10">
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Recomendado)</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-200/80">
                A chave da API é armazenada de forma segura e nunca é exibida completa após salva.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* N8N */}
        <Card className="bg-[#1a1a1a] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Workflow className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-white">n8n Webhook</CardTitle>
                <CardDescription className="text-white/50">
                  Automação via workflows n8n
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={n8nEnabled ? "default" : "secondary"} className={n8nEnabled ? "bg-green-600" : "bg-white/20"}>
                {n8nEnabled ? "Ativo" : "Inativo"}
              </Badge>
              <Switch
                checked={n8nEnabled}
                onCheckedChange={setN8nEnabled}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="n8n-url" className="text-white/70">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="n8n-url"
                    type="url"
                    value={n8nWebhookUrl}
                    onChange={(e) => setN8nWebhookUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/..."
                    className="bg-white/5 border-white/10 text-white flex-1"
                    disabled={!n8nEnabled}
                  />
                  <Button
                    variant="outline"
                    onClick={handleTestN8n}
                    disabled={!n8nEnabled || testingN8n || !n8nWebhookUrl}
                    className="border-white/10 text-white hover:bg-white/10"
                  >
                    {testingN8n ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                    <span className="ml-2">Testar</span>
                  </Button>
                </div>
                {n8nTestResult && (
                  <div className={`flex items-center gap-2 text-sm ${n8nTestResult.success ? "text-green-400" : "text-red-400"}`}>
                    {n8nTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {n8nTestResult.message}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="n8n-secret" className="text-white/70">Secret/Token (opcional)</Label>
                <div className="relative">
                  <Input
                    id="n8n-secret"
                    type={showN8nSecret ? "text" : "password"}
                    value={n8nSecret}
                    onChange={(e) => setN8nSecret(e.target.value)}
                    placeholder="Token de autenticação"
                    className="bg-white/5 border-white/10 text-white pr-10"
                    disabled={!n8nEnabled}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full text-white/50 hover:text-white"
                    onClick={() => setShowN8nSecret(!showN8nSecret)}
                    disabled={!n8nEnabled}
                  >
                    {showN8nSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Bot className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-200/80">
                Quando n8n estiver ativo, todas as mensagens passam pelo webhook configurado para processamento.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Speaktor TTS */}
        <Card className="bg-[#1a1a1a] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Volume2 className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-white">Speaktor TTS</CardTitle>
                <CardDescription className="text-white/50">
                  Text-to-Speech com vozes emocionais e multilíngue
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={speaktorEnabled ? "default" : "secondary"} className={speaktorEnabled ? "bg-green-600" : "bg-white/20"}>
                {speaktorEnabled ? "Ativo" : "Inativo"}
              </Badge>
              <Switch
                checked={speaktorEnabled}
                onCheckedChange={setSpeaktorEnabled}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="speaktor-key" className="text-white/70">API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="speaktor-key"
                      type={showSpeaktorKey ? "text" : "password"}
                      value={speaktorApiKey}
                      onChange={(e) => setSpeaktorApiKey(e.target.value)}
                      placeholder="Sua API Key do Speaktor/Tor.app"
                      className="bg-white/5 border-white/10 text-white pr-10"
                      disabled={!speaktorEnabled}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full text-white/50 hover:text-white"
                      onClick={() => setShowSpeaktorKey(!showSpeaktorKey)}
                      disabled={!speaktorEnabled}
                    >
                      {showSpeaktorKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleTestSpeaktor}
                    disabled={!speaktorEnabled || testingSpeaktor || !speaktorApiKey}
                    className="border-white/10 text-white hover:bg-white/10"
                  >
                    {testingSpeaktor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                    <span className="ml-2">Testar</span>
                  </Button>
                </div>
                {speaktorTestResult && (
                  <div className={`flex items-center gap-2 text-sm ${speaktorTestResult.success ? "text-green-400" : "text-red-400"}`}>
                    {speaktorTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {speaktorTestResult.message}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="speaktor-voice" className="text-white/70">Voz Padrão do Sistema</Label>
                <Select value={speaktorVoice} onValueChange={setSpeaktorVoice} disabled={!speaktorEnabled}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10">
                    {AVAILABLE_VOICES.filter(v => v.provider === "speaktor").map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name} ({voice.gender === "female" ? "Feminina" : "Masculina"}) - {voice.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-white/40">
                  Esta voz é usada apenas quando o agente não tem uma voz específica configurada.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Volume2 className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-xs text-purple-200/80">
                Speaktor oferece vozes com tons emocionais (calmo, formal, conversacional) e suporte a 50+ idiomas.
                Quando ativo, substitui o OpenAI TTS para geração de áudio.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
