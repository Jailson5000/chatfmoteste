import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Zap, Monitor, Smartphone, Tablet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import miauchatLogo from "@/assets/miauchat-logo.png";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Background gradient glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[150px] rounded-full pointer-events-none" />
      
      {/* Header */}
      <header className="relative z-10 w-full border-b border-white/10">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={miauchatLogo} alt="MiauChat" className="h-9 w-9 rounded-lg" />
            <span className="font-bold text-lg text-primary tracking-tight">MIAUChat</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild className="text-white/80 hover:text-white hover:bg-white/10">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link to="/auth?tab=signup">
                Começar agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <Badge 
            variant="outline" 
            className="mb-10 px-4 py-2 text-sm border-primary/50 bg-primary/10 text-primary"
          >
            <Zap className="mr-2 h-4 w-4" />
            Multiplataforma de Inteligência Artificial Unificada
          </Badge>

          {/* Icon with devices */}
          <div className="flex items-center justify-center mb-10">
            <div className="relative">
              {/* Cat logo center */}
              <div className="w-24 h-24 rounded-2xl border-2 border-primary/60 flex items-center justify-center bg-[#0a0a0a]">
                <img src={miauchatLogo} alt="MiauChat" className="h-16 w-16 rounded-lg" />
              </div>
              {/* Monitor left */}
              <div className="absolute -left-12 top-1/2 -translate-y-1/2">
                <Monitor className="h-8 w-8 text-primary/70" strokeWidth={1.5} />
              </div>
              {/* Tablet right */}
              <div className="absolute -right-10 top-1/2 -translate-y-1/2">
                <Tablet className="h-7 w-7 text-primary/70" strokeWidth={1.5} />
              </div>
              {/* Phone bottom */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-8">
                <Smartphone className="h-6 w-6 text-primary/70" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-5xl md:text-7xl font-bold italic text-primary tracking-wide mb-6" style={{ fontFamily: "'Righteous', sans-serif" }}>
            MIAUCHAT
          </h1>

          {/* Subtitle */}
          <h2 className="text-xl md:text-2xl font-medium text-white/90 mb-4">
            Multiplataforma de Inteligência Artificial Unificada
          </h2>

          {/* Description */}
          <p className="text-base md:text-lg text-white/60 max-w-xl mx-auto mb-10">
            Plataforma de comunicação que centraliza todos os seus canais, automatiza 
            conversas e aumenta a produtividade da sua equipe.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button 
              size="lg" 
              asChild 
              className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-base"
            >
              <Link to="/auth">
                Login Cliente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              asChild 
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 px-8 py-6 text-base"
            >
              <a href="#demo">
                Ver demonstração
              </a>
            </Button>
          </div>

          {/* Trust badges */}
          <p className="text-sm text-white/40">
            Sem cartão de crédito • Cancele quando quiser
          </p>
        </div>
      </section>
    </div>
  );
};

export default Index;
