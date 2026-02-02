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
  MessageCircle,
  Clock,
  AlertTriangle,
  FileText,
  ExternalLink,
  X,
  History,
  Calendar
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useAddonRequests } from "@/hooks/useAddonRequests";
import { formatCurrency, ADDITIONAL_PRICING, calculateAdditionalCosts, AdditionalBreakdown } from "@/lib/billing-config";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateLocal } from "@/lib/dateUtils";
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
import { OverageControlCard } from "@/components/settings/OverageControlCard";
import { SUPPORT_CONFIG, getWhatsAppSupportLink } from "@/lib/production-config";
import { ScrollArea } from "@/components/ui/scroll-area";

export function MyPlanSettings() {
  const { lawFirm } = useLawFirm();
  const queryClient = useQueryClient();
  const { requests, createRequest, cancelRequest, pendingRequests } = useAddonRequests();
  const [showAddonsDialog, setShowAddonsDialog] = useState(false);
  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [isSubmittingAddon, setIsSubmittingAddon] = useState(false);
  const [addonRequest, setAddonRequest] = useState({
    users: 0,
    instances: 0,
  });

  // Fetch Stripe invoices
  const { data: invoicesData, isLoading: isLoadingInvoices, refetch: refetchInvoices } = useQuery({
    queryKey: ["stripe-invoices", lawFirm?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-stripe-invoices");
      if (error) throw error;
      return data;
    },
    enabled: false, // Only fetch when dialog opens
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
          plan:plans!companies_plan_id_fkey(*)
        `)
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) throw error;
      if (!company) return null;

      // Fetch subscription data for billing cycle info
      const { data: subscription } = await supabase
        .from("company_subscriptions")
        .select("status, current_period_start, current_period_end, next_payment_at, last_payment_at")
        .eq("company_id", company.id)
        .maybeSingle();

      return { ...company, subscription };
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

  const handleRequestAddons = async () => {
    if (addonRequest.users === 0 && addonRequest.instances === 0) {
      toast.error("Selecione pelo menos um adicional");
      return;
    }

    if (!companyData?.id) {
      toast.error("Empresa não encontrada");
      return;
    }

    const totalCost = 
      addonRequest.users * ADDITIONAL_PRICING.user + 
      addonRequest.instances * ADDITIONAL_PRICING.whatsappInstance;

    setIsSubmittingAddon(true);
    try {
      await createRequest.mutateAsync({
        companyId: companyData.id,
        additionalUsers: addonRequest.users,
        additionalInstances: addonRequest.instances,
        monthlyCost: totalCost,
      });
      setShowAddonsDialog(false);
      setAddonRequest({ users: 0, instances: 0 });
    } finally {
      setIsSubmittingAddon(false);
    }
  };

  const handleDownloadInvoice = () => {
    const plan = companyData?.plan;
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
    const planName = plan?.name || "Sem plano";
    const companyName = companyData?.name || "Empresa";
    
    const message = `Olá! Sou da empresa *${companyName}*\n\nPlano atual: *${planName}*\n\nGostaria de conversar sobre um upgrade de plano.`;
    
    window.open(getWhatsAppSupportLink(message), "_blank");
  };

  const handleOpenInvoices = () => {
    setShowInvoicesDialog(true);
    refetchInvoices();
  };

  const handlePayNow = async () => {
    setIsPaymentLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-payment-link", {
        body: { billing_type: "monthly" },
      });

      if (error) throw error;

      if (data?.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error("Link de pagamento não gerado");
      }
    } catch (err: any) {
      console.error("[MyPlanSettings] Error generating payment link:", err);
      toast.error("Erro ao gerar link de pagamento. Entre em contato com o suporte.");
    } finally {
      setIsPaymentLoading(false);
    }
  };

  // Check if user is in trial
  const isInTrial = companyData?.trial_ends_at && !isPast(new Date(companyData.trial_ends_at));
  const trialDaysLeft = companyData?.trial_ends_at 
    ? differenceInDays(new Date(companyData.trial_ends_at), new Date())
    : 0;

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
    <div className="space-y-4">
      <SettingsHelpCollapsible
        title="Como funciona o Meu Plano?"
        items={[
          { text: "Aqui você pode visualizar seu plano atual e os recursos disponíveis." },
          { text: "Acompanhe o consumo mensal de conversas IA, áudio e outros recursos." },
          { text: "Contrate recursos adicionais como usuários e conexões WhatsApp." },
        ]}
        tip="Para upgrade de plano ou dúvidas sobre faturamento, entre em contato com nosso suporte."
      />

      {/* Trial Banner - Show only if user is in trial */}
      {isInTrial && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Período de Teste
                    <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                      {trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Seu trial termina em {companyData?.trial_ends_at 
                      ? format(new Date(companyData.trial_ends_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : "breve"
                    }
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {plan?.name 
                  ? `Assine o plano ${plan.name} para continuar usando após o trial.`
                  : "Assine um plano para continuar usando após o trial."
                }
              </p>
              <Button 
                onClick={handlePayNow}
                disabled={isPaymentLoading}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              >
                {isPaymentLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Assinar Agora - {formatCurrency(plan?.price || 497)}
              </Button>
            </div>
            {trialDaysLeft <= 2 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Seu trial está prestes a expirar. Assine para não perder o acesso!</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Current Plan Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Crown className="h-4 w-4 text-primary" />
                  Seu Plano Atual
                </CardTitle>
                <CardDescription className="text-xs">Período: {currentBillingPeriod}</CardDescription>
              </div>
              <Badge 
                variant="outline" 
                className={`text-xs ${
                  plan?.name === "ENTERPRISE" 
                    ? "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300" 
                    : plan?.name === "PROFESSIONAL"
                    ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300"
                    : "bg-primary/10 text-primary border-primary/30"
                }`}
              >
                {plan?.name || "Sem plano"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* Plan Features */}
            {planFeatures.length > 0 && (
              <div>
                <h4 className="text-xs font-medium mb-2 text-muted-foreground">Recursos inclusos:</h4>
                <div className="grid grid-cols-2 gap-1">
                  {planFeatures.slice(0, 6).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="truncate">{String(feature)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator className="my-2" />

            {/* Usage Summary */}
            <div>
              <h4 className="text-xs font-medium mb-2 text-muted-foreground">Consumo do período:</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <UsageItem 
                  icon={<Users className="h-3 w-3" />}
                  label="Usuários"
                  current={usageData?.current_users || 0}
                  max={usageData?.effective_max_users || 0}
                />
                <UsageItem 
                  icon={<Wifi className="h-3 w-3" />}
                  label="Conexões WhatsApp"
                  current={usageData?.current_instances || 0}
                  max={usageData?.effective_max_instances || 0}
                />
                <UsageItem 
                  icon={<Bot className="h-3 w-3" />}
                  label="Agentes IA"
                  current={usageData?.current_agents || 0}
                  max={usageData?.effective_max_agents || 0}
                />
                <UsageItem 
                  icon={<MessageSquare className="h-3 w-3" />}
                  label="Conversas IA"
                  current={usageData?.current_ai_conversations || 0}
                  max={usageData?.effective_max_ai_conversations || 0}
                />
                <UsageItem 
                  icon={<Mic className="h-3 w-3" />}
                  label="Minutos de Áudio"
                  current={Math.round(usageData?.current_tts_minutes || 0)}
                  max={usageData?.effective_max_tts_minutes || 0}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleOpenInvoices}>
              <FileText className="h-3 w-3" />
              Ver Faturas
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleDownloadInvoice}>
              <Download className="h-3 w-3" />
              Demonstrativo
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-green-600 border-green-300 hover:bg-green-50" onClick={handleContactSupport}>
              <MessageCircle className="h-3 w-3" />
              Solicitar Upgrade
            </Button>
            <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowAddonsDialog(true)}>
              <Plus className="h-3 w-3" />
              Contratar Adicionais
            </Button>
            {requests.length > 0 && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowHistoryDialog(true)}>
                <History className="h-3 w-3" />
                Histórico ({pendingRequests.length > 0 ? `${pendingRequests.length} pendente${pendingRequests.length > 1 ? 's' : ''}` : requests.length})
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Billing Summary Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Resumo Mensal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {/* Base Plan */}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plano {plan?.name}</span>
              <span className="font-medium">{formatCurrency(plan?.price || 0)}</span>
            </div>

            {/* Add-ons Section - Only show if there are add-ons */}
            {billingInfo && billingInfo.breakdown.totalAdditional > 0 && (
              <>
                <Separator className="my-2" />
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Adicionais Contratados
                  </span>
                  {billingInfo.breakdown.users.quantity > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        +{billingInfo.breakdown.users.quantity} usuário(s)
                      </span>
                      <span className="font-medium text-primary">{formatCurrency(billingInfo.breakdown.users.cost)}</span>
                    </div>
                  )}
                  {billingInfo.breakdown.instances.quantity > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Wifi className="h-3 w-3" />
                        +{billingInfo.breakdown.instances.quantity} conexão(ões) WhatsApp
                      </span>
                      <span className="font-medium text-primary">{formatCurrency(billingInfo.breakdown.instances.cost)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator className="my-2" />
            
            {/* Total */}
            <div className="flex justify-between items-center p-2 rounded-lg bg-primary/5 border border-primary/10">
              <span className="text-sm font-semibold">Total Mensal</span>
              <span className="text-xl font-bold text-primary">
                {formatCurrency(billingInfo?.totalMonthly || plan?.price || 0)}
              </span>
            </div>

            {/* Billing Cycle Info */}
            {isInTrial ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      Trial termina em {companyData?.trial_ends_at 
                        ? format(new Date(companyData.trial_ends_at), "d 'de' MMMM", { locale: ptBR })
                        : "breve"
                      }
                    </p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                      {trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"}
                    </p>
                  </div>
                </div>
              </div>
            ) : companyData?.subscription?.current_period_start || companyData?.subscription?.next_payment_at ? (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <div className="space-y-0.5">
                    {companyData?.subscription?.current_period_start && (
                      <p className="text-xs">
                        Ciclo iniciado em {format(parseDateLocal(companyData.subscription.current_period_start) || new Date(), "d 'de' MMMM", { locale: ptBR })}
                      </p>
                    )}
                    {companyData?.subscription?.next_payment_at && (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          Próximo vencimento: {format(parseDateLocal(companyData.subscription.next_payment_at) || new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                        <p className="text-xs">
                          Renovação automática (dia {format(parseDateLocal(companyData.subscription.next_payment_at) || new Date(), "d")} de cada mês)
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <p className="text-[10px] text-muted-foreground">
              * Conversas IA e minutos de áudio acima do limite são cobrados por uso.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Pricing Info - only AI and Audio */}
      <OverageControlCard 
        companyData={companyData}
        onUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ["company-billing", lawFirm?.id] });
        }}
      />

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
            <Button onClick={handleRequestAddons} disabled={isSubmittingAddon}>
              {isSubmittingAddon ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Solicitar Adicionais"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Addon Requests History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Solicitações
            </DialogTitle>
            <DialogDescription>
              Acompanhe o status das suas solicitações de adicionais
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            {requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>Nenhuma solicitação encontrada.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {request.additional_users > 0 && `${request.additional_users} usuário(s)`}
                          {request.additional_users > 0 && request.additional_instances > 0 && " + "}
                          {request.additional_instances > 0 && `${request.additional_instances} conexão(ões)`}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            request.status === 'approved' ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400' :
                            request.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            request.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {request.status === 'approved' ? 'Aprovado' :
                           request.status === 'pending' ? 'Pendente' :
                           request.status === 'rejected' ? 'Rejeitado' : 'Cancelado'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(request.monthly_cost)}/mês • {format(new Date(request.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      {request.rejection_reason && (
                        <div className="text-xs text-destructive">
                          Motivo: {request.rejection_reason}
                        </div>
                      )}
                    </div>
                    {request.status === 'pending' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => cancelRequest.mutate(request.id)}
                        title="Cancelar solicitação"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoices Dialog */}
      <Dialog open={showInvoicesDialog} onOpenChange={setShowInvoicesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Faturas
            </DialogTitle>
            <DialogDescription>
              Histórico de faturas da sua assinatura
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            {isLoadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : invoicesData?.invoices?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>Nenhuma fatura encontrada.</p>
                <p className="text-xs mt-1">
                  {invoicesData?.message || "Você ainda não possui uma assinatura ativa."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoicesData?.invoices?.map((invoice: {
                  id: string;
                  value: number;
                  statusLabel: string;
                  statusColor: string;
                  description: string;
                  dueDate: string;
                  paymentDate: string | null;
                  invoiceUrl: string | null;
                  bankSlipUrl: string | null;
                  billingType: string;
                }) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {formatCurrency(invoice.value)}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            invoice.statusColor === 'green' ? 'bg-green-100 text-green-700 border-green-300' :
                            invoice.statusColor === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                            invoice.statusColor === 'red' ? 'bg-red-100 text-red-700 border-red-300' :
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {invoice.statusLabel}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.paymentDate 
                          ? `Pago em ${format(parseDateLocal(invoice.paymentDate) || new Date(), "dd/MM/yyyy", { locale: ptBR })}`
                          : `Vence em ${format(parseDateLocal(invoice.dueDate) || new Date(), "dd/MM/yyyy", { locale: ptBR })}`
                        }
                        {invoice.billingType && ` • ${invoice.billingType}`}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {invoice.invoiceUrl && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => window.open(invoice.invoiceUrl!, "_blank")}
                          title="Ver nota fiscal"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      {invoice.bankSlipUrl && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => window.open(invoice.bankSlipUrl!, "_blank")}
                          title="Ver boleto"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowInvoicesDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper component for usage items - compact version
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
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <span className={`text-xs font-medium ${isCritical ? 'text-destructive' : isWarning ? 'text-yellow-600' : ''}`}>
          {current}/{max}
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={`h-1.5 ${isCritical ? '[&>div]:bg-destructive' : isWarning ? '[&>div]:bg-yellow-500' : ''}`}
      />
    </div>
  );
}
