import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export default function GlobalAdminAuth() {
  const navigate = useNavigate();
  const { signIn, isAdmin, loading } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in as admin
  if (!loading && isAdmin) {
    navigate("/global-admin", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[GlobalAdminAuth] handleSubmit iniciado");
    setIsSubmitting(true);

    try {
      const validation = loginSchema.safeParse({ email, password });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const signInPromise = signIn(email, password);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      );
      const { error } = await Promise.race([signInPromise, timeoutPromise]);

      if (error) {
        toast.error("Credenciais inválidas");
        return;
      }

      setTimeout(() => {
        navigate("/global-admin");
      }, 500);
    } catch (error: any) {
      const isTimeout = error?.message === 'TIMEOUT';
      toast.error(isTimeout ? "Servidor lento, tente novamente" : "Erro ao fazer login");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030303]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030303] p-4 relative">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-red-600/15 rounded-full blur-[150px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mb-4 shadow-lg shadow-red-600/20">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">MiauChat Admin</h1>
          <p className="text-white/50">Painel de Administração Global</p>
        </div>

        <Card className="border-white/[0.08] bg-white/[0.03] backdrop-blur-sm shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-white">Login</CardTitle>
            <CardDescription className="text-white/50">
              Acesse o painel administrativo com suas credenciais
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/70">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@miauchat.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="bg-white/[0.05] border-white/[0.1] text-white placeholder:text-white/30 focus:border-red-500/50 focus:ring-red-500/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/70">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="pr-10 bg-white/[0.05] border-white/[0.1] text-white placeholder:text-white/30 focus:border-red-500/50 focus:ring-red-500/20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-white/40" />
                    ) : (
                      <Eye className="h-4 w-4 text-white/40" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-500 text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-white/30 mt-4">
          Acesso restrito a administradores autorizados
        </p>
      </div>
    </div>
  );
}
