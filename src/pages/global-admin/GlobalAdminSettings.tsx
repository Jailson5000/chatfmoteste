import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Settings, Shield, Bell, Database, Zap, Save, AlertTriangle, CreditCard } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Json } from "@/integrations/supabase/types";

export default function GlobalAdminSettings() {
  const { settings, isLoading, updateSetting, createSetting } = useSystemSettings();
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
      // Check if setting exists
      const existingSetting = settings.find((s) => s.key === key);
      if (existingSetting) {
        await updateSetting.mutateAsync({ key, value });
      } else {
        await createSetting.mutateAsync({ key, value, category: "payments" });
      }
      setLocalSettings((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const currentPaymentProvider = String(getSetting("payment_provider") || "stripe").replace(/"/g, "");

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

      {/* Payment Provider Settings */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Plataforma de Pagamento
          </CardTitle>
          <CardDescription>
            Escolha qual plataforma de pagamento será usada para cobranças
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <RadioGroup
              value={currentPaymentProvider}
              onValueChange={(value) => handleChange("payment_provider", value)}
              className="grid gap-4"
            >
              <div className="flex items-center space-x-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="stripe" id="stripe" />
                <Label htmlFor="stripe" className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Stripe</p>
                      <p className="text-sm text-muted-foreground">
                        Plataforma internacional com suporte a cartões internacionais
                      </p>
                    </div>
                    <Badge variant={currentPaymentProvider === "stripe" ? "default" : "outline"}>
                      {currentPaymentProvider === "stripe" ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="asaas" id="asaas" />
                <Label htmlFor="asaas" className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">ASAAS</p>
                      <p className="text-sm text-muted-foreground">
                        Plataforma brasileira com boleto, PIX e cartão de crédito
                      </p>
                    </div>
                    <Badge variant={currentPaymentProvider === "asaas" ? "default" : "outline"}>
                      {currentPaymentProvider === "asaas" ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </Label>
              </div>
            </RadioGroup>
            {localSettings["payment_provider"] !== undefined && (
              <Button onClick={() => handleSave("payment_provider")} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Salvar Plataforma de Pagamento
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
