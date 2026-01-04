import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, ArrowRight, Eye, EyeOff, ArrowLeft, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import miauchatLogo from "@/assets/miauchat-logo.png";

const loginSchema = z.object({
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(100),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido").max(255),
});

export default function Auth() {
  const AUTH_LOADING_TIMEOUT_MS = 10000;

  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [authInitTimedOut, setAuthInitTimedOut] = useState(false);
  
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  useEffect(() => {
    // Só redireciona quando auth terminou de carregar E user existe
    if (!loading && user) {
      console.log("[Auth] Usuário já logado, redirecionando para dashboard");
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  // Timeout de segurança para evitar loading infinito na tela de login
  useEffect(() => {
    if (!loading) {
      setAuthInitTimedOut(false);
      return;
    }

    const t = setTimeout(() => {
      setAuthInitTimedOut(true);
    }, AUTH_LOADING_TIMEOUT_MS);

    return () => clearTimeout(t);
  }, [loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse(loginData);
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });

      if (error) {
        toast({
          title: "Falha na autenticação",
          description: error.message || "Email ou senha incorretos.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Bem-vindo!",
          description: "Login realizado com sucesso.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: `Falha na conexão: ${err?.message || 'Erro desconhecido'}.`,
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = forgotPasswordSchema.safeParse({ email: forgotPasswordEmail });
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
      // Use custom password reset function to send via Resend
      const { data, error } = await supabase.functions.invoke('custom-password-reset', {
        body: {
          email: forgotPasswordEmail,
          redirect_to: `${window.location.origin}/reset-password`,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao enviar email');
      }

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    } catch (err: any) {
      console.error('[Auth] Password reset error:', err);
      toast({
        title: "Erro ao enviar email",
        description: err?.message || "Não foi possível enviar o email de recuperação. Tente novamente.",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  if (loading) {
    if (authInitTimedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
            <img src={miauchatLogo} alt="MiauChat" className="w-24 h-24 object-contain bg-transparent opacity-80" />
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-6 w-6" />
              <h1 className="text-xl font-semibold text-white">Problema ao carregar</h1>
            </div>
            <p className="text-zinc-400">
              Não foi possível verificar sua sessão. Tente recarregar a página.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <Button onClick={() => window.location.reload()} className="w-full bg-red-600 hover:bg-red-700 text-white gap-2">
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
              <Button variant="outline" onClick={() => navigate("/auth", { replace: true })} className="w-full border-zinc-700 text-white hover:bg-zinc-900">
                Ir para login
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-pulse">
            <img src={miauchatLogo} alt="MiauChat" className="w-32 h-32 object-contain bg-transparent" />
          </div>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
          <p className="text-zinc-500 text-sm">Carregando autenticação...</p>
        </div>
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
              Multiplataforma de
              <br />
              <span className="text-red-500">Inteligência Artificial</span>
              <br />
              Unificada
            </h1>
            <p className="text-zinc-400 text-lg max-w-md leading-relaxed animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
              Gerencie suas comunicações com automação inteligente, 
              integração multicanal e organização profissional.
            </p>
          </div>
          
          <div className="flex items-center gap-6 text-zinc-500 text-sm animate-fade-in" style={{ animationDelay: "0.6s" }}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Multi-Tenant
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              SaaS
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              IA Integrada
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
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
            {showForgotPassword ? (
              <>
                <CardTitle className="text-2xl text-white">Recuperar Senha</CardTitle>
                <CardDescription className="text-zinc-400">
                  Digite seu email para receber o link de recuperação
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl text-white">Acesse sua conta</CardTitle>
                <CardDescription className="text-zinc-400">
                  Entre com suas credenciais para continuar
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-zinc-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-red-600 hover:bg-red-700 text-white" 
                  disabled={isLoading}
                >
                  {isLoading ? "Enviando..." : "Enviar Link de Recuperação"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button 
                  type="button" 
                  onClick={() => setShowForgotPassword(false)}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-zinc-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-zinc-300">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Esqueci minha senha
                </button>
                <Button 
                  type="submit" 
                  className="w-full bg-red-600 hover:bg-red-700 text-white" 
                  disabled={isLoading}
                >
                  {isLoading ? "Entrando..." : "Entrar"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-zinc-900 text-zinc-500">ou</span>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-3">
                    Ainda não tem uma conta?
                  </p>
                  <Link 
                    to="/register" 
                    className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors font-medium"
                  >
                    Cadastre sua empresa
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </form>
            )}
            
            <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
              <p className="text-zinc-500 text-xs">
                www.miauchat.com.br
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
