import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Settings, Shield, Bell, Database, Zap, Save, AlertTriangle, CreditCard, Building, Users, FileText, Download } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { generateCommercialPDF } from "@/lib/commercialPdfGenerator";

export default function GlobalAdminSettings() {
  const { settings, isLoading, updateSetting, createSetting } = useSystemSettings();
  const [localSettings, setLocalSettings] = useState<Record<string, Json>>({});
  const [todayTrialCount, setTodayTrialCount] = useState<number>(0);
  const [loadingTrialCount, setLoadingTrialCount] = useState(true);

  // Fetch today's auto-approved trial count
  useEffect(() => {
    const fetchTodayTrialCount = async () => {
      try {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        
        const { count, error } = await supabase
          .from('companies')
          .select('*', { count: 'exact', head: true })
          .eq('approval_status', 'approved')
          .gte('created_at', todayStart.toISOString())
          .not('trial_ends_at', 'is', null);
        
        if (!error) {
          setTodayTrialCount(count || 0);
        }
      } catch (err) {
        console.error('Error fetching trial count:', err);
      } finally {
        setLoadingTrialCount(false);
      }
    };
    
    fetchTodayTrialCount();
  }, []);

  const getSetting = (key: string) => {
    if (localSettings[key] !== undefined) return localSettings[key];
    const setting = settings.find((s) => s.key === key);
    return setting?.value;
  };

  const getSettingString = (key: string, defaultValue: string = ""): string => {
    const value = getSetting(key);
    if (value === undefined || value === null) return defaultValue;
    const strValue = String(value);
    try {
      const parsed = JSON.parse(strValue);
      return typeof parsed === "string" ? parsed : strValue;
    } catch {
      return strValue.replace(/^"|"$/g, "");
    }
  };

  const handleChange = (key: string, value: Json) => {
    setLocalSettings({ ...localSettings, [key]: value });
  };

  const handleSave = async (key: string) => {
    const value = localSettings[key];
    if (value !== undefined) {
      const existingSetting = settings.find((s) => s.key === key);
      if (existingSetting) {
        await updateSetting.mutateAsync({ key, value });
      } else {
        let category = "general";
        if (key.startsWith("payment") || key.includes("trial")) category = "payments";
        if (key.startsWith("ai_")) category = "ai";
        if (key.startsWith("system_")) category = "system";
        await createSetting.mutateAsync({ key, value, category });
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
          {/* Master toggle to disable all payments */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <Label className="font-medium">Desativar Todos os Pagamentos</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Bloqueia checkout na landing page. Clientes precisam de liberação manual.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("payments_disabled") === "true" || getSetting("payments_disabled") === true}
                onCheckedChange={(checked) => handleChange("payments_disabled", checked.toString())}
              />
              {localSettings["payments_disabled"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("payments_disabled")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {(getSetting("payments_disabled") === "true" || getSetting("payments_disabled") === true) && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Pagamentos online estão <strong>desativados</strong>. 
                Clientes verão uma mensagem para entrar em contato diretamente.
              </span>
            </div>
          )}

          <Separator />

          {/* Manual Registration Mode */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-blue-500" />
                <Label className="font-medium">Modo Cadastro Manual</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Clientes preenchem formulário de cadastro. Empresas ficam pendentes até aprovação.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("manual_registration_enabled") === "true" || getSetting("manual_registration_enabled") === true}
                onCheckedChange={(checked) => handleChange("manual_registration_enabled", checked.toString())}
              />
              {localSettings["manual_registration_enabled"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("manual_registration_enabled")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {(getSetting("manual_registration_enabled") === "true" || getSetting("manual_registration_enabled") === true) && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm flex items-start gap-2">
              <Building className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Modo cadastro manual <strong>ativo</strong>. 
                Clientes serão redirecionados para página de cadastro em vez de pagamento.
                Empresas aparecerão em <strong>Empresas → Pendentes</strong> para aprovação.
              </span>
            </div>
          )}

          <Separator />

          {/* Auto-approve Trial Registration */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-500" />
                <Label className="font-medium">Aprovação Automática de Trial</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Empresas que escolhem trial são aprovadas automaticamente sem intervenção manual.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("auto_approve_trial_enabled") === "true" || getSetting("auto_approve_trial_enabled") === true}
                onCheckedChange={(checked) => handleChange("auto_approve_trial_enabled", checked.toString())}
              />
              {localSettings["auto_approve_trial_enabled"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("auto_approve_trial_enabled")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {(getSetting("auto_approve_trial_enabled") === "true" || getSetting("auto_approve_trial_enabled") === true) && (
            <>
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm flex items-start gap-2">
                <Zap className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Aprovação automática <strong>ativa</strong>. 
                  Empresas que escolherem trial serão aprovadas imediatamente sem aprovação manual.
                </span>
              </div>

              {/* Daily Trial Limit */}
              <div className="space-y-4 p-4 rounded-lg border border-purple-500/20 bg-purple-500/5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-500" />
                    <Label className="font-medium">Limite Diário de Trials Automáticos</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Após atingir o limite, novos cadastros vão para aprovação manual (reseta à meia-noite UTC).
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={Number(getSetting("max_daily_auto_trials")) || 10}
                    onChange={(e) => handleChange("max_daily_auto_trials", parseInt(e.target.value, 10) || 10)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">por dia</span>
                  {localSettings["max_daily_auto_trials"] !== undefined && (
                    <Button size="sm" onClick={() => handleSave("max_daily_auto_trials")}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Today's counter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cadastros auto-aprovados hoje:</span>
                    <span className="font-medium">
                      {loadingTrialCount ? (
                        <span className="text-muted-foreground">...</span>
                      ) : (
                        <>
                          {todayTrialCount} / {Number(getSetting("max_daily_auto_trials")) || 10}
                        </>
                      )}
                    </span>
                  </div>
                  {!loadingTrialCount && (
                    <Progress 
                      value={Math.min((todayTrialCount / (Number(getSetting("max_daily_auto_trials")) || 10)) * 100, 100)} 
                      className="h-2"
                    />
                  )}
                  {!loadingTrialCount && todayTrialCount >= (Number(getSetting("max_daily_auto_trials")) || 10) && (
                    <div className="flex items-center gap-2 text-xs text-amber-500">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Limite atingido! Novos cadastros estão indo para aprovação manual.</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />
          <div className="flex items-center justify-between p-4 rounded-lg border border-green-500/30 bg-green-500/5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-green-500" />
                <Label className="font-medium">Trial Automático + Plano</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Cliente escolhe plano → 7 dias grátis → cobrança automática no 8º dia
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("auto_trial_with_plan_enabled") === "true" || getSetting("auto_trial_with_plan_enabled") === true}
                onCheckedChange={(checked) => handleChange("auto_trial_with_plan_enabled", checked.toString())}
              />
              {localSettings["auto_trial_with_plan_enabled"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("auto_trial_with_plan_enabled")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {(getSetting("auto_trial_with_plan_enabled") === "true" || getSetting("auto_trial_with_plan_enabled") === true) && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-start gap-2">
              <Zap className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Trial automático <strong>ativo</strong>. 
                Clientes que escolherem um plano terão 7 dias grátis antes da cobrança.
                No 8º dia, o acesso será bloqueado até o pagamento.
              </span>
            </div>
          )}

          <Separator />

          <div className="flex items-center space-x-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <CreditCard className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <p className="font-medium">Stripe</p>
              <p className="text-sm text-muted-foreground">
                Plataforma de pagamento ativa para cartões e assinaturas
              </p>
            </div>
            <Badge variant="default" className="bg-green-600">
              Ativo
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* System Alert Settings */}
      <Card className="border-warning/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-warning" />
            Aviso de Instabilidade
          </CardTitle>
          <CardDescription>
            Exibe um banner de aviso para todos os clientes no topo da tela
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border border-warning/30 bg-warning/5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <Label className="font-medium">Ativar Aviso Global</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Quando ativado, todos os clientes verão o aviso no topo da tela
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={getSetting("system_alert_enabled") === "true" || getSetting("system_alert_enabled") === true}
                onCheckedChange={(checked) => handleChange("system_alert_enabled", checked.toString())}
              />
              {localSettings["system_alert_enabled"] !== undefined && (
                <Button size="sm" onClick={() => handleSave("system_alert_enabled")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {(getSetting("system_alert_enabled") === "true" || getSetting("system_alert_enabled") === true) && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Aviso <strong>ativo</strong>. Todos os clientes estão vendo a mensagem de instabilidade.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="system_alert_message">Mensagem do Aviso</Label>
            <div className="flex gap-2">
              <Input
                id="system_alert_message"
                value={String(getSetting("system_alert_message") || "Sistema em atualização.").replace(/^"|"$/g, "")}
                onChange={(e) => handleChange("system_alert_message", `"${e.target.value}"`)}
                placeholder="Sistema em atualização..."
                className="flex-1"
              />
              {localSettings["system_alert_message"] !== undefined && (
                <Button size="icon" onClick={() => handleSave("system_alert_message")}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Mensagem exibida no banner de aviso
            </p>
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

      {/* Commercial PDF Export */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Material Comercial
          </CardTitle>
          <CardDescription>
            Gere material de apresentação comercial para clientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-primary/20 rounded-lg bg-primary/5">
            <div>
              <p className="font-medium">PDF Comercial Completo</p>
              <p className="text-sm text-muted-foreground">
                Catálogo de planos, valores e todas as funcionalidades do sistema (~10 páginas)
              </p>
            </div>
            <Button 
              onClick={() => {
                generateCommercialPDF();
                toast.success("PDF comercial gerado com sucesso!");
              }}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Gerar PDF
            </Button>
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
