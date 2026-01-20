import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  CreditCard, 
  Download, 
  Plus, 
  Users, 
  Wifi, 
  Bot, 
  MessageSquare, 
  Mic,
  CheckCircle2,
  Loader2,
  Crown,
  Mail
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { formatCurrency, ADDITIONAL_PRICING, calculateAdditionalCosts, AdditionalBreakdown } from "@/lib/billing-config";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { generateInvoicePDF } from "@/lib/invoiceGenerator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SettingsHelpCollapsible } from "./SettingsHelpCollapsible";

export function MyPlanSettings() {
  const { lawFirm } = useLawFirm();
  const [showAddonsDialog, setShowAddonsDialog] = useState(false);
  const [addonRequest, setAddonRequest] = useState({
    users: 0,
    instances: 0,
  });

  // Fetch company and plan data
  const { data: companyData, isLoading } = useQuery({
    queryKey: ["company-billing", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return null;

      const { data: company, error } = await supabase
        .from("companies")
        .select(`
          *,
          plan:plans(*)
        `)
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) throw error;
      return company;
    },
    enabled: !!lawFirm?.id,
  });

  // Fetch current usage
  const { data: usageData } = useQuery({
    queryKey: ["company-usage-billing", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("company_usage_summary")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!lawFirm?.id,
  });

  // Calculate billing info
  const billingInfo = usageData && companyData?.plan ? (() => {
    const plan = companyData.plan;
    const planLimits = {
      max_users: plan.max_users || 0,
      max_instances: plan.max_instances || 0,
      max_agents: plan.max_agents || 0,
      max_ai_conversations: plan.max_ai_conversations || 0,
      max_tts_minutes: plan.max_tts_minutes || 0,
    };

    const effectiveLimits = {
      use_custom_limits: companyData.use_custom_limits || false,
      max_users: usageData.effective_max_users || plan.max_users || 0,
      max_instances: usageData.effective_max_instances || plan.max_instances || 0,
      max_agents: usageData.effective_max_agents || plan.max_agents || 0,
      max_ai_conversations: usageData.effective_max_ai_conversations || plan.max_ai_conversations || 0,
      max_tts_minutes: usageData.effective_max_tts_minutes || plan.max_tts_minutes || 0,
    };

    return calculateAdditionalCosts(planLimits, effectiveLimits, plan.price || 0);
  })() : null;

  const currentBillingPeriod = format(new Date(), "MMMM yyyy", { locale: ptBR });

  const handleRequestAddons = () => {
    if (addonRequest.users === 0 && addonRequest.instances === 0) {
      toast.error("Selecione pelo menos um adicional");
      return;
    }

    const totalCost = 
      addonRequest.users * ADDITIONAL_PRICING.user + 
      addonRequest.instances * ADDITIONAL_PRICING.whatsappInstance;

    toast.success(
      `Solicitação enviada! Um consultor entrará em contato para adicionar ${addonRequest.users > 0 ? `${addonRequest.users} usuário(s)` : ""} ${addonRequest.instances > 0 ? `${addonRequest.instances} conexão(ões) WhatsApp` : ""}. Valor adicional: ${formatCurrency(totalCost)}/mês`,
      { duration: 8000 }
    );
    
    setShowAddonsDialog(false);
    setAddonRequest({ users: 0, instances: 0 });
  };

  const handleDownloadInvoice = () => {
    if (!companyData || !plan || !billingInfo) {
      toast.error("Não foi possível gerar a fatura. Dados incompletos.");
      return;
    }

    try {
      generateInvoicePDF({
        companyName: companyData.name || "Empresa",
        companyDocument: companyData.document || "",
        companyEmail: companyData.email || "",
        planName: plan.name || "Plano",
        planPrice: plan.price || 0,
        billingPeriod: currentBillingPeriod,
        breakdown: billingInfo.breakdown as AdditionalBreakdown,
        totalMonthly: billingInfo.totalMonthly,
        usage: usageData ? {
          users: { current: usageData.current_users || 0, max: usageData.effective_max_users || 0 },
          instances: { current: usageData.current_instances || 0, max: usageData.effective_max_instances || 0 },
          agents: { current: usageData.current_agents || 0, max: usageData.effective_max_agents || 0 },
          aiConversations: { current: usageData.current_ai_conversations || 0, max: usageData.effective_max_ai_conversations || 0 },
          ttsMinutes: { current: Math.round(usageData.current_tts_minutes || 0), max: usageData.effective_max_tts_minutes || 0 },
        } : undefined,
      });
      toast.success("Fatura gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar fatura:", error);
      toast.error("Erro ao gerar a fatura. Tente novamente.");
    }
  };

  const handleContactSupport = () => {
    window.open("mailto:suporte@miauchat.com.br?subject=Solicitação de Upgrade de Plano", "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const plan = companyData?.plan;
  const planFeatures = Array.isArray(plan?.features) ? plan.features : [];

  return (
    <div className="space-y-6">
      <SettingsHelpCollapsible
        title="Como funciona o Meu Plano?"
        items={[
          { text: "Aqui você pode visualizar seu plano atual e os recursos disponíveis." },
          { text: "Acompanhe o consumo mensal de conversas IA, áudio e outros recursos." },
          { text: "Contrate recursos adicionais como usuários e conexões WhatsApp." },
        ]}
        tip="Para upgrade de plano ou dúvidas sobre faturamento, entre em contato com nosso suporte."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Current Plan Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Seu Plano Atual
                </CardTitle>
                <CardDescription>Período: {currentBillingPeriod}</CardDescription>
              </div>
              <Badge 
                variant="outline" 
                className={
                  plan?.name === "ENTERPRISE" 
                    ? "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300" 
                    : plan?.name === "PROFESSIONAL"
                    ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300"
                    : "bg-primary/10 text-primary border-primary/30"
                }
              >
                {plan?.name || "Sem plano"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Plan Features */}
            {planFeatures.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Recursos inclusos:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {planFeatures.slice(0, 6).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span>{String(feature)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Usage Summary */}
            <div>
              <h4 className="text-sm font-medium mb-3">Consumo do período:</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <UsageItem 
                  icon={<Users className="h-4 w-4" />}
                  label="Usuários"
                  current={usageData?.current_users || 0}
                  max={usageData?.effective_max_users || 0}
                />
                <UsageItem 
                  icon={<Wifi className="h-4 w-4" />}
                  label="Conexões WhatsApp"
                  current={usageData?.current_instances || 0}
                  max={usageData?.effective_max_instances || 0}
                />
                <UsageItem 
                  icon={<Bot className="h-4 w-4" />}
                  label="Agentes IA"
                  current={usageData?.current_agents || 0}
                  max={usageData?.effective_max_agents || 0}
                />
                <UsageItem 
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Conversas IA"
                  current={usageData?.current_ai_conversations || 0}
                  max={usageData?.effective_max_ai_conversations || 0}
                />
                <UsageItem 
                  icon={<Mic className="h-4 w-4" />}
                  label="Minutos de Áudio"
                  current={Math.round(usageData?.current_tts_minutes || 0)}
                  max={usageData?.effective_max_tts_minutes || 0}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3 pt-6 border-t">
            <Button variant="outline" className="gap-2" onClick={handleDownloadInvoice}>
              <Download className="h-4 w-4" />
              Baixar Fatura
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleContactSupport}>
              <Mail className="h-4 w-4" />
              Solicitar Upgrade
            </Button>
            <Button className="gap-2" onClick={() => setShowAddonsDialog(true)}>
              <Plus className="h-4 w-4" />
              Contratar Adicionais
            </Button>
          </CardFooter>
        </Card>

        {/* Billing Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Resumo Mensal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano {plan?.name}</span>
              <span className="font-medium">{formatCurrency(plan?.price || 0)}</span>
            </div>

            {billingInfo && billingInfo.breakdown.totalAdditional > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  {billingInfo.breakdown.users.quantity > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        +{billingInfo.breakdown.users.quantity} usuário(s)
                      </span>
                      <span>{formatCurrency(billingInfo.breakdown.users.cost)}</span>
                    </div>
                  )}
                  {billingInfo.breakdown.instances.quantity > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        +{billingInfo.breakdown.instances.quantity} conexão(ões)
                      </span>
                      <span>{formatCurrency(billingInfo.breakdown.instances.cost)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />
            
            <div className="flex justify-between items-center">
              <span className="font-medium">Total Mensal</span>
              <span className="text-xl font-bold text-primary">
                {formatCurrency(billingInfo?.totalMonthly || plan?.price || 0)}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              * Conversas IA e minutos de áudio acima do limite são cobrados por uso.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Pricing Info */}
      <Card>
        <CardHeader>
          <CardTitle>Preços de Consumo Adicional</CardTitle>
          <CardDescription>
            Valores cobrados quando você ultrapassa os limites do seu plano
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="font-medium">Conversa IA</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(ADDITIONAL_PRICING.aiConversation)}</p>
              <p className="text-xs text-muted-foreground">por conversa</p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="h-4 w-4 text-primary" />
                <span className="font-medium">Minuto de Áudio</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(ADDITIONAL_PRICING.ttsMinute)}</p>
              <p className="text-xs text-muted-foreground">por minuto</p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="h-4 w-4 text-primary" />
                <span className="font-medium">WhatsApp</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(ADDITIONAL_PRICING.whatsappInstance)}</p>
              <p className="text-xs text-muted-foreground">por mês</p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium">Atendente</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(ADDITIONAL_PRICING.user)}</p>
              <p className="text-xs text-muted-foreground">por mês</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Addons Dialog */}
      <Dialog open={showAddonsDialog} onOpenChange={setShowAddonsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contratar Adicionais</DialogTitle>
            <DialogDescription>
              Adicione mais recursos ao seu plano. Um consultor entrará em contato para confirmar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Usuários adicionais ({formatCurrency(ADDITIONAL_PRICING.user)}/mês cada)</Label>
              <Input 
                type="number" 
                min={0}
                value={addonRequest.users}
                onChange={(e) => setAddonRequest(prev => ({ ...prev, users: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Conexões WhatsApp adicionais ({formatCurrency(ADDITIONAL_PRICING.whatsappInstance)}/mês cada)</Label>
              <Input 
                type="number" 
                min={0}
                value={addonRequest.instances}
                onChange={(e) => setAddonRequest(prev => ({ ...prev, instances: parseInt(e.target.value) || 0 }))}
              />
            </div>

            {(addonRequest.users > 0 || addonRequest.instances > 0) && (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm font-medium">Valor adicional mensal:</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(
                    addonRequest.users * ADDITIONAL_PRICING.user + 
                    addonRequest.instances * ADDITIONAL_PRICING.whatsappInstance
                  )}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddonsDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRequestAddons}>
              Solicitar Adicionais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper component for usage items
function UsageItem({ 
  icon, 
  label, 
  current, 
  max 
}: { 
  icon: React.ReactNode; 
  label: string; 
  current: number; 
  max: number;
}) {
  const percentage = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0;
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {icon}
          <span>{label}</span>
        </div>
        <span className={`text-sm font-medium ${isCritical ? 'text-destructive' : isWarning ? 'text-yellow-600' : ''}`}>
          {current}/{max}
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={`h-2 ${isCritical ? '[&>div]:bg-destructive' : isWarning ? '[&>div]:bg-yellow-500' : ''}`}
      />
    </div>
  );
}
