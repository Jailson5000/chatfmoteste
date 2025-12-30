import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { LandingPage } from "@/pages/landing/LandingPage";
import miauchatLogo from "@/assets/miauchat-logo.png";

const Index = () => {
  const { user, loading } = useAuth();
  const { isMainDomain, isLoading: tenantLoading, subdomain, error: tenantError } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    // Basic page title hygiene when navigating back from other pages
    const previousTitle = document.title;
    document.title = "MiauChat | Multiplataforma de Inteligência Artificial Unificada";

    return () => {
      document.title = previousTitle || "MiauChat";
    };
  }, []);

  useEffect(() => {
    // Se o usuário está logado, redireciona para o dashboard
    if (user) {
      navigate("/dashboard");
      return;
    }

    // Se é um subdomínio de tenant (não é domínio principal),
    // redireciona para a página de login em vez de mostrar a landing
    if (!tenantLoading && !isMainDomain && subdomain) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate, tenantLoading, isMainDomain, subdomain]);

  // Loading state - aguarda tanto auth quanto tenant detection
  if (loading || tenantLoading) {
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

  // Se é um subdomínio (tenant), não mostra landing page
  // O useEffect acima já redirecionou, mas este é um fallback
  if (!isMainDomain && subdomain) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img 
            src={miauchatLogo} 
            alt="MiauChat" 
            className="w-20 h-20 object-contain animate-pulse" 
          />
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

  // Domínio principal - mostra landing page
  return <LandingPage />;
};

export default Index;
