import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Bot, 
  Users, 
  Zap, 
  Shield, 
  BarChart3, 
  CheckCircle2, 
  ArrowRight,
  Building2,
  Phone,
  Clock,
  Star,
  Play
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const features = [
    {
      icon: MessageSquare,
      title: "WhatsApp Integrado",
      description: "Conecte múltiplas instâncias do WhatsApp e centralize todas as conversas em um único lugar."
    },
    {
      icon: Bot,
      title: "IA Inteligente",
      description: "Automatize triagens e respostas com inteligência artificial treinada para seu negócio."
    },
    {
      icon: Users,
      title: "CRM Completo",
      description: "Gerencie clientes, casos e oportunidades com Kanban visual e histórico completo."
    },
    {
      icon: Zap,
      title: "Automações N8N",
      description: "Integre com sistemas externos e automatize fluxos de trabalho complexos."
    },
    {
      icon: Shield,
      title: "LGPD Compliance",
      description: "Sistema preparado para conformidade com a Lei Geral de Proteção de Dados."
    },
    {
      icon: BarChart3,
      title: "Analytics Avançado",
      description: "Dashboards e relatórios para acompanhar métricas e performance da equipe."
    }
  ];

  const benefits = [
    "Reduza tempo de resposta em até 80%",
    "Aumente conversões com atendimento 24/7",
    "Centralize todas as comunicações",
    "Escale seu atendimento sem aumentar custos",
    "Relatórios e métricas em tempo real",
    "Suporte técnico especializado"
  ];

  const testimonials = [
    {
      name: "Dr. Ricardo Souza",
      role: "Advogado Tributarista",
      company: "Souza & Associados",
      content: "O MiauChat revolucionou nosso atendimento. Triagem automática de casos e respostas instantâneas aos clientes.",
      rating: 5
    },
    {
      name: "Dra. Mariana Costa",
      role: "Advogada Trabalhista",
      company: "Costa Advocacia",
      content: "Conseguimos atender 3x mais clientes com a mesma equipe. A IA é impressionante na qualificação de leads.",
      rating: 5
    },
    {
      name: "Dr. Fernando Lima",
      role: "Advogado Civil",
      company: "Lima & Parceiros",
      content: "Interface intuitiva e suporte excelente. Recomendo para qualquer escritório que quer crescer.",
      rating: 5
    }
  ];

  const plans = [
    {
      name: "Starter",
      price: "297",
      period: "/mês",
      description: "Para escritórios pequenos",
      features: [
        "1 instância WhatsApp",
        "3 usuários",
        "5.000 mensagens/mês",
        "IA básica",
        "Suporte por email"
      ],
      highlighted: false
    },
    {
      name: "Professional",
      price: "597",
      period: "/mês",
      description: "Para escritórios em crescimento",
      features: [
        "3 instâncias WhatsApp",
        "10 usuários",
        "20.000 mensagens/mês",
        "IA avançada",
        "Suporte prioritário",
        "Integrações N8N"
      ],
      highlighted: true
    },
    {
      name: "Enterprise",
      price: "997",
      period: "/mês",
      description: "Para grandes operações",
      features: [
        "Instâncias ilimitadas",
        "Usuários ilimitados",
        "Mensagens ilimitadas",
        "IA personalizada",
        "Suporte 24/7",
        "API completa",
        "SLA garantido"
      ],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={miauchatLogo} alt="MiauChat" className="h-10 w-10 rounded-lg" />
            <span className="font-bold text-xl tracking-tight">MIAUCHAT</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Recursos
            </a>
            <a href="#benefits" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Benefícios
            </a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Depoimentos
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Planos
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/auth?tab=signup">
                Começar Grátis
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="container relative">
          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="secondary" className="mb-6">
              <Zap className="mr-1 h-3 w-3" />
              Plataforma #1 para Escritórios de Advocacia
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Transforme seu atendimento com{" "}
              <span className="text-primary">Inteligência Artificial</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              Automatize triagens, centralize conversas do WhatsApp e gerencie clientes 
              com uma plataforma completa para escritórios jurídicos.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="text-base">
                <Link to="/auth?tab=signup">
                  Começar Teste Grátis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-base">
                <a href="#demo">
                  <Play className="mr-2 h-4 w-4" />
                  Ver Demonstração
                </a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                14 dias grátis
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Sem cartão de crédito
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Suporte incluído
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y bg-muted/30 py-12">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-4 text-center">
            <div>
              <div className="text-4xl font-bold text-primary">500+</div>
              <div className="text-sm text-muted-foreground mt-1">Escritórios Ativos</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary">2M+</div>
              <div className="text-sm text-muted-foreground mt-1">Mensagens/Mês</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary">98%</div>
              <div className="text-sm text-muted-foreground mt-1">Satisfação</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary">24/7</div>
              <div className="text-sm text-muted-foreground mt-1">Atendimento IA</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-28">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <Badge variant="outline" className="mb-4">Recursos</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Tudo que você precisa em uma plataforma
            </h2>
            <p className="text-muted-foreground text-lg">
              Ferramentas profissionais para modernizar seu escritório e escalar seu atendimento.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-primary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 md:py-28 bg-muted/30">
        <div className="container">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <Badge variant="outline" className="mb-4">Benefícios</Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
                Por que escolher o MiauChat?
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Mais de 500 escritórios já transformaram seu atendimento com nossa plataforma. 
                Veja por que eles escolheram o MiauChat.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-8" asChild>
                <Link to="/auth?tab=signup">
                  Começar Agora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-6">
                <Building2 className="h-8 w-8 text-primary mb-4" />
                <div className="text-3xl font-bold">80%</div>
                <div className="text-sm text-muted-foreground">Redução no tempo de resposta</div>
              </Card>
              <Card className="p-6">
                <Users className="h-8 w-8 text-primary mb-4" />
                <div className="text-3xl font-bold">3x</div>
                <div className="text-sm text-muted-foreground">Mais clientes atendidos</div>
              </Card>
              <Card className="p-6">
                <Phone className="h-8 w-8 text-primary mb-4" />
                <div className="text-3xl font-bold">24/7</div>
                <div className="text-sm text-muted-foreground">Atendimento automatizado</div>
              </Card>
              <Card className="p-6">
                <Clock className="h-8 w-8 text-primary mb-4" />
                <div className="text-3xl font-bold">50%</div>
                <div className="text-sm text-muted-foreground">Economia de tempo</div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 md:py-28">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <Badge variant="outline" className="mb-4">Depoimentos</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              O que nossos clientes dizem
            </h2>
            <p className="text-muted-foreground text-lg">
              Histórias reais de escritórios que transformaram seu atendimento.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="p-6">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-6">"{testimonial.content}"</p>
                <div>
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.company}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 md:py-28 bg-muted/30">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <Badge variant="outline" className="mb-4">Planos</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Escolha o plano ideal para seu escritório
            </h2>
            <p className="text-muted-foreground text-lg">
              Comece com 14 dias grátis. Cancele quando quiser.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`p-6 relative ${plan.highlighted ? 'border-primary border-2 shadow-lg' : ''}`}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Mais Popular
                  </Badge>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-sm">R$</span>
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full" 
                  variant={plan.highlighted ? "default" : "outline"}
                  asChild
                >
                  <Link to="/auth?tab=signup">
                    Começar Teste Grátis
                  </Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
              Pronto para transformar seu escritório?
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Junte-se a mais de 500 escritórios que já automatizaram seu atendimento com o MiauChat.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="text-base">
                <Link to="/auth?tab=signup">
                  Começar Teste Grátis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-base">
                <a href="mailto:contato@miauchat.com.br">
                  Falar com Vendas
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-muted/30">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src={miauchatLogo} alt="MiauChat" className="h-8 w-8 rounded-lg" />
                <span className="font-bold">MIAUCHAT</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Plataforma de atendimento inteligente para escritórios de advocacia.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Recursos</a></li>
                <li><a href="#pricing" className="hover:text-foreground">Planos</a></li>
                <li><a href="#demo" className="hover:text-foreground">Demonstração</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Sobre</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
                <li><a href="#" className="hover:text-foreground">Carreiras</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Privacidade</a></li>
                <li><a href="#" className="hover:text-foreground">Termos de Uso</a></li>
                <li><a href="#" className="hover:text-foreground">LGPD</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} MiauChat. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
