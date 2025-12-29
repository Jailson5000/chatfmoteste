import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight,
  MessagesSquare,
  Workflow,
  LineChart,
  Lock,
  Headphones,
  Layers,
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
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white antialiased">
      {/* Subtle grid background */}
      <div 
        className="fixed inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='white'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`
        }}
      />

      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-lg border-b border-white/5">
        <div className="max-w-6xl mx-auto px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={miauchatLogo} alt="MiauChat" className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">
              <span className="text-red-500">Miau</span>Chat
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-10">
            <a href="#recursos" className="text-[13px] text-white/50 hover:text-white transition-colors tracking-wide">
              Recursos
            </a>
            <a href="#planos" className="text-[13px] text-white/50 hover:text-white transition-colors tracking-wide">
              Planos
            </a>
          </nav>
          
          <div className="flex items-center gap-6">
            <Link 
              to="/auth" 
              className="text-[13px] text-white/60 hover:text-white transition-colors tracking-wide"
            >
              Entrar
            </Link>
            <Button 
              asChild 
              size="sm"
              className="bg-red-600 hover:bg-red-500 text-white text-[13px] h-9 px-5 rounded-lg"
            >
              <Link to="/auth?tab=signup">Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center pt-20 relative overflow-hidden">
        {/* Red glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-red-600/8 blur-[150px] rounded-full" />
        
        <div className="relative z-10 max-w-4xl mx-auto px-8 py-32 text-center">
          {/* Logo */}
          <div className="mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-[28px] bg-gradient-to-b from-white/10 to-white/5 border border-white/10 shadow-2xl">
              <img src={miauchatLogo} alt="MiauChat" className="h-14 w-14" />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(2.5rem,8vw,5rem)] font-semibold leading-[1.1] tracking-tight mb-8">
            Atendimento com
            <br />
            <span className="text-red-500">inteligência artificial</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-white/40 max-w-lg mx-auto mb-14 leading-relaxed font-light">
            Centralize conversas, automatize respostas e escale seu suporte sem aumentar a equipe.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              asChild 
              size="lg"
              className="bg-red-600 hover:bg-red-500 text-white h-14 px-10 text-[15px] font-medium rounded-xl shadow-lg shadow-red-600/20"
            >
              <Link to="/auth?tab=signup">
                Começar gratuitamente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button 
              asChild
              size="lg"
              variant="ghost"
              className="text-white/60 hover:text-white hover:bg-white/5 h-14 px-8 text-[15px] rounded-xl"
            >
              <Link to="/auth">Fazer login</Link>
            </Button>
          </div>

          {/* Trust */}
          <p className="mt-12 text-[13px] text-white/30 tracking-wide">
            Teste grátis por 14 dias · Sem cartão de crédito
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="py-32">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-20">
            <p className="text-red-500 text-sm font-medium tracking-widest uppercase mb-4">
              Recursos
            </p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Tudo em um só lugar
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-1">
            {[
              { icon: MessagesSquare, title: "Multi-atendimento", desc: "Gerencie milhares de conversas simultâneas" },
              { icon: Workflow, title: "Automação com IA", desc: "Respostas inteligentes 24 horas por dia" },
              { icon: LineChart, title: "Analytics", desc: "Métricas detalhadas em tempo real" },
              { icon: Lock, title: "Segurança", desc: "Criptografia de ponta a ponta" },
              { icon: Headphones, title: "Suporte humano", desc: "Transferência seamless para atendentes" },
              { icon: Layers, title: "Integrações", desc: "Conecte com suas ferramentas favoritas" },
            ].map((feature, i) => (
              <div 
                key={i}
                className="group p-10 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all duration-300"
              >
                <feature.icon className="h-6 w-6 text-red-500 mb-6" strokeWidth={1.5} />
                <h3 className="text-lg font-medium mb-2 tracking-tight">{feature.title}</h3>
                <p className="text-[15px] text-white/40 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="py-32">
        <div className="max-w-4xl mx-auto px-8">
          <div className="text-center mb-20">
            <p className="text-red-500 text-sm font-medium tracking-widest uppercase mb-4">
              Planos
            </p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Preços simples
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Basic */}
            <div className="p-10 rounded-3xl bg-white/[0.02] border border-white/5">
              <p className="text-sm text-white/50 mb-2">Básico</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-semibold">R$149</span>
                <span className="text-white/40">/mês</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["2 usuários", "1 conexão WhatsApp", "5.000 mensagens/mês", "Suporte por email"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[15px] text-white/60">
                    <Check className="h-4 w-4 text-red-500" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button 
                asChild
                className="w-full h-12 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[15px]"
              >
                <Link to="/auth?tab=signup">Começar</Link>
              </Button>
            </div>

            {/* Pro */}
            <div className="p-10 rounded-3xl bg-gradient-to-b from-red-600/10 to-red-900/5 border border-red-500/20 relative overflow-hidden">
              <div className="absolute top-6 right-6 px-3 py-1 bg-red-600 text-[11px] font-medium rounded-full uppercase tracking-wider">
                Popular
              </div>
              <p className="text-sm text-white/50 mb-2">Profissional</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-semibold">R$349</span>
                <span className="text-white/40">/mês</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["10 usuários", "5 conexões WhatsApp", "Mensagens ilimitadas", "Automação com IA", "Suporte prioritário"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[15px] text-white/70">
                    <Check className="h-4 w-4 text-red-500" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button 
                asChild
                className="w-full h-12 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[15px] font-medium"
              >
                <Link to="/auth?tab=signup">Começar</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <img src={miauchatLogo} alt="MiauChat" className="h-16 w-16 mx-auto mb-10 opacity-80" />
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-6">
            Pronto para transformar
            <br />
            seu atendimento?
          </h2>
          <p className="text-white/40 mb-10 text-lg">
            Comece hoje mesmo, sem compromisso.
          </p>
          <Button 
            asChild
            size="lg"
            className="bg-red-600 hover:bg-red-500 text-white h-14 px-12 text-[15px] font-medium rounded-xl"
          >
            <Link to="/auth?tab=signup">
              Criar conta grátis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={miauchatLogo} alt="MiauChat" className="h-6 w-6 opacity-60" />
            <span className="text-sm text-white/40">MiauChat</span>
          </div>
          <p className="text-[13px] text-white/30">
            © {new Date().getFullYear()} MiauChat
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
