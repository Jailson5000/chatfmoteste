import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import miauchatLogo from "@/assets/miauchat-logo.png";

const resetSchema = z.object({
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(100),
  confirmPassword: z.string().min(6, "Confirmação de senha obrigatória").max(100),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
  const [isValidSession, setIsValidSession] = useState(false);

  useEffect(() => {
    document.title = "Redefinir Senha | MiauChat";

    let resolved = false;

    const resolveWithSession = () => {
      if (resolved) return;
      resolved = true;
      setIsValidSession(true);
    };

    const timeoutId = window.setTimeout(() => {
      if (resolved) return;
      toast({
        title: "Link inválido",
        description: "O link de recuperação é inválido, já foi usado ou expirou.",
        variant: "destructive",
      });
      navigate("/auth", { replace: true });
    }, 10000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.clearTimeout(timeoutId);
        resolveWithSession();
      }
    });

    // Hydrate the recovery session from URL (code flow OR access_token in hash)
    // This is required so the reset page works when coming from email links.
    const hydrateFromUrl = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else {
          // Handles links like /reset-password#access_token=...&refresh_token=...
          // storeSession=true persists the session for the reset flow.
          // @ts-expect-error: supabase-js supports getSessionFromUrl in auth client
          await supabase.auth.getSessionFromUrl({ storeSession: true });
        }
      } catch (err) {
        // Ignore: we'll fall back to getSession + timeout
        console.warn('[ResetPassword] Failed to hydrate session from URL', err);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Cleanup URL (remove token hash / query params) after session is stored
        window.history.replaceState({}, document.title, '/reset-password');

        window.clearTimeout(timeoutId);
        resolveWithSession();
      }
    };

    // Check if user already has a valid recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.clearTimeout(timeoutId);
        resolveWithSession();
        return;
      }

      hydrateFromUrl();
    });

    return () => {
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = resetSchema.safeParse(formData);
    if (!result.success) {
      toast({
        title: "Erro de validação",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: formData.password,
    });

    if (error) {
      toast({
        title: "Erro ao redefinir senha",
        description: "Não foi possível redefinir a senha. Tente novamente.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Senha redefinida!",
        description: "Sua senha foi alterada com sucesso.",
      });
      navigate("/dashboard");
    }
    setIsLoading(false);
  };

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-pulse">
          <img src={miauchatLogo} alt="MiauChat" className="w-32 h-32 object-contain bg-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-8">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src={miauchatLogo} alt="MiauChat" className="w-20 h-20 object-contain bg-transparent" />
          </div>
          <CardTitle className="text-2xl text-white">Redefinir Senha</CardTitle>
          <CardDescription className="text-zinc-400">
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10 pr-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-zinc-300">Confirmar Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10 pr-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500 focus:ring-red-500/20"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-red-600 hover:bg-red-700 text-white" 
              disabled={isLoading}
            >
              {isLoading ? "Salvando..." : "Salvar Nova Senha"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
          
          <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
            <p className="text-zinc-500 text-xs">
              www.miauchat.com.br
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
