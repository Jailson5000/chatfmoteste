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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0a0a0a]/60">
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
      <section className="relative overflow-hidden">
        {/* Background gradient glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[150px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 py-20">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
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
        </div>
      </section>

      {/* Features Section */}
      <section id="recursos" className="py-20 md:py-28">
        <div className="container">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold italic text-white mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Recursos poderosos para escalar seu atendimento e encantar seus clientes.
            </p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-[#141414] border-white/10 hover:border-primary/30 transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="mb-4 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-white/60 text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planos" className="py-20 md:py-28">
        <div className="container">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold italic text-white mb-4">
              Planos para todos os tamanhos
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Escolha o plano ideal para o seu negócio e comece a transformar seu atendimento.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`relative bg-[#141414] border transition-all duration-300 ${
                  plan.highlighted 
                    ? 'border-primary shadow-lg shadow-primary/20' 
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4">
                    Mais popular
                  </Badge>
                )}
                <CardContent className="p-6">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-semibold text-white mb-4">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl text-white/80">R$</span>
                      <span className="text-5xl font-bold text-white">{plan.price}</span>
                      <span className="text-white/60">/mês</span>
                    </div>
                  </div>
                  
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-white/80">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full ${
                      plan.highlighted 
                        ? 'bg-primary hover:bg-primary/90 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
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
      <section className="py-20 md:py-28 relative overflow-hidden">
        {/* Background gradient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-primary/15 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="container relative z-10">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold italic text-white mb-6">
              Pronto para revolucionar seu atendimento?
            </h2>
            <p className="text-white/60 text-lg mb-10">
              Junte-se a milhares de empresas que já transformaram seu atendimento com o MIAUChat.
            </p>
            <Button 
              size="lg" 
              asChild 
              className="bg-primary hover:bg-primary/90 text-white px-10 py-6 text-base"
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
      <footer className="border-t border-white/10 py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={miauchatLogo} alt="MiauChat" className="h-8 w-8 rounded-lg" />
            <span className="font-semibold text-white">MIAUChat</span>
          </div>
          <p className="text-sm text-white/40">
            © {new Date().getFullYear()} MIAUChat. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
