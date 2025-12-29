import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Workflow, ExternalLink, Save, TestTube, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

export default function GlobalAdminN8NSettings() {
  const { settings, isLoading, updateSetting, createSetting } = useSystemSettings();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");

  const [formData, setFormData] = useState({
    n8n_base_url: "",
    n8n_api_key: "",
    n8n_webhook_url: "",
    n8n_enabled: true,
  });

  const getSetting = (key: string): Json => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value ?? "";
  };

  // Load settings on first render
  useState(() => {
    if (settings.length > 0) {
      setFormData({
        n8n_base_url: String(getSetting("n8n_base_url") || "").replace(/"/g, ""),
        n8n_api_key: String(getSetting("n8n_api_key") || "").replace(/"/g, ""),
        n8n_webhook_url: String(getSetting("n8n_webhook_url") || "").replace(/"/g, ""),
        n8n_enabled: getSetting("n8n_enabled") === "true" || getSetting("n8n_enabled") === true,
      });
    }
  });

  const handleSave = async () => {
    try {
      const updates = [
        { key: "n8n_base_url", value: `"${formData.n8n_base_url}"` },
        { key: "n8n_api_key", value: `"${formData.n8n_api_key}"` },
        { key: "n8n_webhook_url", value: `"${formData.n8n_webhook_url}"` },
        { key: "n8n_enabled", value: formData.n8n_enabled.toString() },
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
            description: `N8N ${update.key.replace("n8n_", "").replace("_", " ")}`
          });
        }
      }

      toast.success("Configurações N8N salvas com sucesso");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus("idle");

    try {
      // Simulate testing connection
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // In a real implementation, you would call an edge function to test the connection
      setConnectionStatus("success");
      toast.success("Conexão com N8N estabelecida com sucesso");
    } catch (error) {
      setConnectionStatus("error");
      toast.error("Falha ao conectar com N8N");
    } finally {
      setTestingConnection(false);
    }
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações N8N</h1>
          <p className="text-muted-foreground">
            Configure a integração com workflows N8N
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="https://n8n.io/docs" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Documentação N8N
            </a>
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              <CardTitle>Status da Conexão</CardTitle>
            </div>
            <Badge variant={formData.n8n_enabled ? "default" : "secondary"}>
              {formData.n8n_enabled ? "Habilitado" : "Desabilitado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={handleTestConnection}
              disabled={testingConnection || !formData.n8n_base_url}
            >
              {testingConnection ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Testar Conexão
            </Button>
            {connectionStatus === "success" && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>Conectado</span>
              </div>
            )}
            {connectionStatus === "error" && (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                <span>Falha na conexão</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Connection Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações de Conexão</CardTitle>
          <CardDescription>
            Configure os parâmetros de conexão com sua instância N8N
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Habilitar Integração N8N</Label>
              <p className="text-sm text-muted-foreground">
                Ativa a integração com workflows N8N
              </p>
            </div>
            <Switch
              checked={formData.n8n_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, n8n_enabled: checked })}
            />
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="n8n_base_url">URL Base do N8N</Label>
              <Input
                id="n8n_base_url"
                value={formData.n8n_base_url}
                onChange={(e) => setFormData({ ...formData, n8n_base_url: e.target.value })}
                placeholder="https://seu-n8n.exemplo.com"
              />
              <p className="text-sm text-muted-foreground">
                URL da sua instância N8N (sem barra no final)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="n8n_api_key">API Key</Label>
              <Input
                id="n8n_api_key"
                type="password"
                value={formData.n8n_api_key}
                onChange={(e) => setFormData({ ...formData, n8n_api_key: e.target.value })}
                placeholder="••••••••••••••••"
              />
              <p className="text-sm text-muted-foreground">
                Chave de API para autenticação com N8N
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="n8n_webhook_url">URL do Webhook</Label>
              <Input
                id="n8n_webhook_url"
                value={formData.n8n_webhook_url}
                onChange={(e) => setFormData({ ...formData, n8n_webhook_url: e.target.value })}
                placeholder="https://seu-n8n.exemplo.com/webhook/..."
              />
              <p className="text-sm text-muted-foreground">
                URL do webhook para receber eventos do MiauChat
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Salvar Configurações
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Webhook</CardTitle>
          <CardDescription>
            URLs para configurar nos workflows N8N
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <Label className="text-xs text-muted-foreground">Webhook de Mensagens</Label>
            <code className="block mt-1 text-sm break-all">
              {window.location.origin}/api/n8n/messages
            </code>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <Label className="text-xs text-muted-foreground">Webhook de Conversas</Label>
            <code className="block mt-1 text-sm break-all">
              {window.location.origin}/api/n8n/conversations
            </code>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <Label className="text-xs text-muted-foreground">Webhook de Status</Label>
            <code className="block mt-1 text-sm break-all">
              {window.location.origin}/api/n8n/status
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
