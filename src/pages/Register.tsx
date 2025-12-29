import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, User, Building2, ArrowRight, Phone, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import miauchatLogo from "@/assets/miauchat-logo.png";

const registerSchema = z.object({
  companyName: z.string().min(2, "Nome da empresa deve ter no mínimo 2 caracteres").max(100),
  adminName: z.string().min(2, "Nome do administrador deve ter no mínimo 2 caracteres").max(100),
  email: z.string().email("Email inválido").max(255),
  phone: z.string().optional(),
  document: z.string().optional(),
});

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    companyName: "",
    adminName: "",
    email: "",
    phone: "",
    document: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = registerSchema.safeParse(formData);
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
      const { data, error } = await supabase.functions.invoke('register-company', {
        body: {
          company_name: formData.companyName,
          admin_name: formData.adminName,
          admin_email: formData.email,
          phone: formData.phone || undefined,
          document: formData.document || undefined,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro ao realizar cadastro');
      }

      setIsSuccess(true);
      toast({
        title: "Cadastro realizado!",
        description: "Sua solicitação foi enviada para análise.",
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
              Cadastro Enviado!
            </h2>
            
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
            
            <Button 
              variant="outline" 
              onClick={() => navigate("/auth")}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Voltar para Login
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
      <div className="flex-1 flex items-center justify-center p-8 bg-zinc-950">
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shadow-2xl animate-scale-in" style={{ animationDelay: "0.3s" }}>
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
              Preencha os dados para solicitar acesso ao MiauChat
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company" className="text-zinc-300">Nome da Empresa *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="company"
                    type="text"
                    placeholder="Sua empresa"
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin" className="text-zinc-300">Nome do Responsável *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="admin"
                    type="text"
                    placeholder="Seu nome"
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.adminName}
                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-zinc-300">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="document" className="text-zinc-300">CNPJ/CPF</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="document"
                      type="text"
                      placeholder="00.000.000/0000-00"
                      className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-zinc-800/30 rounded-lg p-3 border border-zinc-700/50">
                <p className="text-xs text-zinc-400">
                  ⚠️ Após o cadastro, sua solicitação será analisada pela nossa equipe. 
                  Você receberá um email com os dados de acesso após a aprovação.
                </p>
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-red-600 hover:bg-red-700 text-white" 
                disabled={isLoading}
              >
                {isLoading ? "Enviando..." : "Solicitar Cadastro"}
                <ArrowRight className="ml-2 h-4 w-4" />
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
