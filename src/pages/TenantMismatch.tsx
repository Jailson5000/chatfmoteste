import { AlertTriangle, LogOut, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TenantMismatchProps {
  expectedSubdomain: string;
  currentSubdomain?: string | null;
}

/**
 * Page shown when a user tries to access a subdomain different from their company's
 * 
 * CRITICAL SECURITY: Each client can only access their own subdomain.
 * Attempts to access other subdomains are blocked and this page is displayed.
 * 
 * NOTE: This page uses plain HTML elements instead of Radix-based components
 * to avoid the React 19 + @radix-ui/react-compose-refs infinite ref loop bug
 * (GitHub: radix-ui/primitives#3799)
 */
export default function TenantMismatch({ expectedSubdomain, currentSubdomain }: TenantMismatchProps) {
  const correctUrl = `https://${expectedSubdomain}.miauchat.com.br`;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  const handleGoToCorrectSubdomain = () => {
    window.location.href = correctUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6 text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="text-xl font-semibold leading-none tracking-tight">Acesso não permitido</h3>
          <p className="text-sm text-muted-foreground">
            Você está tentando acessar uma plataforma que não corresponde à sua empresa.
          </p>
        </div>
        <div className="p-6 pt-0 space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Subdomínio atual:</p>
              <p className="font-mono text-sm text-destructive">
                {currentSubdomain ? `${currentSubdomain}.miauchat.com.br` : 'Domínio principal'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Seu subdomínio correto:</p>
              <p className="font-mono text-sm text-primary font-semibold">
                {expectedSubdomain}.miauchat.com.br
              </p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>Importante:</strong> No MIAUCHAT, cada cliente acessa apenas a sua própria plataforma através do seu subdomínio exclusivo.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoToCorrectSubdomain}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full"
            >
              <ExternalLink className="w-4 h-4" />
              Ir para minha plataforma
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors w-full"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Dúvidas? Entre em contato pelo email{" "}
            <a href="mailto:suporte@miauchat.com.br" className="text-primary hover:underline">
              suporte@miauchat.com.br
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
