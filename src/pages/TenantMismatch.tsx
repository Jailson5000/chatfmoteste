import { AlertTriangle, LogOut, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface TenantMismatchProps {
  expectedSubdomain: string;
  currentSubdomain?: string | null;
}

/**
 * Page shown when a user tries to access a subdomain different from their company's
 * 
 * CRITICAL SECURITY: Each client can only access their own subdomain.
 * Attempts to access other subdomains are blocked and this page is displayed.
 */
export default function TenantMismatch({ expectedSubdomain, currentSubdomain }: TenantMismatchProps) {
  const navigate = useNavigate();
  
  const correctUrl = `https://${expectedSubdomain}.miauchat.com.br`;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleGoToCorrectSubdomain = () => {
    window.location.href = correctUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Acesso não permitido</CardTitle>
          <CardDescription>
            Você está tentando acessar uma plataforma que não corresponde à sua empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
            <Button onClick={handleGoToCorrectSubdomain} className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ir para minha plataforma
            </Button>
            <Button variant="outline" onClick={handleLogout} className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Dúvidas? Entre em contato pelo email{" "}
            <a href="mailto:suporte@miauchat.com.br" className="text-primary hover:underline">
              suporte@miauchat.com.br
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
