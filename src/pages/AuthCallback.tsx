import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import miauchatLogo from "@/assets/miauchat-logo.png";

function sanitizeNext(next: string | null): string {
  if (!next) return "/dashboard";
  // Only allow internal paths to prevent open redirects
  if (!next.startsWith("/")) return "/dashboard";
  return next;
}

async function waitForSession(timeoutMs: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let resolved = false;
    let timeoutId = 0;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (resolved) return;
      if (session) {
        resolved = true;
        window.clearTimeout(timeoutId);
        subscription.unsubscribe();
        resolve(true);
      }
    });

    timeoutId = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      subscription.unsubscribe();
      resolve(false);
    }, timeoutMs);
  });
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Autenticação | MiauChat";
    console.log("[AuthCallback] Iniciando processamento de callback...");
    console.log("[AuthCallback] URL atual:", window.location.href);

    let cancelled = false;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const next = sanitizeNext(url.searchParams.get("next"));
        const code = url.searchParams.get("code");
        const errorParam = url.searchParams.get("error");
        const errorDesc = url.searchParams.get("error_description");
        
        console.log("[AuthCallback] Params: next=", next, "| code=", code ? "presente" : "ausente");
        
        // Check for OAuth error in URL
        if (errorParam) {
          console.error("[AuthCallback] Erro OAuth na URL:", errorParam, errorDesc);
          throw new Error(errorDesc || errorParam);
        }

        // PKCE/code flow support
        if (code) {
          console.log("[AuthCallback] Trocando code por sessão...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[AuthCallback] Erro exchangeCodeForSession:", error.message);
            throw error;
          }
          console.log("[AuthCallback] exchangeCodeForSession sucesso, sessão:", data.session ? "presente" : "ausente");
        }

        // Already have session?
        console.log("[AuthCallback] Verificando sessão existente...");
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("[AuthCallback] Erro getSession:", sessionError.message);
        }
        
        if (session) {
          console.log("[AuthCallback] Sessão encontrada, redirecionando para:", next);
          if (!cancelled) navigate(next, { replace: true });
          return;
        }

        // Wait a bit for session to be detected
        console.log("[AuthCallback] Aguardando sessão por 3s...");
        const gotSession = await waitForSession(3000);
        if (cancelled) return;

        if (gotSession) {
          console.log("[AuthCallback] Sessão detectada via listener, redirecionando para:", next);
          navigate(next, { replace: true });
        } else {
          console.warn("[AuthCallback] Timeout: nenhuma sessão detectada");
          toast({
            title: "Link inválido",
            description: "Não foi possível concluir a autenticação. Tente novamente.",
            variant: "destructive",
          });
          navigate("/auth", { replace: true });
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("[AuthCallback] Exceção:", err?.message || err);
        toast({
          title: "Erro de autenticação",
          description: err?.message ?? "Não foi possível concluir a autenticação.",
          variant: "destructive",
        });
        navigate("/auth", { replace: true });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate, toast]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
      <section className="flex flex-col items-center text-center gap-4">
        <img src={miauchatLogo} alt="MiauChat" className="w-20 h-20 object-contain" />
        <div className="flex items-center gap-2 text-zinc-200">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Finalizando autenticação…</span>
        </div>
        <p className="text-sm text-zinc-500 max-w-sm">
          Se esta tela não avançar em alguns segundos, volte e tente fazer login novamente.
        </p>
      </section>
    </main>
  );
}
