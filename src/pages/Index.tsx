import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowRight, 
  Sparkles, 
  Monitor, 
  Smartphone, 
  Tablet,
  MessageSquare,
  Zap,
  Shield,
  BarChart3,
  Users,
  Phone,
  Check
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
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c0c]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
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
      features: ["1 Conexão WhatsApp", "2 Usuários", "Suporte por email", "Relatórios básicos"],
      highlighted: false
    },
    {
      name: "Professional",
      price: "197",
      features: ["5 Conexões WhatsApp", "10 Usuários", "Suporte prioritário", "Automação avançada", "Relatórios completos"],
      highlighted: true
    },
    {
      name: "Enterprise",
      price: "397",
      features: ["Conexões ilimitadas", "Usuários ilimitados", "Suporte 24/7", "API completa", "Customizações"],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white font-[Poppins]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0c0c0c]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={miauchatLogo} alt="MiauChat" className="h-8 w-8" />
            <span className="text-red-500 font-medium text-lg">MIAUChat</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link 
              to="/auth" 
              className="text-white/70 hover:text-white text-sm transition-colors"
            >
              Entrar
            </Link>
            <Button 
              asChild 
              className="bg-red-600 hover:bg-red-700 text-white text-sm px-5 h-9 rounded-lg"
            >
              <Link to="/auth?tab=signup">
                Começar agora
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        {/* Background glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-red-900/20 blur-[200px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-sm mb-14">
            <Sparkles className="h-4 w-4" />
            <span>Multiplataforma de Inteligência Artificial Unificada</span>
          </div>

          {/* Logo with devices */}
          <div className="flex items-center justify-center mb-14">
            <div className="relative">
              {/* Main logo */}
              <div className="w-24 h-24 rounded-2xl border-2 border-red-500/40 bg-[#0c0c0c] flex items-center justify-center">
                <img src={miauchatLogo} alt="MiauChat" className="h-16 w-16" />
              </div>
              
              {/* Monitor - left */}
              <Monitor 
                className="absolute -left-14 top-1/2 -translate-y-1/2 h-8 w-8 text-red-500/50" 
                strokeWidth={1.5} 
              />
              
              {/* Tablet - right */}
              <Tablet 
                className="absolute -right-12 top-1/2 -translate-y-1/2 h-7 w-7 text-red-500/50" 
                strokeWidth={1.5} 
              />
              
              {/* Phone - bottom */}
              <Smartphone 
                className="absolute left-1/2 -translate-x-1/2 -bottom-10 h-6 w-6 text-red-500/50" 
                strokeWidth={1.5} 
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-red-500 tracking-wide mb-5">
            MIAUCHAT
          </h1>

          {/* Subtitle */}
          <h2 className="text-xl md:text-2xl text-white/90 font-normal mb-4">
            Multiplataforma de Inteligência Artificial Unificada
          </h2>

          {/* Description */}
          <p className="text-base text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
            Plataforma de comunicação que centraliza todos os seus canais, automatiza 
            conversas e aumenta a produtividade da sua equipe.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <Button 
              asChild 
              className="bg-red-600 hover:bg-red-700 text-white px-7 h-12 text-sm font-medium rounded-lg"
            >
              <Link to="/auth">
                Login Cliente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button 
              variant="outline" 
              asChild 
              className="border-white/20 bg-transparent hover:bg-white/5 text-white px-7 h-12 text-sm font-medium rounded-lg"
            >
              <a href="#demo">Ver demonstração</a>
            </Button>
          </div>

          {/* Trust text */}
          <p className="text-sm text-white/40">
            Sem cartão de crédito • Cancele quando quiser
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="recursos" className="py-24 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Recursos poderosos para escalar seu atendimento e encantar seus clientes.
            </p>
          </div>
          
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-[#111] border-white/5 hover:border-red-500/20 transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="mb-4 w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <feature.icon className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">{feature.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planos" className="py-24 bg-[#0c0c0c]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">
              Planos para todos os tamanhos
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Escolha o plano ideal para o seu negócio e comece a transformar seu atendimento.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`relative bg-[#111] border transition-all duration-300 ${
                  plan.highlighted 
                    ? 'border-red-500 shadow-xl shadow-red-500/10' 
                    : 'border-white/5 hover:border-white/10'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-600 text-white text-xs font-medium rounded-full">
                    Mais popular
                  </div>
                )}
                <CardContent className="p-7">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-medium text-white mb-4">{plan.name}</h3>
                    <div className="flex items-baseline justify-center">
                      <span className="text-xl text-white/60">R$</span>
                      <span className="text-5xl font-bold text-white mx-1">{plan.price}</span>
                      <span className="text-white/50">/mês</span>
                    </div>
                  </div>
                  
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-white/70">
                        <Check className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full h-11 text-sm font-medium rounded-lg ${
                      plan.highlighted 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                    asChild
                  >
                    <Link to="/auth?tab=signup">Começar agora</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden bg-[#0a0a0a]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-red-900/15 blur-[180px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-5">
            Pronto para revolucionar seu atendimento?
          </h2>
          <p className="text-white/50 text-lg mb-10">
            Junte-se a milhares de empresas que já transformaram seu atendimento com o MIAUChat.
          </p>
          <Button 
            asChild 
            className="bg-red-600 hover:bg-red-700 text-white px-8 h-12 text-sm font-medium rounded-lg"
          >
            <Link to="/auth?tab=signup">
              Começar gratuitamente
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={miauchatLogo} alt="MiauChat" className="h-7 w-7" />
            <span className="text-red-500 font-medium">MIAUChat</span>
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
