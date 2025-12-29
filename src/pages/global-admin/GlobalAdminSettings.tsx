import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Shield, Bell, Database, Zap, Save, AlertTriangle } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Json } from "@/integrations/supabase/types";

export default function GlobalAdminSettings() {
  const { settings, isLoading, updateSetting } = useSystemSettings();
  const [localSettings, setLocalSettings] = useState<Record<string, Json>>({});

  const getSetting = (key: string) => {
    if (localSettings[key] !== undefined) return localSettings[key];
    const setting = settings.find((s) => s.key === key);
    return setting?.value;
  };

  const handleChange = (key: string, value: Json) => {
    setLocalSettings({ ...localSettings, [key]: value });
  };

  const handleSave = async (key: string) => {
    const value = localSettings[key];
    if (value !== undefined) {
      await updateSetting.mutateAsync({ key, value });
      setLocalSettings((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Configurações globais do sistema MiauChat
        </p>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Geral
          </CardTitle>
          <CardDescription>
            Configurações gerais do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Modo de Manutenção</Label>
              <p className="text-sm text-muted-foreground">
                Ativa o modo de manutenção para todos os clientes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("maintenance_mode") === "true" || getSetting("maintenance_mode") === true}
                onCheckedChange={(checked) => handleChange("maintenance_mode", checked.toString())}
              />
              {localSettings["maintenance_mode"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("maintenance_mode")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Habilitar Recursos de IA</Label>
              <p className="text-sm text-muted-foreground">
                Ativa os recursos de inteligência artificial
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("enable_ai_features") === "true" || getSetting("enable_ai_features") === true}
                onCheckedChange={(checked) => handleChange("enable_ai_features", checked.toString())}
              />
              {localSettings["enable_ai_features"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("enable_ai_features")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billing Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Faturamento
          </CardTitle>
          <CardDescription>
            Configurações de planos e trial
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default_plan">Plano Padrão</Label>
              <div className="flex gap-2">
                <Input
                  id="default_plan"
                  value={String(getSetting("default_plan") || "starter").replace(/"/g, "")}
                  onChange={(e) => handleChange("default_plan", `"${e.target.value}"`)}
                  placeholder="starter"
                />
                {localSettings["default_plan"] !== undefined && (
                  <Button size="icon" onClick={() => handleSave("default_plan")}>
                    <Save className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Plano atribuído automaticamente a novos clientes
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial_days">Dias de Trial</Label>
              <div className="flex gap-2">
                <Input
                  id="trial_days"
                  type="number"
                  value={String(getSetting("trial_days") || "14")}
                  onChange={(e) => handleChange("trial_days", e.target.value)}
                  placeholder="14"
                />
                {localSettings["trial_days"] !== undefined && (
                  <Button size="icon" onClick={() => handleSave("trial_days")}>
                    <Save className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Duração do período de trial em dias
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Storage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Armazenamento
          </CardTitle>
          <CardDescription>
            Configurações de arquivos e mídia
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max_file_size">Tamanho Máximo de Arquivo (MB)</Label>
            <div className="flex gap-2">
              <Input
                id="max_file_size"
                type="number"
                value={String(getSetting("max_file_size_mb") || "25")}
                onChange={(e) => handleChange("max_file_size_mb", e.target.value)}
                placeholder="25"
                className="w-32"
              />
              {localSettings["max_file_size_mb"] !== undefined && (
                <Button size="icon" onClick={() => handleSave("max_file_size_mb")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Limite máximo para upload de arquivos
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
          <CardDescription>
            Ações irreversíveis que afetam todo o sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
            <div>
              <p className="font-medium">Limpar Cache do Sistema</p>
              <p className="text-sm text-muted-foreground">
                Remove todos os dados em cache
              </p>
            </div>
            <Button variant="destructive" disabled>
              Limpar Cache
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
            <div>
              <p className="font-medium">Reiniciar Todos os Workflows</p>
              <p className="text-sm text-muted-foreground">
                Reinicia todos os workflows N8N
              </p>
            </div>
            <Button variant="destructive" disabled>
              Reiniciar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
