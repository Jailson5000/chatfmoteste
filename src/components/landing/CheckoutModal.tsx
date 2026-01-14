import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CreditCard, Calendar, AlertTriangle, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPhone, formatDocument } from "@/lib/inputMasks";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: {
    name: string;
    price: string;
    yearlyPrice?: string;
  };
}

export function CheckoutModal({ open, onOpenChange, plan }: CheckoutModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "asaas">("stripe");
  const [paymentsDisabled, setPaymentsDisabled] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [formData, setFormData] = useState({
    companyName: "",
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    document: "",
  });

  // Fetch payment provider and disabled settings on mount
  useEffect(() => {
    const fetchPaymentSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("key, value")
          .in("key", ["payment_provider", "payments_disabled"]);

        if (!error && data) {
          for (const setting of data) {
            if (setting.key === "payment_provider") {
              const provider = String(setting.value).replace(/"/g, "");
              if (provider === "stripe" || provider === "asaas") {
                setPaymentProvider(provider);
              }
            }
            if (setting.key === "payments_disabled") {
              const disabled = String(setting.value).replace(/"/g, "") === "true";
              setPaymentsDisabled(disabled);
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

    setIsLoading(true);

    try {
      // Choose the correct edge function based on payment provider
      const functionName = paymentProvider === "asaas" 
        ? "create-asaas-checkout" 
        : "create-checkout-session";

      const { data, error } = await supabase.functions.invoke(functionName, {
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
        // Redirect to checkout
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
  const yearlyPrice = monthlyPrice * 11; // 1 month discount
  const yearlyMonthly = yearlyPrice / 12;
  const savings = monthlyPrice * 12 - yearlyPrice;

  const providerLabel = paymentProvider === "asaas" ? "ASAAS" : "Stripe";

  // If payments are disabled, show contact message instead
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
      <DialogContent className="sm:max-w-lg bg-[#0a0a0a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Assinar Plano <span className="text-red-500">{plan.name}</span>
          </DialogTitle>
          <DialogDescription className="text-white/50">
            Preencha seus dados para finalizar a assinatura
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Billing Period Selection */}
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
                  + Suporte para implementação do sistema da sua empresa
                </span>
              </label>
            </RadioGroup>
          </div>

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
                  Telefone
                </Label>
                <Input
                  id="adminPhone"
                  value={formData.adminPhone}
                  onChange={handlePhoneChange}
                  placeholder="(11) 99999-9999"
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="document" className="text-white/70">
                  CPF/CNPJ
                </Label>
                <Input
                  id="document"
                  value={formData.document}
                  onChange={handleDocumentChange}
                  placeholder="00.000.000/0001-00"
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-red-600 hover:bg-red-500 h-12 text-base font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                Continuar para pagamento
                <CreditCard className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-white/40">
            Você será redirecionado para o checkout seguro do {providerLabel}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
