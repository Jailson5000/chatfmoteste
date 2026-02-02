import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, User, Building2, ArrowRight, Phone, FileText, CheckCircle2, CreditCard, Globe, Loader2, Check, X, Gift, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import miauchatLogo from "@/assets/miauchat-logo.png";
import { publicRegistrationSchema, companyFieldConfig } from "@/lib/schemas/companySchema";
import { usePlans } from "@/hooks/usePlans";
import { formatPhone, formatDocument } from "@/lib/inputMasks";

// Generate subdomain suggestion from company name (no hyphens)
function generateSubdomainSuggestion(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]/g, '')       // remove everything except letters and numbers
    .substring(0, 30);
}

type RegistrationMode = 'trial' | 'pay_now';

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAutoApproved, setIsAutoApproved] = useState(false);
  const { plans, isLoading: plansLoading } = usePlans();
  
  // Registration mode: trial or pay_now
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('trial');
  
  // Billing period: monthly or yearly (only for pay_now)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  
  // Filter only active plans
  const activePlans = plans.filter(plan => plan.is_active);
  
  const [formData, setFormData] = useState({
    companyName: "",
    adminName: "",
    email: "",
    phone: "",
    document: "",
    planId: "",
    subdomain: "",
  });
  
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [subdomainManuallyEdited, setSubdomainManuallyEdited] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced subdomain availability check using secure RPC function
  const checkSubdomainAvailability = useCallback(async (subdomain: string) => {
    if (subdomain.length < 3) {
      setSubdomainStatus('idle');
      return;
    }
    
    setSubdomainStatus('checking');
    
    try {
      // Use RPC function that bypasses RLS to check availability
      const { data, error } = await supabase
        .rpc('is_subdomain_available', { _subdomain: subdomain });
      
      if (error) {
        console.error('[Register] Error checking subdomain:', error);
        setSubdomainStatus('idle');
        return;
      }
      
      setSubdomainStatus(data ? 'available' : 'taken');
    } catch (error) {
      console.error('[Register] Error checking subdomain:', error);
      setSubdomainStatus('idle');
    }
  }, []);
  
  // Handle subdomain input change with debounce
  const handleSubdomainChange = useCallback((value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    setFormData(prev => ({ ...prev, subdomain: sanitized }));
    setSubdomainManuallyEdited(true);
    
    // Clear previous timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
    
    // Set new debounced check
    checkTimeoutRef.current = setTimeout(() => {
      checkSubdomainAvailability(sanitized);
    }, 500);
  }, [checkSubdomainAvailability]);
  
  // Handle company name change - auto-suggest subdomain if not manually edited
  const handleCompanyNameChange = useCallback((value: string) => {
    setFormData(prev => {
      const newSubdomain = !subdomainManuallyEdited 
        ? generateSubdomainSuggestion(value)
        : prev.subdomain;
      
      // Trigger availability check for auto-generated subdomain
      if (!subdomainManuallyEdited && newSubdomain.length >= 3) {
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
        }
        checkTimeoutRef.current = setTimeout(() => {
          checkSubdomainAvailability(newSubdomain);
        }, 500);
      }
      
      return {
        ...prev,
        companyName: value,
        subdomain: newSubdomain,
      };
    });
  }, [subdomainManuallyEdited, checkSubdomainAvailability]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);
  
  // Auto-select plan from URL parameter
  useEffect(() => {
    const planFromUrl = searchParams.get('plan');
    if (planFromUrl && activePlans.length > 0) {
      const matchingPlan = activePlans.find(
        p => p.name.toUpperCase() === planFromUrl.toUpperCase()
      );
      if (matchingPlan && !formData.planId) {
        setFormData(prev => ({ ...prev, planId: matchingPlan.id }));
      }
    }
  }, [activePlans, searchParams, formData.planId]);

  // Get selected plan details with pricing calculations
  const selectedPlan = useMemo(() => {
    return activePlans.find(p => p.id === formData.planId);
  }, [activePlans, formData.planId]);
  
  // Calculate yearly price (11 months = 1 month free)
  const yearlyPrice = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.price * 11;
  }, [selectedPlan]);
  
  // Calculate monthly equivalent for yearly
  const yearlyMonthlyEquivalent = useMemo(() => {
    if (!selectedPlan) return 0;
    return (selectedPlan.price * 11) / 12;
  }, [selectedPlan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = publicRegistrationSchema.safeParse(formData);
    if (!result.success) {
      toast({
        title: "Erro de validação",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      if (registrationMode === 'pay_now') {
        // FLOW: Redirect to Stripe checkout
        if (!selectedPlan) {
          throw new Error('Selecione um plano para continuar');
        }

        const planName = selectedPlan.name.toLowerCase().replace('miauchat ', '');
        const checkoutPayload = {
          plan: planName,
          billingPeriod: billingPeriod,
          companyName: formData.companyName,
          adminName: formData.adminName,
          adminEmail: formData.email,
          adminPhone: formData.phone,
          document: formData.document,
          subdomain: formData.subdomain || undefined,
        };

        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: checkoutPayload,
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!data?.url) {
          throw new Error('Não foi possível gerar o link de pagamento');
        }

        // Redirect to checkout
        window.location.href = data.url;
        return;
      }

      // FLOW: Trial registration
      const { data, error } = await supabase.functions.invoke('register-company', {
        body: {
          company_name: formData.companyName,
          admin_name: formData.adminName,
          admin_email: formData.email,
          phone: formData.phone,
          document: formData.document,
          plan_id: formData.planId,
          subdomain: formData.subdomain || undefined,
          registration_mode: 'trial',
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro ao realizar cadastro');
      }

      setIsAutoApproved(data.auto_approved === true);
      setIsSuccess(true);
      toast({
        title: data.auto_approved ? "Conta criada!" : "Cadastro realizado!",
        description: data.auto_approved 
          ? "Seu período de teste foi ativado. Verifique seu email."
          : "Sua solicitação foi enviada para análise.",
      });

    } catch (err: any) {
      console.error("[Register] Error:", err);
      toast({
        title: "Erro no cadastro",
        description: err.message || "Não foi possível realizar o cadastro. Tente novamente.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shadow-2xl animate-scale-in">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="mb-6">
              <div className="mx-auto w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4">
              {isAutoApproved ? "Conta Ativada!" : "Cadastro Enviado!"}
            </h2>
            
            {isAutoApproved ? (
              <>
                <p className="text-zinc-400 mb-6">
                  Seu período de teste de <strong className="text-green-400">7 dias</strong> foi ativado! 
                  Enviamos os dados de acesso para <strong className="text-zinc-300">{formData.email}</strong>.
                </p>
                
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm text-green-400 mb-2 font-semibold">✨ Seu trial inclui:</p>
                  <ul className="text-sm text-zinc-300 space-y-2">
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5" />
                      Acesso completo ao plano selecionado
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5" />
                      7 dias para testar todas as funcionalidades
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5" />
                      Sem cobrança durante o período de teste
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <p className="text-zinc-400 mb-6">
                  Sua solicitação foi enviada para análise. Nossa equipe entrará em contato 
                  em breve através do email <strong className="text-zinc-300">{formData.email}</strong>.
                </p>
                
                <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm text-zinc-400 mb-2">O que acontece agora?</p>
                  <ul className="text-sm text-zinc-300 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-red-500">1.</span>
                      Nossa equipe analisará seu cadastro
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500">2.</span>
                      Após aprovação, você receberá um email com seus dados de acesso
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500">3.</span>
                      Acesse sua conta e comece a usar o MiauChat!
                    </li>
                  </ul>
                </div>
              </>
            )}
            
            <Button 
              variant="outline" 
              onClick={() => navigate("/auth")}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {isAutoApproved ? "Fazer Login" : "Voltar para Login"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-zinc-950">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-red-700/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
        </div>
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/[0.08] blur-lg rounded-full scale-105" />
              <img 
                src={miauchatLogo} 
                alt="MiauChat" 
                className="relative w-32 h-32 object-contain bg-transparent drop-shadow-[0_0_10px_rgba(239,68,68,0.15)]" 
              />
            </div>
            <div>
              <span className="font-bold text-3xl text-white tracking-wide">
                MIAUCHAT
              </span>
              <p className="text-zinc-500 text-base">Plataforma de Comunicação</p>
            </div>
          </div>
          
          <div className="space-y-8">
            <h1 className="text-5xl font-bold text-white leading-tight animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              Transforme sua
              <br />
              <span className="text-red-500">Comunicação</span>
              <br />
              Empresarial
            </h1>
            <p className="text-zinc-400 text-lg max-w-md leading-relaxed animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
              Automatize atendimentos, integre canais de comunicação 
              e aumente a produtividade da sua equipe com IA.
            </p>
          </div>
          
          <div className="flex items-center gap-6 text-zinc-500 text-sm animate-fade-in" style={{ animationDelay: "0.6s" }}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              WhatsApp Integrado
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              IA para Atendimento
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Multi-Usuários
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Registration Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-zinc-950 overflow-y-auto">
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shadow-2xl animate-scale-in my-8" style={{ animationDelay: "0.3s" }}>
          <CardHeader className="text-center pb-2">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
              <img src={miauchatLogo} alt="MiauChat" className="w-20 h-20 object-contain bg-transparent" />
              <div className="text-left">
                <span className="font-bold text-xl text-white block">MIAUCHAT</span>
                <span className="text-zinc-500 text-xs">Plataforma de Comunicação</span>
              </div>
            </div>
            <CardTitle className="text-2xl text-white">Cadastre sua Empresa</CardTitle>
            <CardDescription className="text-zinc-400">
              Preencha os dados para começar a usar o MiauChat
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company" className="text-zinc-300">
                  {companyFieldConfig.companyName.label} *
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="company"
                    type="text"
                    placeholder={companyFieldConfig.companyName.placeholder}
                    maxLength={companyFieldConfig.companyName.maxLength}
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.companyName}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              {/* Subdomain Field */}
              <div className="space-y-2">
                <Label htmlFor="subdomain" className="text-zinc-300">
                  Seu Subdomínio
                </Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="subdomain"
                    type="text"
                    placeholder="suaempresa"
                    maxLength={30}
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.subdomain}
                    onChange={(e) => handleSubdomainChange(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500">→</span>
                  <span className="text-zinc-400 font-mono">
                    {formData.subdomain || 'suaempresa'}.miauchat.com.br
                  </span>
                  {subdomainStatus === 'checking' && (
                    <span className="flex items-center gap-1 text-zinc-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Verificando...
                    </span>
                  )}
                  {subdomainStatus === 'available' && formData.subdomain.length >= 3 && (
                    <span className="flex items-center gap-1 text-green-500">
                      <Check className="h-3 w-3" />
                      Disponível
                    </span>
                  )}
                  {subdomainStatus === 'taken' && (
                    <span className="flex items-center gap-1 text-red-400">
                      <X className="h-3 w-3" />
                      Já em uso
                    </span>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin" className="text-zinc-300">
                  {companyFieldConfig.adminName.label} *
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="admin"
                    type="text"
                    placeholder={companyFieldConfig.adminName.placeholder}
                    maxLength={companyFieldConfig.adminName.maxLength}
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.adminName}
                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">
                  {companyFieldConfig.email.label} *
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="email"
                    type={companyFieldConfig.email.type}
                    placeholder={companyFieldConfig.email.placeholder}
                    maxLength={companyFieldConfig.email.maxLength}
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-zinc-300">
                    {companyFieldConfig.phone.label} *
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="document" className="text-zinc-300">
                    {companyFieldConfig.document.label} *
                  </Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="document"
                      type="text"
                      placeholder="000.000.000-00"
                      className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: formatDocument(e.target.value) })}
                      required
                    />
                  </div>
                </div>
              </div>
              
              {/* Plan Selection */}
              <div className="space-y-3">
                <Label className="text-zinc-300 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-zinc-500" />
                  {companyFieldConfig.planId.label} *
                </Label>
                
                {plansLoading ? (
                  <div className="text-zinc-500 text-sm">Carregando planos...</div>
                ) : activePlans.length === 0 ? (
                  <div className="text-zinc-500 text-sm">Nenhum plano disponível</div>
                ) : (
                  <RadioGroup
                    value={formData.planId}
                    onValueChange={(value) => setFormData({ ...formData, planId: value })}
                    className="space-y-2"
                  >
                    {activePlans.map((plan) => (
                      <label
                        key={plan.id}
                        htmlFor={`plan-${plan.id}`}
                        className={`relative flex items-start p-3 rounded-lg border transition-all cursor-pointer ${
                          formData.planId === plan.id
                            ? "border-red-500 bg-red-500/10"
                            : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
                        }`}
                      >
                        <RadioGroupItem
                          value={plan.id}
                          id={`plan-${plan.id}`}
                          className="mt-1 border-zinc-500 text-red-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">
                              {plan.name}
                            </span>
                            <span className="text-red-400 font-semibold">
                              R$ {plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              <span className="text-xs text-zinc-500">/{plan.billing_period === 'monthly' ? 'mês' : plan.billing_period}</span>
                            </span>
                          </div>
                          {plan.description && (
                            <p className="text-zinc-400 text-xs mt-1">{plan.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2 text-xs text-zinc-500">
                            <span>{plan.max_users >= 999 ? "∞" : plan.max_users} membros</span>
                            <span>•</span>
                            <span>{plan.max_instances} WhatsApp</span>
                            <span>•</span>
                            <span>{plan.max_ai_conversations} conv. IA</span>
                            <span>•</span>
                            <span>{plan.max_tts_minutes} min áudio</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </div>
              
              {/* Registration Mode Selection */}
              <div className="space-y-3 pt-2">
                <Label className="text-zinc-300 font-medium">
                  Como deseja começar?
                </Label>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Pay Now Option */}
                  <button
                    type="button"
                    onClick={() => setRegistrationMode('pay_now')}
                    className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                      registrationMode === 'pay_now'
                        ? "border-red-500 bg-red-500/10"
                        : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className={`h-5 w-5 ${registrationMode === 'pay_now' ? 'text-red-400' : 'text-zinc-500'}`} />
                      <span className={`font-semibold ${registrationMode === 'pay_now' ? 'text-white' : 'text-zinc-300'}`}>
                        Pagar Agora
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Acesso imediato após confirmação do pagamento
                    </p>
                    {registrationMode === 'pay_now' && (
                      <div className="absolute top-2 right-2">
                        <Check className="h-4 w-4 text-red-400" />
                      </div>
                    )}
                  </button>
                  
                  {/* Trial Option */}
                  <button
                    type="button"
                    onClick={() => setRegistrationMode('trial')}
                    className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                      registrationMode === 'trial'
                        ? "border-green-500 bg-green-500/10"
                        : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Gift className={`h-5 w-5 ${registrationMode === 'trial' ? 'text-green-400' : 'text-zinc-500'}`} />
                      <span className={`font-semibold ${registrationMode === 'trial' ? 'text-white' : 'text-zinc-300'}`}>
                        Trial Grátis
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      7 dias grátis para testar todas as funcionalidades
                    </p>
                    {registrationMode === 'trial' && (
                      <div className="absolute top-2 right-2">
                        <Check className="h-4 w-4 text-green-400" />
                      </div>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Billing Period Selection (only for pay_now) */}
              {registrationMode === 'pay_now' && selectedPlan && (
                <div className="space-y-3">
                  <Label className="text-zinc-300 font-medium flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-zinc-500" />
                    Período de Cobrança
                  </Label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Monthly Option */}
                    <button
                      type="button"
                      onClick={() => setBillingPeriod('monthly')}
                      className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                        billingPeriod === 'monthly'
                          ? "border-red-500 bg-red-500/10"
                          : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
                      }`}
                    >
                      <div className="mb-2">
                        <span className={`font-semibold ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-300'}`}>
                          Mensal
                        </span>
                      </div>
                      <div className="text-lg font-bold text-red-400">
                        R$ {selectedPlan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        <span className="text-xs text-zinc-500 font-normal">/mês</span>
                      </div>
                      {billingPeriod === 'monthly' && (
                        <div className="absolute top-2 right-2">
                          <Check className="h-4 w-4 text-red-400" />
                        </div>
                      )}
                    </button>
                    
                    {/* Yearly Option */}
                    <button
                      type="button"
                      onClick={() => setBillingPeriod('yearly')}
                      className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                        billingPeriod === 'yearly'
                          ? "border-green-500 bg-green-500/10"
                          : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
                      }`}
                    >
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-green-600 text-[10px] font-bold rounded-full uppercase text-white">
                        1 mês grátis
                      </div>
                      <div className="mb-2">
                        <span className={`font-semibold ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-300'}`}>
                          Anual
                        </span>
                      </div>
                      <div className="text-lg font-bold text-green-400">
                        R$ {yearlyPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        <span className="text-xs text-zinc-500 font-normal">/ano</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        ≈ R$ {yearlyMonthlyEquivalent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                      </p>
                      {billingPeriod === 'yearly' && (
                        <div className="absolute top-2 right-2">
                          <Check className="h-4 w-4 text-green-400" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Info box based on selected mode */}
              <div className={`rounded-lg p-3 border ${
                registrationMode === 'pay_now' 
                  ? 'bg-red-500/5 border-red-500/30' 
                  : 'bg-green-500/5 border-green-500/30'
              }`}>
                <p className="text-xs text-zinc-400">
                  {registrationMode === 'pay_now' ? (
                    <>
                      💳 Você será redirecionado para a página de pagamento{billingPeriod === 'yearly' ? ' (cobrança anual)' : ''}. 
                      Após a confirmação, sua conta será ativada automaticamente.
                    </>
                  ) : (
                    <>
                      🎁 Experimente o MiauChat por 7 dias sem compromisso. 
                      Ao final do período, você pode assinar o plano escolhido.
                    </>
                  )}
                </p>
              </div>
              
              <Button 
                type="submit" 
                className={`w-full ${
                  registrationMode === 'pay_now'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white`} 
                disabled={isLoading || !formData.planId}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : registrationMode === 'pay_now' ? (
                  <>
                    Continuar para Pagamento
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    Iniciar Período de Teste
                    <Gift className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              
              <p className="text-center text-sm text-zinc-500">
                Já tem uma conta?{" "}
                <button 
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  Faça login
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
