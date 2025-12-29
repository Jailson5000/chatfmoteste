import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowRight, 
  Zap, 
  Monitor, 
  Smartphone, 
  Tablet,
  MessageSquare,
  Bot,
  Shield,
  BarChart3,
  Users,
  Phone,
  CheckCircle2
} from "lucide-react";
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

  const features = [
    {
      icon: MessageSquare,
      title: "Multi-Atendimento",
      description: "Gerencie múltiplas conversas simultâneas com facilidade e eficiência."
    },
    {
      icon: Zap,
      title: "Automação Inteligente",
      description: "Automatize respostas e fluxos de atendimento com integração N8N."
    },
    {
      icon: Shield,
      title: "Segurança Total",
      description: "Seus dados protegidos com criptografia de ponta a ponta."
    },
    {
      icon: BarChart3,
      title: "Relatórios Detalhados",
      description: "Acompanhe métricas e performance do seu atendimento em tempo real."
    },
    {
      icon: Users,
      title: "Gestão de Equipes",
      description: "Organize sua equipe com diferentes níveis de acesso e permissões."
    },
    {
      icon: Phone,
      title: "WhatsApp Oficial",
      description: "Integração completa com a API oficial do WhatsApp Business."
    }
  ];

  const plans = [
    {
      name: "Starter",
      price: "97",
      features: [
        "1 Conexão WhatsApp",
        "2 Usuários",
        "Suporte por email",
        "Relatórios básicos"
      ],
      highlighted: false
    },
    {
      name: "Professional",
      price: "197",
      features: [
        "5 Conexões WhatsApp",
        "10 Usuários",
        "Suporte prioritário",
        "Automação avançada",
        "Relatórios completos"
      ],
      highlighted: true
    },
    {
      name: "Enterprise",
      price: "397",
      features: [
        "Conexões ilimitadas",
        "Usuários ilimitados",
        "Suporte 24/7",
        "API completa",
        "Customizações"
      ],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0d0d0d]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0d0d0d]/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={miauchatLogo} alt="MiauChat" className="h-8 w-8" />
            <span className="text-primary text-lg font-medium tracking-tight">MIAUChat</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="text-white/70 hover:text-white hover:bg-transparent font-normal text-sm">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90 text-sm font-medium px-4 h-9 rounded-md">
              <Link to="/auth?tab=signup">
                Começar agora
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#8B0000]/30 blur-[180px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 py-16">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
            {/* Badge */}
            <Badge 
              variant="outline" 
              className="mb-12 px-5 py-2.5 text-sm border-primary/40 bg-primary/10 text-primary rounded-full font-normal"
            >
              <Zap className="mr-2 h-4 w-4" />
              Multiplataforma de Inteligência Artificial Unificada
            </Badge>

            {/* Icon with devices */}
            <div className="flex items-center justify-center mb-12">
              <div className="relative">
                {/* Cat logo center */}
                <div className="w-28 h-28 rounded-xl border-2 border-primary/50 flex items-center justify-center bg-[#0d0d0d]">
                  <img src={miauchatLogo} alt="MiauChat" className="h-20 w-20" />
                </div>
                {/* Monitor left */}
                <div className="absolute -left-16 top-1/2 -translate-y-1/2">
                  <Monitor className="h-10 w-10 text-primary/60" strokeWidth={1.2} />
                </div>
                {/* Tablet right */}
                <div className="absolute -right-14 top-1/2 -translate-y-1/2">
                  <Tablet className="h-9 w-9 text-primary/60" strokeWidth={1.2} />
                </div>
                {/* Phone bottom */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-12">
                  <Smartphone className="h-8 w-8 text-primary/60" strokeWidth={1.2} />
                </div>
              </div>
            </div>

            {/* Main Title */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl text-primary tracking-widest mb-6 font-bold uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>
              MIAUCHAT
            </h1>

            {/* Subtitle */}
            <h2 className="text-lg md:text-xl text-white/90 mb-4 font-normal tracking-wide">
              Multiplataforma de Inteligência Artificial Unificada
            </h2>

            {/* Description */}
            <p className="text-sm md:text-base text-white/50 max-w-lg mx-auto mb-10 leading-relaxed font-light">
              Plataforma de comunicação que centraliza todos os seus canais, automatiza 
              conversas e aumenta a produtividade da sua equipe.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <Button 
                asChild 
                className="bg-primary hover:bg-primary/90 text-white px-6 h-11 text-sm font-medium rounded-md"
              >
                <Link to="/auth">
                  Login Cliente
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button 
                variant="outline" 
                asChild 
                className="border-white/20 bg-transparent text-white hover:bg-white/5 px-6 h-11 text-sm font-medium rounded-md"
              >
                <a href="#demo">
                  Ver demonstração
                </a>
              </Button>
            </div>

            {/* Trust badges */}
            <p className="text-xs text-white/40 font-light tracking-wide">
              Sem cartão de crédito • Cancele quando quiser
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="recursos" className="py-20 md:py-28 bg-[#0d0d0d]">
        <div className="container">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-white/50 text-base max-w-2xl mx-auto font-light">
              Recursos poderosos para escalar seu atendimento e encantar seus clientes.
            </p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-[#111111] border-white/5 hover:border-primary/20 transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="mb-4 w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base font-medium text-white mb-2">{feature.title}</h3>
                  <p className="text-white/50 text-sm font-light">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planos" className="py-20 md:py-28 bg-[#0a0a0a]">
        <div className="container">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">
              Planos para todos os tamanhos
            </h2>
            <p className="text-white/50 text-base max-w-2xl mx-auto font-light">
              Escolha o plano ideal para o seu negócio e comece a transformar seu atendimento.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`relative bg-[#111111] border transition-all duration-300 ${
                  plan.highlighted 
                    ? 'border-primary shadow-lg shadow-primary/10' 
                    : 'border-white/5 hover:border-white/10'
                }`}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-3 text-xs font-medium">
                    Mais popular
                  </Badge>
                )}
                <CardContent className="p-6">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-medium text-white mb-4">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-xl text-white/70">R$</span>
                      <span className="text-4xl font-semibold text-white">{plan.price}</span>
                      <span className="text-white/50 text-sm">/mês</span>
                    </div>
                  </div>
                  
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-white/70">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-light">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full h-10 text-sm font-medium ${
                      plan.highlighted 
                        ? 'bg-primary hover:bg-primary/90 text-white' 
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                    asChild
                  >
                    <Link to="/auth?tab=signup">
                      Começar agora
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28 relative overflow-hidden bg-[#0d0d0d]">
        {/* Background gradient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[250px] bg-[#8B0000]/20 blur-[140px] rounded-full pointer-events-none" />
        
        <div className="container relative z-10">
          <div className="text-center max-w-2xl mx-auto animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-5">
              Pronto para revolucionar seu atendimento?
            </h2>
            <p className="text-white/50 text-base mb-8 font-light">
              Junte-se a milhares de empresas que já transformaram seu atendimento com o MIAUChat.
            </p>
            <Button 
              asChild 
              className="bg-primary hover:bg-primary/90 text-white px-8 h-11 text-sm font-medium"
            >
              <Link to="/auth?tab=signup">
                Começar gratuitamente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 bg-[#0a0a0a]">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={miauchatLogo} alt="MiauChat" className="h-7 w-7" />
            <span className="font-medium text-white text-sm">MIAUChat</span>
          </div>
          <p className="text-xs text-white/40 font-light">
            © {new Date().getFullYear()} MIAUChat. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
