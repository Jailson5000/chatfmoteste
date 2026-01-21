import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, Workflow, Key, CheckCircle2, XCircle, Eye, EyeOff, TestTube, AlertTriangle, Image, Mic, Volume2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVAILABLE_VOICES, DEFAULT_VOICE_ID } from "@/lib/voiceConfig";
import { N8NFlowDocumentation } from "./N8NFlowDocumentation";

interface Company {
  id: string;
  name: string;
  law_firm_id: string | null;
}

interface CompanyAIConfigDialogProps {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyAIConfigDialog({ company, open, onOpenChange }: CompanyAIConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // AI Settings state
  const [internalEnabled, setInternalEnabled] = useState(true);
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [elevenLabsEnabled, setElevenLabsEnabled] = useState(true);
  const [n8nEnabled, setN8nEnabled] = useState(false);
  
  // N8N config
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
  const [n8nSecret, setN8nSecret] = useState("");
  const [showN8nSecret, setShowN8nSecret] = useState(false);
  const [testingN8n, setTestingN8n] = useState(false);
  const [n8nTestResult, setN8nTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [creatingN8nWorkflow, setCreatingN8nWorkflow] = useState(false);
  const [n8nWorkflowId, setN8nWorkflowId] = useState<string | null>(null);

  // ElevenLabs TTS config (per-company)
  const [elevenLabsVoice, setElevenLabsVoice] = useState(DEFAULT_VOICE_ID);

  // AI Capabilities
  const [capabilities, setCapabilities] = useState({
    auto_reply: true,
    summary: true,
    transcription: true,
    classification: true,
    image_analysis: true,
    audio_response: true,
  });

  // Load settings when company changes
  useEffect(() => {
    if (company?.law_firm_id && open) {
      loadSettings();
    }
  }, [company?.law_firm_id, open]);

  const loadSettings = async () => {
    if (!company?.law_firm_id) return;
    
    setLoading(true);
    try {
      // Load AI settings
      const { data, error } = await supabase
        .from("law_firm_settings")
        .select("*")
        .eq("law_firm_id", company.law_firm_id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const caps = data.ai_capabilities as any;
        
        // Support new simultaneous AI activation model
        if (caps?.ia_site_active !== undefined || caps?.openai_active !== undefined) {
          setInternalEnabled(caps?.ia_site_active ?? true);
          setOpenaiEnabled(caps?.openai_active ?? false);
          setElevenLabsEnabled(caps?.elevenlabs_active ?? true);
        } else {
          const provider = data.ai_provider || "internal";
          setInternalEnabled(provider === "internal");
          setOpenaiEnabled(provider === "openai");
          setElevenLabsEnabled(true);
        }
        
        setN8nEnabled(data.ai_provider === "n8n");
        setN8nWebhookUrl(data.n8n_webhook_url || "");
        setN8nSecret(data.n8n_webhook_secret || "");
        
        if (caps) {
          setCapabilities({
            auto_reply: caps.auto_reply ?? true,
            summary: caps.summary ?? true,
            transcription: caps.transcription ?? true,
            classification: caps.classification ?? true,
            image_analysis: caps.image_analysis ?? true,
            audio_response: caps.audio_response ?? true,
          });
          
          // ElevenLabs voice
          setElevenLabsVoice(caps.elevenlabs_voice ?? DEFAULT_VOICE_ID);
        }
      }

      // Also load company info to get workflow status
      const { data: companyData } = await supabase
        .from("companies")
        .select("n8n_workflow_id, n8n_workflow_status")
        .eq("id", company.id)
        .single();

      if (companyData?.n8n_workflow_id) {
        setN8nWorkflowId(companyData.n8n_workflow_id);
      }
    } catch (error) {
      console.error("Error loading AI settings:", error);
      toast.error("Erro ao carregar configurações de IA");
    } finally {
      setLoading(false);
    }
  };

  // Create or retrieve N8N workflow automatically
  const handleCreateN8nWorkflow = async () => {
    if (!company?.id || !company?.law_firm_id) {
      toast.error("Empresa não tem configuração válida");
      return;
    }

    setCreatingN8nWorkflow(true);
    try {
      // First check if workflow already exists
      const { data: companyData } = await supabase
        .from("companies")
        .select("n8n_workflow_id, n8n_workflow_status, law_firms(subdomain)")
        .eq("id", company.id)
        .single();

      if (companyData?.n8n_workflow_id && companyData.n8n_workflow_status === "created") {
        // Workflow exists, just need to fetch webhook URL
        toast.info("Workflow já existe, buscando URL...");
        
        // Try to get the webhook URL from law_firm_settings or generate it
        const { data: settings } = await supabase
          .from("law_firm_settings")
          .select("n8n_webhook_url")
          .eq("law_firm_id", company.law_firm_id)
          .maybeSingle();

        if (settings?.n8n_webhook_url) {
          setN8nWebhookUrl(settings.n8n_webhook_url);
          setN8nWorkflowId(companyData.n8n_workflow_id);
          toast.success("URL do webhook recuperada!");
          return;
        }
      }

      // Create new workflow
      toast.info("Criando workflow N8N...");
      
      const { data, error } = await supabase.functions.invoke("create-n8n-workflow", {
        body: {
          company_id: company.id,
          company_name: company.name,
          law_firm_id: company.law_firm_id,
          subdomain: (companyData?.law_firms as any)?.subdomain || "",
          auto_activate: true,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setN8nWorkflowId(data.workflow_id);
        
        // Use webhook_url directly from response if available (preferred)
        if (data.webhook_url) {
          setN8nWebhookUrl(data.webhook_url);
          console.log("Webhook URL set from response:", data.webhook_url);
        } else {
          // Fallback: Fetch from settings
          const { data: updatedSettings } = await supabase
            .from("law_firm_settings")
            .select("n8n_webhook_url")
            .eq("law_firm_id", company.law_firm_id)
            .maybeSingle();

          if (updatedSettings?.n8n_webhook_url) {
            setN8nWebhookUrl(updatedSettings.n8n_webhook_url);
          }
        }

        toast.success(data.already_exists 
          ? "Workflow já existia e foi vinculado!" 
          : "Workflow N8N criado e ativado com sucesso!"
        );
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("Error creating N8N workflow:", error);
      toast.error("Erro ao criar workflow: " + (error.message || "Erro desconhecido"));
    } finally {
      setCreatingN8nWorkflow(false);
    }
  };

  const handleSave = async () => {
    if (!company?.law_firm_id) {
      toast.error("Empresa não tem law_firm_id configurado");
      return;
    }

    setSaving(true);
    try {
      let activeProvider = "internal";
      if (n8nEnabled) activeProvider = "n8n";
      else if (openaiEnabled && !internalEnabled) activeProvider = "openai";

      const enhancedCapabilities = {
        ...capabilities,
        ia_site_active: internalEnabled,
        openai_active: openaiEnabled,
        elevenlabs_active: elevenLabsEnabled,
        elevenlabs_voice: elevenLabsVoice,
      };

      const settingsData = {
        law_firm_id: company.law_firm_id,
        ai_provider: activeProvider,
        n8n_webhook_url: n8nWebhookUrl || null,
        n8n_webhook_secret: n8nSecret || null,
        ai_capabilities: enhancedCapabilities,
        ai_settings_updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("law_firm_settings")
        .select("id")
        .eq("law_firm_id", company.law_firm_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("law_firm_settings")
          .update(settingsData)
          .eq("law_firm_id", company.law_firm_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("law_firm_settings")
          .insert(settingsData);
        if (error) throw error;
      }

      toast.success("Configurações de IA salvas com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving AI settings:", error);
      toast.error("Erro ao salvar configurações: " + error.message);
    } finally {
      setSaving(false);
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

  const handleProviderChange = (provider: "internal" | "openai" | "n8n", enabled: boolean) => {
    if (provider === "internal") {
      setInternalEnabled(enabled);
      if (enabled) setN8nEnabled(false);
    } else if (provider === "openai") {
      setOpenaiEnabled(enabled);
      if (enabled) setN8nEnabled(false);
    } else if (provider === "n8n") {
      setN8nEnabled(enabled);
      if (enabled) {
        setInternalEnabled(false);
        setOpenaiEnabled(false);
      }
    }
  };

  const getAIResponsibilities = () => {
    const bothActive = internalEnabled && openaiEnabled;
    // Prioridade: ElevenLabs > OpenAI > Desativado
    const audioProvider = elevenLabsEnabled ? "ElevenLabs" : (openaiEnabled ? "OpenAI" : "Desativado");
    
    if (bothActive) {
      return {
        chat: "OpenAI",
        audio: audioProvider,
        transcription: "OpenAI",
        image: "IA do Site"
      };
    } else if (openaiEnabled) {
      return {
        chat: "OpenAI",
        audio: audioProvider,
        transcription: "OpenAI",
        image: "Indisponível"
      };
    } else {
      return {
        chat: "IA do Site",
        audio: audioProvider,
        transcription: "IA do Site",
        image: "IA do Site"
      };
    }
  };

  const responsibilities = getAIResponsibilities();

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] bg-[#1a1a1a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-400" />
            Configuração de IA - {company.name}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Configure os provedores de IA para esta empresa
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Internal AI */}
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Bot className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">IA do Site (Interna)</p>
                      <p className="text-xs text-white/50">Processamento padrão do sistema</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={internalEnabled ? "bg-green-600" : "bg-white/20"}>
                      {internalEnabled ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch
                      checked={internalEnabled}
                      onCheckedChange={(checked) => handleProviderChange("internal", checked)}
                    />
                  </div>
                </div>
              </div>

              {/* OpenAI */}
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <Key className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">OpenAI API</p>
                      <p className="text-xs text-white/50">Usa a chave global do sistema</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={openaiEnabled ? "bg-green-600" : "bg-white/20"}>
                      {openaiEnabled ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch
                      checked={openaiEnabled}
                      onCheckedChange={(checked) => handleProviderChange("openai", checked)}
                    />
                  </div>
                </div>

                {openaiEnabled && (
                  <div className="flex items-center gap-2 text-sm text-green-400 pt-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Usando chave OpenAI global configurada no sistema</span>
                  </div>
                )}
              </div>

              {/* ElevenLabs TTS */}
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <Volume2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">ElevenLabs TTS</p>
                      <p className="text-xs text-white/50">Text-to-Speech para respostas por áudio</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={elevenLabsEnabled ? "bg-green-600" : "bg-white/20"}>
                      {elevenLabsEnabled ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch
                      checked={elevenLabsEnabled}
                      onCheckedChange={setElevenLabsEnabled}
                    />
                  </div>
                </div>

                {elevenLabsEnabled && (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <Label className="text-white/70 text-sm">Voz Padrão da Empresa</Label>
                    <Select value={elevenLabsVoice} onValueChange={setElevenLabsVoice}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-white/10">
                        {AVAILABLE_VOICES.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name} ({voice.gender === "female" ? "Feminina" : "Masculina"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-white/40">
                      A voz configurada no agente tem prioridade sobre esta voz padrão.
                    </p>
                  </div>
                )}
              </div>

              {/* AI Responsibilities Summary */}
              {(internalEnabled || openaiEnabled) && !n8nEnabled && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-emerald-500/10 border border-white/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    <p className="font-medium text-white text-sm">
                      {internalEnabled && openaiEnabled ? "Modo Híbrido Ativo" : "Distribuição de Funções"}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 p-2 rounded bg-white/5">
                      <span className="text-white/60">💬 Conversação:</span>
                      <span className={`font-medium ${responsibilities.chat === "OpenAI" ? "text-emerald-400" : "text-blue-400"}`}>
                        {responsibilities.chat}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-white/5">
                      <span className="text-white/60">🎙️ Áudio/TTS:</span>
                      <span className="font-medium text-emerald-400">
                        {responsibilities.audio}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-white/5">
                      <span className="text-white/60">🎧 Transcrição:</span>
                      <span className={`font-medium ${responsibilities.transcription === "OpenAI" ? "text-emerald-400" : "text-blue-400"}`}>
                        {responsibilities.transcription}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-white/5">
                      <span className="text-white/60">🖼️ Imagens:</span>
                      <span className={`font-medium ${
                        responsibilities.image === "IA do Site" ? "text-blue-400" : 
                        responsibilities.image === "Indisponível" ? "text-red-400" : "text-emerald-400"
                      }`}>
                        {responsibilities.image}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* N8N */}
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/20">
                      <Workflow className="h-4 w-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">n8n Webhook</p>
                      <p className="text-xs text-white/50">Automação via workflows</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={n8nEnabled ? "bg-green-600" : "bg-white/20"}>
                      {n8nEnabled ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch
                      checked={n8nEnabled}
                      onCheckedChange={(checked) => handleProviderChange("n8n", checked)}
                    />
                  </div>
                </div>

                {n8nEnabled && (
                  <div className="space-y-3 pt-2">
                    {/* Auto-create workflow button */}
                    {!n8nWebhookUrl && (
                      <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-2">
                        <div className="flex items-center gap-2 text-orange-400">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm font-medium">Webhook não configurado</span>
                        </div>
                        <p className="text-xs text-white/60">
                          Clique abaixo para criar automaticamente um workflow N8N para esta empresa.
                        </p>
                        <Button
                          onClick={handleCreateN8nWorkflow}
                          disabled={creatingN8nWorkflow}
                          className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                          {creatingN8nWorkflow ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Criando workflow...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Criar Workflow Automaticamente
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Workflow status indicator */}
                    {n8nWorkflowId && (
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Workflow vinculado: {n8nWorkflowId.substring(0, 8)}...</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-white/70 text-sm">Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          value={n8nWebhookUrl}
                          onChange={(e) => setN8nWebhookUrl(e.target.value)}
                          placeholder="https://n8n.example.com/webhook/..."
                          className="bg-white/5 border-white/10 text-white flex-1"
                        />
                        <Button
                          variant="outline"
                          onClick={handleTestN8n}
                          disabled={testingN8n || !n8nWebhookUrl}
                          className="border-white/10 text-white hover:bg-white/10"
                        >
                          {testingN8n ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                        </Button>
                      </div>
                      {n8nTestResult && (
                        <div className={`flex items-center gap-2 text-sm ${n8nTestResult.success ? "text-green-400" : "text-red-400"}`}>
                          {n8nTestResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                          {n8nTestResult.message}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-white/70 text-sm">Secret (opcional)</Label>
                      <div className="relative">
                        <Input
                          type={showN8nSecret ? "text" : "password"}
                          value={n8nSecret}
                          onChange={(e) => setN8nSecret(e.target.value)}
                          placeholder="Chave secreta para autenticação"
                          className="bg-white/5 border-white/10 text-white pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full text-white/50 hover:text-white"
                          onClick={() => setShowN8nSecret(!showN8nSecret)}
                        >
                          {showN8nSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    
                    {/* N8N Flow Documentation */}
                    <div className="pt-3 border-t border-white/10">
                      <N8NFlowDocumentation />
                    </div>
                  </div>
                )}
              </div>


              {/* AI Capabilities */}
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
                <p className="font-medium text-white">Funcionalidades de IA</p>
                <p className="text-xs text-white/50">Capacidades podem ser ativadas simultaneamente</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={capabilities.auto_reply}
                      onCheckedChange={(checked) => setCapabilities({ ...capabilities, auto_reply: checked })}
                    />
                    <span className="text-sm text-white/70">Resposta automática</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={capabilities.summary}
                      onCheckedChange={(checked) => setCapabilities({ ...capabilities, summary: checked })}
                    />
                    <span className="text-sm text-white/70">Resumos</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={capabilities.transcription}
                      onCheckedChange={(checked) => setCapabilities({ ...capabilities, transcription: checked })}
                    />
                    <span className="text-sm text-white/70">Transcrição</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={capabilities.classification}
                      onCheckedChange={(checked) => setCapabilities({ ...capabilities, classification: checked })}
                    />
                    <span className="text-sm text-white/70">Classificação</span>
                  </label>
                </div>

                <div className="border-t border-white/10 pt-4 mt-4 space-y-3">
                  <p className="text-sm text-white/70 font-medium">Capacidades Paralelas</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Image className="h-4 w-4 text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">Análise de Imagens</p>
                      </div>
                      <Switch
                        checked={capabilities.image_analysis}
                        onCheckedChange={(checked) => setCapabilities({ ...capabilities, image_analysis: checked })}
                      />
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="p-2 rounded-lg bg-cyan-500/20">
                        <Mic className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">Resposta por Áudio</p>
                      </div>
                      <Switch
                        checked={capabilities.audio_response}
                        onCheckedChange={(checked) => setCapabilities({ ...capabilities, audio_response: checked })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning */}
              {!company.law_firm_id && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-200/80">
                    Esta empresa não possui um law_firm_id associado. As configurações não poderão ser salvas.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-white hover:bg-white/10"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || !company.law_firm_id}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
