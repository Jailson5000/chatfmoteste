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
import { Loader2, Bot, Workflow, Key, CheckCircle2, XCircle, Eye, EyeOff, TestTube, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface AISettings {
  ai_provider: string;
  openai_api_key: string;
  n8n_webhook_url: string;
  n8n_webhook_secret: string;
  ai_capabilities: {
    auto_reply: boolean;
    summary: boolean;
    transcription: boolean;
    classification: boolean;
  };
}

export function CompanyAIConfigDialog({ company, open, onOpenChange }: CompanyAIConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // AI Settings state
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

  // AI Capabilities
  const [capabilities, setCapabilities] = useState({
    auto_reply: true,
    summary: true,
    transcription: true,
    classification: true,
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
      const { data, error } = await supabase
        .from("law_firm_settings")
        .select("*")
        .eq("law_firm_id", company.law_firm_id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const provider = data.ai_provider || "internal";
        setInternalEnabled(provider === "internal");
        setOpenaiEnabled(provider === "openai");
        setN8nEnabled(provider === "n8n");
        setOpenaiApiKey(data.openai_api_key || "");
        setN8nWebhookUrl(data.n8n_webhook_url || "");
        setN8nSecret(data.n8n_webhook_secret || "");
        
        const caps = data.ai_capabilities as any;
        if (caps) {
          setCapabilities({
            auto_reply: caps.auto_reply ?? true,
            summary: caps.summary ?? true,
            transcription: caps.transcription ?? true,
            classification: caps.classification ?? true,
          });
        }
      }
    } catch (error) {
      console.error("Error loading AI settings:", error);
      toast.error("Erro ao carregar configurações de IA");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!company?.law_firm_id) {
      toast.error("Empresa não tem law_firm_id configurado");
      return;
    }

    setSaving(true);
    try {
      // Determine active provider
      let activeProvider = "internal";
      if (n8nEnabled) activeProvider = "n8n";
      else if (openaiEnabled) activeProvider = "openai";

      const settingsData = {
        law_firm_id: company.law_firm_id,
        ai_provider: activeProvider,
        openai_api_key: openaiApiKey || null,
        n8n_webhook_url: n8nWebhookUrl || null,
        n8n_webhook_secret: n8nSecret || null,
        ai_capabilities: capabilities,
        ai_settings_updated_at: new Date().toISOString(),
      };

      // Check if settings exist
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

  const handleProviderChange = (provider: "internal" | "openai" | "n8n", enabled: boolean) => {
    if (provider === "internal") {
      setInternalEnabled(enabled);
      if (enabled) {
        setOpenaiEnabled(false);
        setN8nEnabled(false);
      }
    } else if (provider === "openai") {
      setOpenaiEnabled(enabled);
      if (enabled) {
        setInternalEnabled(false);
        setN8nEnabled(false);
      }
    } else if (provider === "n8n") {
      setN8nEnabled(enabled);
      if (enabled) {
        setInternalEnabled(false);
        setOpenaiEnabled(false);
      }
    }
  };

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
                      <p className="text-xs text-white/50">API Key própria da empresa</p>
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
                  <div className="space-y-3 pt-2">
                    <div className="space-y-2">
                      <Label className="text-white/70 text-sm">API Key</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showOpenaiKey ? "text" : "password"}
                            value={openaiApiKey}
                            onChange={(e) => setOpenaiApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="bg-white/5 border-white/10 text-white pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full text-white/50 hover:text-white"
                            onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                          >
                            {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleTestOpenai}
                          disabled={testingOpenai || !openaiApiKey}
                          className="border-white/10 text-white hover:bg-white/10"
                        >
                          {testingOpenai ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                        </Button>
                      </div>
                      {openaiTestResult && (
                        <div className={`flex items-center gap-2 text-xs ${openaiTestResult.success ? "text-green-400" : "text-red-400"}`}>
                          {openaiTestResult.success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {openaiTestResult.message}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-white/70 text-sm">Modelo</Label>
                      <Select value={openaiModel} onValueChange={setOpenaiModel}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-white/10">
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

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
                          size="sm"
                          onClick={handleTestN8n}
                          disabled={testingN8n || !n8nWebhookUrl}
                          className="border-white/10 text-white hover:bg-white/10"
                        >
                          {testingN8n ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                        </Button>
                      </div>
                      {n8nTestResult && (
                        <div className={`flex items-center gap-2 text-xs ${n8nTestResult.success ? "text-green-400" : "text-red-400"}`}>
                          {n8nTestResult.success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
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
                          placeholder="Token de autenticação"
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
                  </div>
                )}
              </div>

              {/* AI Capabilities */}
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
                <p className="font-medium text-white">Funcionalidades de IA</p>
                <div className="grid grid-cols-2 gap-3">
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
