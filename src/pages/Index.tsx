import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { LandingPage } from "@/pages/landing/LandingPage";
import miauchatLogo from "@/assets/miauchat-logo.png";

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { isMainDomain, isLoading: tenantLoading, subdomain, error: tenantError } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "MiauChat | Multiplataforma de Inteligência Artificial Unificada";
  }, []);

  // PRIORITY 1: Tenant subdomain redirect (before auth check)
  // Se é um subdomínio de tenant, redireciona IMEDIATAMENTE para /auth ou dashboard
  useEffect(() => {
    if (tenantLoading) return;
    
    // É um subdomínio de tenant (não main domain)
    if (!isMainDomain && subdomain) {
      // Aguarda apenas o auth loading inicial finalizar
      if (authLoading) return;
      
      // Se usuário já está logado, vai pro dashboard
      if (user) {
        navigate("/dashboard", { replace: true });
      } else {
        // Se não está logado, vai pro login
        navigate("/auth", { replace: true });
      }
    }
  }, [tenantLoading, authLoading, isMainDomain, subdomain, user, navigate]);

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

  // Se é um subdomínio (tenant), mostra loading até auth resolver
  if (!isMainDomain && subdomain) {
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
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <img 
            src={miauchatLogo} 
            alt="MiauChat" 
            className="w-20 h-20 object-contain" 
          />
          <h1 className="text-2xl font-bold text-foreground">Empresa não encontrada</h1>
          <p className="text-muted-foreground">{tenantError}</p>
          <a 
            href="https://www.miauchat.com.br" 
            className="text-primary hover:underline"
          >
            Ir para o site principal
          </a>
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
