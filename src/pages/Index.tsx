import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowRight, 
  MessageCircle,
  Bot,
  Zap,
  Shield,
  BarChart3,
  Users,
  ChevronRight,
  Play,
  Star,
  Sparkles
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
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  const features = [
    {
      icon: MessageCircle,
      title: "Conversas Inteligentes",
      description: "IA que entende contexto e responde naturalmente"
    },
    {
      icon: Bot,
      title: "Automação Total",
      description: "Fluxos automatizados que funcionam 24/7"
    },
    {
      icon: Zap,
      title: "Respostas Instantâneas",
      description: "Velocidade que seus clientes merecem"
    },
    {
      icon: Shield,
      title: "100% Seguro",
      description: "Criptografia end-to-end em todas conversas"
    },
    {
      icon: BarChart3,
      title: "Analytics Avançado",
      description: "Insights em tempo real do seu atendimento"
    },
    {
      icon: Users,
      title: "Multi-Equipe",
      description: "Gerencie times com permissões granulares"
    }
  ];

  const testimonials = [
    {
      name: "Ana Silva",
      role: "CEO, TechStart",
      content: "Reduzimos 70% do tempo de resposta ao cliente.",
      avatar: "AS"
    },
    {
      name: "Carlos Mendes",
      role: "Diretor, Vendas Pro",
      content: "A automação do MiauChat transformou nosso suporte.",
      avatar: "CM"
    },
    {
      name: "Lucia Santos",
      role: "Head de CS, FinBank",
      content: "ROI de 300% em apenas 3 meses de uso.",
      avatar: "LS"
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[200px] animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-red-800/10 rounded-full blur-[180px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-4 mt-4">
          <div className="max-w-7xl mx-auto bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 px-6 py-3">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3">
                <img src={miauchatLogo} alt="MiauChat" className="h-10 w-10" />
                <span className="text-xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                  MiauChat
                </span>
              </Link>
              
              <nav className="hidden md:flex items-center gap-8">
                <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">Recursos</a>
                <a href="#testimonials" className="text-sm text-white/60 hover:text-white transition-colors">Depoimentos</a>
                <a href="#pricing" className="text-sm text-white/60 hover:text-white transition-colors">Planos</a>
              </nav>
              
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  asChild 
                  className="text-white/70 hover:text-white hover:bg-white/10"
                >
                  <Link to="/auth">Entrar</Link>
                </Button>
                <Button 
                  asChild 
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl px-6"
                >
                  <Link to="/auth?tab=signup">
                    Começar grátis
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-32 pb-20">
        <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4" />
            <span>Novo: Integração com IA Generativa</span>
            <ChevronRight className="h-4 w-4" />
          </div>

          {/* Logo floating */}
          <div className="relative w-32 h-32 mx-auto mb-10">
            <div className="absolute inset-0 bg-red-500/20 rounded-3xl blur-2xl animate-pulse" />
            <div className="relative w-full h-full rounded-3xl bg-gradient-to-br from-red-500/20 to-red-900/20 border border-red-500/30 flex items-center justify-center backdrop-blur-sm">
              <img src={miauchatLogo} alt="MiauChat" className="h-20 w-20" />
            </div>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight">
            <span className="text-white">Atendimento que</span>
            <br />
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
              encanta clientes
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed">
            Unifique WhatsApp, automatize conversas com IA e 
            <span className="text-white/80"> multiplique suas vendas</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button 
              size="lg"
              asChild 
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-10 h-14 text-lg font-semibold rounded-2xl shadow-lg shadow-red-500/25"
            >
              <Link to="/auth?tab=signup">
                Começar agora — é grátis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button 
              size="lg"
              variant="outline" 
              className="border-white/20 bg-white/5 hover:bg-white/10 text-white px-8 h-14 text-lg rounded-2xl group"
            >
              <Play className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
              Ver demo
            </Button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {[
              { value: "10k+", label: "Empresas ativas" },
              { value: "50M+", label: "Mensagens/mês" },
              { value: "99.9%", label: "Uptime" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-white/40">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="text-red-500 font-medium text-sm uppercase tracking-widest mb-4 block">Recursos</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Tudo que você precisa
            </h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">
              Ferramentas poderosas para escalar seu atendimento
            </p>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="group bg-white/[0.02] border-white/5 hover:border-red-500/30 hover:bg-white/[0.04] transition-all duration-500 rounded-2xl overflow-hidden"
              >
                <CardContent className="p-8">
                  <div className="mb-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-900/10 border border-red-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                    <feature.icon className="h-7 w-7 text-red-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                  <p className="text-white/50 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-32 bg-gradient-to-b from-transparent via-red-950/10 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="text-red-500 font-medium text-sm uppercase tracking-widest mb-4 block">Depoimentos</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Amado por milhares
            </h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">
              Veja o que nossos clientes dizem
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <Card 
                key={index} 
                className="bg-white/[0.02] border-white/5 rounded-2xl"
              >
                <CardContent className="p-8">
                  <div className="flex gap-1 mb-6">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-red-500 text-red-500" />
                    ))}
                  </div>
                  <p className="text-lg text-white/80 mb-8 leading-relaxed">"{testimonial.content}"</p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{testimonial.name}</div>
                      <div className="text-sm text-white/40">{testimonial.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="text-red-500 font-medium text-sm uppercase tracking-widest mb-4 block">Preços</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Simples e transparente
            </h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">
              Sem surpresas. Cancele quando quiser.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Starter */}
            <Card className="bg-white/[0.02] border-white/10 rounded-3xl overflow-hidden">
              <CardContent className="p-10">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">Starter</h3>
                  <p className="text-white/50">Para pequenas equipes</p>
                </div>
                <div className="mb-8">
                  <span className="text-5xl font-bold text-white">R$97</span>
                  <span className="text-white/40">/mês</span>
                </div>
                <ul className="space-y-4 mb-10">
                  {["1 conexão WhatsApp", "3 usuários", "1.000 msgs/mês", "Suporte email"].map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/70">
                      <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                        <ChevronRight className="h-3 w-3 text-white" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full h-14 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-lg"
                  asChild
                >
                  <Link to="/auth?tab=signup">Começar</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Pro */}
            <Card className="bg-gradient-to-br from-red-500/20 to-red-900/20 border-red-500/30 rounded-3xl overflow-hidden relative">
              <div className="absolute top-6 right-6 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                Popular
              </div>
              <CardContent className="p-10">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">Professional</h3>
                  <p className="text-white/60">Para empresas em crescimento</p>
                </div>
                <div className="mb-8">
                  <span className="text-5xl font-bold text-white">R$297</span>
                  <span className="text-white/40">/mês</span>
                </div>
                <ul className="space-y-4 mb-10">
                  {["5 conexões WhatsApp", "15 usuários", "Mensagens ilimitadas", "Automação IA", "Suporte prioritário"].map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/80">
                      <div className="w-5 h-5 rounded-full bg-red-500/30 flex items-center justify-center">
                        <ChevronRight className="h-3 w-3 text-red-400" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full h-14 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-2xl text-lg font-semibold shadow-lg shadow-red-500/25"
                  asChild
                >
                  <Link to="/auth?tab=signup">Começar agora</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-red-950/20 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="w-20 h-20 mx-auto mb-10 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-900/20 border border-red-500/30 flex items-center justify-center">
            <img src={miauchatLogo} alt="MiauChat" className="h-12 w-12" />
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Pronto para começar?
          </h2>
          <p className="text-xl text-white/50 mb-10 max-w-xl mx-auto">
            Junte-se a milhares de empresas que já transformaram seu atendimento
          </p>
          <Button 
            size="lg"
            asChild 
            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-12 h-16 text-lg font-semibold rounded-2xl shadow-xl shadow-red-500/30"
          >
            <Link to="/auth?tab=signup">
              Criar conta grátis
              <ArrowRight className="ml-3 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={miauchatLogo} alt="MiauChat" className="h-8 w-8" />
            <span className="font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
              MiauChat
            </span>
          </div>
          <p className="text-sm text-white/30">
            © {new Date().getFullYear()} MiauChat. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
