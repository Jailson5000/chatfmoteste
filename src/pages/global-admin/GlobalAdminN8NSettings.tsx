import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link2, Workflow, Save, TestTube, CheckCircle, XCircle, Loader2, Eye, EyeOff, RefreshCw, Key } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export default function GlobalAdminN8NSettings() {
  const { settings, isLoading, updateSetting, createSetting } = useSystemSettings();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    n8n_base_url: "",
    n8n_api_key: "",
    n8n_template_workflow_id: "",
  });

  const getSetting = (key: string): string => {
    const setting = settings.find((s) => s.key === key);
    if (!setting?.value) return "";
    const val = setting.value;
    if (typeof val === "string") {
      return val.replace(/^"|"$/g, "");
    }
    return String(val);
  };

  useEffect(() => {
    if (settings.length > 0) {
      setFormData({
        n8n_base_url: getSetting("n8n_base_url") || "https://n8n.fmoadv.com.br",
        n8n_api_key: getSetting("n8n_api_key") || "",
        n8n_template_workflow_id: getSetting("n8n_template_workflow_id") || "",
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates = [
        { key: "n8n_base_url", value: formData.n8n_base_url, description: "URL base do n8n self-hosted" },
        { key: "n8n_api_key", value: formData.n8n_api_key, description: "API Key do n8n" },
        { key: "n8n_template_workflow_id", value: formData.n8n_template_workflow_id, description: "ID do workflow template" },
      ];

      for (const update of updates) {
        const exists = settings.find((s) => s.key === update.key);
        if (exists) {
          await updateSetting.mutateAsync({ key: update.key, value: update.value as Json });
        } else {
          await createSetting.mutateAsync({ 
            key: update.key, 
            value: update.value as Json,
            category: "n8n",
            description: update.description
          });
        }
      }

      toast.success("Configurações salvas com sucesso");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus("idle");
    setConnectionError(null);

    try {
      // Call edge function to test n8n connection
      const { data, error } = await supabase.functions.invoke('test-n8n-connection', {
        body: {
          api_url: formData.n8n_base_url,
          api_key: formData.n8n_api_key,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setConnectionStatus("success");
        toast.success("Conexão com n8n estabelecida com sucesso");
      } else {
        throw new Error(data?.error || "Falha na conexão");
      }
    } catch (error: any) {
      setConnectionStatus("error");
      setConnectionError(error.message || "Falha ao conectar com n8n");
      toast.error("Falha ao conectar com n8n");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRefreshTemplate = () => {
    toast.info("Para atualizar, edite o ID e salve as configurações");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações n8n</h1>
        <p className="text-muted-foreground">
          Configure a integração com o n8n para automação de workflows
        </p>
      </div>

      {/* Main Settings Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Connection Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <CardTitle>Conexão com n8n</CardTitle>
            </div>
            <CardDescription>
              Configure as credenciais de acesso à API do n8n
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* URL da API */}
            <div className="space-y-2">
              <Label htmlFor="n8n_base_url">URL da API</Label>
              <Input
                id="n8n_base_url"
                value={formData.n8n_base_url}
                onChange={(e) => setFormData({ ...formData, n8n_base_url: e.target.value })}
                placeholder="https://n8n.seudominio.com.br"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                URL base do seu n8n self-hosted
              </p>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="n8n_api_key">API Key</Label>
              <div className="relative">
                <Input
                  id="n8n_api_key"
                  type={showApiKey ? "text" : "password"}
                  value={formData.n8n_api_key}
                  onChange={(e) => setFormData({ ...formData, n8n_api_key: e.target.value })}
                  placeholder="••••••••••••••••"
                  className="bg-background pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Gere uma API Key em Settings → API do seu n8n
              </p>
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={testingConnection || !formData.n8n_base_url || !formData.n8n_api_key}
              >
                {testingConnection ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Testar Conexão
              </Button>
              
              {connectionStatus === "success" && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Conectado
                </Badge>
              )}
              {connectionStatus === "error" && (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" />
                  Desconectado
                </Badge>
              )}
            </div>

            {/* Error Message */}
            {connectionStatus === "error" && connectionError && (
              <p className="text-sm text-destructive">
                {connectionError}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Workflow Template Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              <CardTitle>Workflow Template</CardTitle>
            </div>
            <CardDescription>
              Selecione o workflow que será clonado para novas empresas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="n8n_template_workflow_id">ID do Workflow Template</Label>
              <div className="flex gap-2">
                <Input
                  id="n8n_template_workflow_id"
                  value={formData.n8n_template_workflow_id}
                  onChange={(e) => setFormData({ ...formData, n8n_template_workflow_id: e.target.value })}
                  placeholder="9tPpeT6qH9y57cJV"
                  className="bg-background flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRefreshTemplate}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copie o ID da URL ao abrir o workflow no n8n (ex: .../#/workflow/abc123)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Section */}
      <Card className="border-primary/20">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <h3 className="font-semibold">Salvar Configurações</h3>
            <p className="text-sm text-muted-foreground">
              As configurações serão salvas e usadas para criar workflows automaticamente
            </p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90">
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle>Como obter as credenciais</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold">1. URL da API</h4>
            <p className="text-sm text-muted-foreground">
              É a URL base do seu n8n. Exemplo: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://n8n.seudominio.com.br</code>
            </p>
          </div>
          <div>
            <h4 className="font-semibold">2. API Key</h4>
            <p className="text-sm text-muted-foreground">
              No n8n, vá em <strong>Settings → API</strong> e crie uma nova API Key. Copie a chave gerada (ela só será exibida uma vez).
            </p>
          </div>
          <div>
            <h4 className="font-semibold">3. Workflow Template</h4>
            <p className="text-sm text-muted-foreground">
              Crie um workflow no n8n que servirá como modelo. Ele será clonado para cada nova empresa. Você pode copiar o ID da URL quando abrir o workflow 
              (ex: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.../#/workflow/abc123</code>).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
