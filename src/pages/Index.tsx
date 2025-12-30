import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { LandingPage } from "@/pages/landing/LandingPage";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import miauchatLogo from "@/assets/miauchat-logo.png";

// Timeout de segurança: 10 segundos para auth resolver
const AUTH_TIMEOUT_MS = 10000;

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { isMainDomain, isLoading: tenantLoading, subdomain, error: tenantError } = useTenant();
  const navigate = useNavigate();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    document.title = "MiauChat | Multiplataforma de Inteligência Artificial Unificada";
  }, []);

  // Timeout de segurança para auth em tenants
  useEffect(() => {
    if (tenantLoading || isMainDomain) return;
    if (!subdomain) return;
    
    // Se já resolveu, não precisa de timeout
    if (!authLoading) {
      setAuthTimedOut(false);
      return;
    }

    const timeout = setTimeout(() => {
      if (authLoading) {
        console.warn('[Index] Auth timeout reached - auth still loading after', AUTH_TIMEOUT_MS, 'ms');
        setAuthTimedOut(true);
      }
    }, AUTH_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [tenantLoading, isMainDomain, subdomain, authLoading]);

  // PRIORITY 1: Tenant subdomain redirect (before auth check)
  useEffect(() => {
    if (tenantLoading) return;
    
    // É um subdomínio de tenant (não main domain)
    if (!isMainDomain && subdomain) {
      // Aguarda apenas o auth loading inicial finalizar
      if (authLoading && !authTimedOut) return;
      
      // Se deu timeout, não tenta redirecionar - mostra erro
      if (authTimedOut) return;
      
      // Se usuário já está logado, vai pro dashboard
      if (user) {
        navigate("/dashboard", { replace: true });
      } else {
        // Se não está logado, vai pro login
        navigate("/auth", { replace: true });
      }
    }
  }, [tenantLoading, authLoading, authTimedOut, isMainDomain, subdomain, user, navigate]);

  // PRIORITY 2: Usuário logado no domínio principal
  useEffect(() => {
    if (authLoading || tenantLoading) return;
    
    // Só redireciona se estiver no domínio principal E logado
    if (isMainDomain && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, tenantLoading, isMainDomain, navigate]);

  // Loading state - aguarda tenant detection PRIMEIRO
  if (tenantLoading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img 
            src={miauchatLogo} 
            alt="MiauChat" 
            className="w-20 h-20 object-contain animate-pulse" 
          />
        </div>
      </div>
    );
  }

  // Se é um subdomínio (tenant)
  if (!isMainDomain && subdomain) {
    // Timeout atingido - mostra erro amigável
    if (authTimedOut) {
      return (
        <div className="dark flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
            <img 
              src={miauchatLogo} 
              alt="MiauChat" 
              className="w-20 h-20 object-contain opacity-80" 
            />
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Problema de Conexão</h1>
            </div>
            <p className="text-muted-foreground">
              Não foi possível verificar sua sessão. Isso pode acontecer por instabilidade na conexão ou problemas temporários no servidor.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <Button 
                onClick={() => window.location.reload()}
                className="w-full gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar Novamente
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate("/auth", { replace: true })}
                className="w-full"
              >
                Ir para Login
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60">
              Se o problema persistir, entre em contato com o suporte.
            </p>
          </div>
        </div>
      );
    }

    // Aguarda auth resolver antes de mostrar loading de redirect
    if (authLoading) {
      return (
        <div className="dark flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <img 
              src={miauchatLogo} 
              alt="MiauChat" 
              className="w-20 h-20 object-contain animate-pulse" 
            />
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </div>
      );
    }
    
    // Auth resolveu, mostra loading de redirect
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img 
            src={miauchatLogo} 
            alt="MiauChat" 
            className="w-20 h-20 object-contain animate-pulse" 
          />
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  // Se tenant não foi encontrado em um subdomínio
  if (tenantError && !isMainDomain) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
          <img 
            src={miauchatLogo} 
            alt="MiauChat" 
            className="w-20 h-20 object-contain opacity-80" 
          />
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Empresa não encontrada</h1>
          </div>
          <p className="text-muted-foreground">{tenantError}</p>
          <Button 
            variant="outline"
            onClick={() => window.location.href = "https://www.miauchat.com.br"}
          >
            Ir para o site principal
          </Button>
        </div>
      </div>
    );
  }

  // Loading auth no domínio principal
  if (authLoading && isMainDomain) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img 
            src={miauchatLogo} 
            alt="MiauChat" 
            className="w-20 h-20 object-contain animate-pulse" 
          />
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // Domínio principal - mostra landing page
  return <LandingPage />;
};

export default Index;
