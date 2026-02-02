import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CreditCard, Calendar, AlertTriangle, MessageCircle, UserPlus, Gift, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPhone, formatDocument } from "@/lib/inputMasks";
import { useNavigate } from "react-router-dom";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: {
    name: string;
    price: string;
    yearlyPrice?: string;
  };
}

type RegistrationMode = 'trial' | 'pay_now';

export function CheckoutModal({ open, onOpenChange, plan }: CheckoutModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  // Payment always uses Stripe
  const [paymentsDisabled, setPaymentsDisabled] = useState(false);
  const [manualRegistrationEnabled, setManualRegistrationEnabled] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('pay_now');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAutoApproved, setIsAutoApproved] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    document: "",
  });

  const navigate = useNavigate();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setIsSuccess(false);
      setIsAutoApproved(false);
    }
  }, [open]);

  // Fetch payment settings on mount
  useEffect(() => {
    const fetchPaymentSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("key, value")
          .in("key", ["payments_disabled", "manual_registration_enabled"]);

        if (!error && data) {
          for (const setting of data) {
            if (setting.key === "payments_disabled") {
              const disabled = String(setting.value).replace(/"/g, "") === "true";
              setPaymentsDisabled(disabled);
            }
            if (setting.key === "manual_registration_enabled") {
              const enabled = String(setting.value).replace(/"/g, "") === "true";
              setManualRegistrationEnabled(enabled);
            }
          }
        }
      } catch (err) {
        console.log("Using default payment settings");
      }
    };

    if (open) {
      fetchPaymentSettings();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.companyName || !formData.adminName || !formData.adminEmail) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.adminEmail)) {
      toast.error("E-mail inválido");
      return;
    }

    // Phone and document required for both flows
    if (!formData.adminPhone || !formData.document) {
      toast.error("Telefone e CPF/CNPJ são obrigatórios");
      return;
    }

    setIsLoading(true);

    try {
      if (registrationMode === 'trial') {
        // TRIAL FLOW: Call register-company
        const { data, error } = await supabase.functions.invoke('register-company', {
          body: {
            company_name: formData.companyName,
            admin_name: formData.adminName,
            admin_email: formData.adminEmail,
            phone: formData.adminPhone,
            document: formData.document,
            plan_name: plan.name.toLowerCase().replace('miauchat ', ''),
            registration_mode: 'trial',
          },
        });

        if (error) {
          console.error("Trial registration error:", error);
          toast.error("Erro ao iniciar trial: " + error.message);
          return;
        }

        if (!data?.success) {
          toast.error(data?.error || "Erro ao processar cadastro");
          return;
        }

        setIsAutoApproved(data.auto_approved === true);
        setIsSuccess(true);
        return;
      }

      // PAY NOW FLOW: Redirect to Stripe checkout
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          plan: plan.name,
          billingPeriod,
          companyName: formData.companyName,
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPhone: formData.adminPhone,
          document: formData.document,
        },
      });

      if (error) {
        console.error("Checkout error:", error);
        toast.error("Erro ao iniciar checkout: " + error.message);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("URL de checkout não recebida");
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error("Erro ao processar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, adminPhone: formatPhone(e.target.value) });
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, document: formatDocument(e.target.value) });
  };

  // Calculate prices
  const monthlyPrice = parseFloat(plan.price.replace(".", "").replace(",", "."));
  const yearlyPrice = monthlyPrice * 11;
  const yearlyMonthly = yearlyPrice / 12;
  const savings = monthlyPrice * 12 - yearlyPrice;

  // Provider is always Stripe

  // SUCCESS STATE
  if (isSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-[#0a0a0a] border-white/10 text-white">
          <div className="pt-4 pb-4 text-center">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <h2 className="text-xl font-bold text-white mb-3">
              {isAutoApproved ? "Trial Ativado!" : "Cadastro Enviado!"}
            </h2>
            
            {isAutoApproved ? (
              <>
                <p className="text-white/60 mb-4 text-sm">
                  Seu período de teste de <strong className="text-green-400">7 dias</strong> foi ativado! 
                  Enviamos os dados de acesso para <strong className="text-white/80">{formData.adminEmail}</strong>.
                </p>
                
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-5 text-left">
                  <p className="text-sm text-green-400 mb-2 font-semibold">✨ Seu trial inclui:</p>
                  <ul className="text-xs text-white/70 space-y-1.5">
                    <li>✓ Acesso completo ao plano {plan.name}</li>
                    <li>✓ 7 dias para testar todas as funcionalidades</li>
                    <li>✓ Sem cobrança durante o período de teste</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <p className="text-white/60 mb-4 text-sm">
                  Sua solicitação foi enviada para análise. Entraremos em contato 
                  através do email <strong className="text-white/80">{formData.adminEmail}</strong>.
                </p>
                
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-5 text-left">
                  <p className="text-xs text-white/50 mb-2">O que acontece agora?</p>
                  <ul className="text-xs text-white/70 space-y-1.5">
                    <li>1. Nossa equipe analisará seu cadastro</li>
                    <li>2. Após aprovação, você receberá um email com acesso</li>
                    <li>3. Comece a usar o MiauChat!</li>
                  </ul>
                </div>
              </>
            )}
            
            <Button 
              variant="outline" 
              onClick={() => {
                onOpenChange(false);
                if (isAutoApproved) navigate("/auth");
              }}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              {isAutoApproved ? "Fazer Login" : "Fechar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // If manual registration is enabled, show registration redirect
  if (manualRegistrationEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-[#0a0a0a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-500" />
              Cadastre sua Empresa
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Preencha o formulário para solicitar acesso ao MiauChat
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
              <p className="font-medium mb-2">Plano selecionado: {plan.name}</p>
              <p className="text-white/60">
                Ao preencher o cadastro, sua solicitação será analisada pela nossa equipe. 
                Após aprovação, você receberá um email com seus dados de acesso.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => {
                  onOpenChange(false);
                  navigate("/register");
                }}
                className="w-full bg-red-600 hover:bg-red-500 h-12 text-base font-semibold"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Preencher Cadastro
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Voltar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // If payments are disabled, show contact message
  if (paymentsDisabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-[#0a0a0a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Pagamentos Temporariamente Indisponíveis
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Estamos processando assinaturas manualmente no momento
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
              <p className="font-medium mb-2">Plano selecionado: {plan.name}</p>
              <p className="text-white/60">
                Para assinar este plano, entre em contato conosco diretamente. 
                Nossa equipe fará a liberação manual da sua conta.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => window.open("https://wa.me/5563999916064?text=Olá! Gostaria de assinar o plano " + plan.name, "_blank")}
                className="w-full bg-green-600 hover:bg-green-500 h-12 text-base font-semibold"
              >
                <MessageCircle className="mr-2 h-5 w-5" />
                Falar pelo WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Voltar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0a0a0a] border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Assinar Plano <span className="text-red-500">{plan.name}</span>
          </DialogTitle>
          <DialogDescription className="text-white/50">
            Escolha como deseja começar
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Registration Mode Selection */}
          <div className="space-y-3">
            <Label className="text-white/70 font-medium">Como deseja começar?</Label>
            <div className="grid grid-cols-2 gap-3">
              {/* Pay Now Option */}
              <button
                type="button"
                onClick={() => setRegistrationMode('pay_now')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all ${
                  registrationMode === 'pay_now'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <CreditCard className="h-6 w-6 text-white/80" />
                <span className="font-medium text-sm">💳 Pagar Agora</span>
                <span className="text-xs text-white/50 text-center">Acesso imediato após pagamento</span>
              </button>

              {/* Trial Option */}
              <button
                type="button"
                onClick={() => setRegistrationMode('trial')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all relative ${
                  registrationMode === 'trial'
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <div className="absolute -top-2 right-2 px-2 py-0.5 bg-green-600 text-[10px] font-bold rounded-full">
                  GRÁTIS
                </div>
                <Gift className="h-6 w-6 text-green-400" />
                <span className="font-medium text-sm">🎁 Trial Grátis</span>
                <span className="text-xs text-white/50 text-center">7 dias para testar</span>
              </button>
            </div>
          </div>

          {/* Billing Period Selection - Only for Pay Now */}
          {registrationMode === 'pay_now' && (
            <div className="space-y-3">
              <Label className="text-white/70">Período de cobrança</Label>
              <RadioGroup
                value={billingPeriod}
                onValueChange={(v) => setBillingPeriod(v as "monthly" | "yearly")}
                className="grid grid-cols-2 gap-3"
              >
                <label
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all ${
                    billingPeriod === "monthly"
                      ? "border-red-500 bg-red-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <RadioGroupItem value="monthly" className="sr-only" />
                  <Calendar className="h-5 w-5 text-white/60" />
                  <span className="font-medium">Mensal</span>
                  <span className="text-lg font-bold text-red-500">
                    R$ {plan.price}
                  </span>
                  <span className="text-xs text-white/40">por mês</span>
                </label>

                <label
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all relative ${
                    billingPeriod === "yearly"
                      ? "border-red-500 bg-red-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <RadioGroupItem value="yearly" className="sr-only" />
                  <div className="absolute -top-2 right-2 px-2 py-0.5 bg-green-600 text-[10px] font-bold rounded-full">
                    ECONOMIZE
                  </div>
                  <CreditCard className="h-5 w-5 text-white/60" />
                  <span className="font-medium">Anual</span>
                  <span className="text-lg font-bold text-red-500">
                    R$ {yearlyMonthly.toFixed(2).replace(".", ",")}
                  </span>
                  <span className="text-xs text-white/40">por mês</span>
                  <span className="text-xs text-green-400">
                    1 mês grátis (R$ {savings.toFixed(0)})
                  </span>
                  <span className="text-[10px] text-white/50 text-center leading-tight mt-1">
                    + Suporte para implementação
                  </span>
                </label>
              </RadioGroup>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-white/70">
                Nome da empresa *
              </Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                placeholder="Sua Empresa Ltda"
                className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminName" className="text-white/70">
                Seu nome completo *
              </Label>
              <Input
                id="adminName"
                value={formData.adminName}
                onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                placeholder="João Silva"
                className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail" className="text-white/70">
                E-mail corporativo *
              </Label>
              <Input
                id="adminEmail"
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                placeholder="voce@empresa.com.br"
                className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="adminPhone" className="text-white/70">
                  Telefone *
                </Label>
                <Input
                  id="adminPhone"
                  value={formData.adminPhone}
                  onChange={handlePhoneChange}
                  placeholder="(11) 99999-9999"
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="document" className="text-white/70">
                  CPF/CNPJ *
                </Label>
                <Input
                  id="document"
                  value={formData.document}
                  onChange={handleDocumentChange}
                  placeholder="00.000.000/0001-00"
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                  required
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className={`w-full h-12 text-base font-semibold ${
              registrationMode === 'trial'
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : registrationMode === 'trial' ? (
              <>
                <Gift className="mr-2 h-4 w-4" />
                Iniciar Período de Teste
              </>
            ) : (
              <>
                Continuar para pagamento
                <CreditCard className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-white/40">
            {registrationMode === 'trial'
              ? 'Teste grátis por 7 dias. Cancele quando quiser.'
              : 'Você será redirecionado para o checkout seguro do Stripe'
            }
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
