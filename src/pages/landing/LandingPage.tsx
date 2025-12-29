import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bot,
  Zap,
  Shield,
  BarChart3,
  Users,
  MessageCircle,
  Check,
} from "lucide-react";
import miauchatLogo from "@/assets/miauchat-logo.png";

export function LandingPage() {
  const features = [
    { icon: MessageCircle, title: "Multi-atendimento", desc: "Milhares de conversas simultâneas" },
    { icon: Bot, title: "IA Integrada", desc: "Automação inteligente 24/7" },
    { icon: Zap, title: "Velocidade", desc: "Respostas em milissegundos" },
    { icon: Shield, title: "Segurança", desc: "Criptografia end-to-end" },
    { icon: BarChart3, title: "Analytics", desc: "Métricas em tempo real" },
    { icon: Users, title: "Equipes", desc: "Gestão de permissões" },
  ];

  const plans = [
    { name: "Starter", price: "149", items: ["2 usuários", "1 WhatsApp", "5k msgs/mês"] },
    { name: "Pro", price: "349", items: ["10 usuários", "5 WhatsApp", "Ilimitado", "IA avançada"], popular: true },
    { name: "Enterprise", price: "Custom", items: ["Ilimitado", "API completa", "SLA dedicado"] },
  ];

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-red-500/30">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
        {/* Red glow top */}
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-red-600/20 rounded-full blur-[180px]" />
        {/* Red glow bottom */}
        <div className="absolute bottom-[-300px] right-[-200px] w-[600px] h-[600px] bg-red-900/15 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-50 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-xl blur-xl group-hover:bg-red-500/30 transition-all" />
              <img src={miauchatLogo} alt="MiauChat" className="relative h-11 w-11" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-red-500">MIAU</span> CHAT
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link to="/auth" className="text-sm text-white/50 hover:text-white transition-colors">
              Entrar
            </Link>
            <Button asChild className="bg-red-600 hover:bg-red-500 text-white h-10 px-6 rounded-xl">
              <Link to="/auth?tab=signup">
                Começar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 min-h-[90vh] flex items-center justify-center">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 bg-red-500/10 mb-8">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-400">Multiplataforma de Inteligência Artificial Unificada</span>
          </div>

          {/* Logo */}
          <div className="mb-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-red-500/20 rounded-3xl blur-2xl" />
              <img src={miauchatLogo} alt="MiauChat" className="relative h-24 w-24 md:h-32 md:w-32" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl font-black leading-[0.9] tracking-tight">
            <span className="text-red-500">MIAU</span> CHAT
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base md:text-lg text-white/50 font-normal tracking-wide">
            Multiplataforma de Inteligência Artificial Unificada
          </p>
          <p className="mt-4 text-lg md:text-xl text-white/40 max-w-2xl mx-auto leading-relaxed font-normal">
            Plataforma de comunicação que centraliza canais, automatiza conversas e multiplica a produtividade da sua equipe.
          </p>

          {/* CTAs */}
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="bg-red-600 hover:bg-red-500 text-white h-14 px-10 rounded-2xl text-base font-semibold shadow-lg shadow-red-600/25">
              <Link to="/auth?tab=signup">
                Começar agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-14 px-10 rounded-2xl text-base">
              <a href="#planos">Ver planos</a>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 flex flex-wrap justify-center gap-12">
            {[
              { value: "10k+", label: "Empresas" },
              { value: "50M", label: "Mensagens/mês" },
              { value: "99.9%", label: "Uptime" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-white/30 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-red-500 text-sm font-medium tracking-widest uppercase mb-4">Recursos</p>
            <h2 className="text-4xl md:text-5xl font-bold">Tudo que você precisa</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div 
                key={i} 
                className="group p-8 rounded-3xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-red-500/20 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <f.icon className="h-7 w-7 text-red-500" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-white/40">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="relative z-10 py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-red-500 text-sm font-medium tracking-widest uppercase mb-4">Planos</p>
            <h2 className="text-4xl md:text-5xl font-bold">Preços transparentes</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div 
                key={plan.name}
                className={`relative p-8 rounded-3xl border transition-all duration-300 ${
                  plan.popular 
                    ? 'border-red-500/40 bg-gradient-to-b from-red-500/10 to-transparent shadow-xl shadow-red-500/5' 
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-600 text-xs font-bold rounded-full uppercase tracking-wider">
                    Popular
                  </div>
                )}
                <p className="text-lg font-semibold">{plan.name}</p>
                <div className="mt-4 mb-6">
                  {plan.price === "Custom" ? (
                    <span className="text-4xl font-bold">Sob consulta</span>
                  ) : (
                    <>
                      <span className="text-white/40">R$</span>
                      <span className="text-5xl font-bold">{plan.price}</span>
                      <span className="text-white/40">/mês</span>
                    </>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-white/60">
                      <Check className="h-4 w-4 text-red-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button 
                  asChild
                  className={`w-full h-12 rounded-xl font-medium ${
                    plan.popular 
                      ? 'bg-red-600 hover:bg-red-500 text-white' 
                      : 'bg-white/5 hover:bg-white/10 text-white'
                  }`}
                >
                  <Link to="/auth?tab=signup">Começar</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative inline-block mb-10">
            <div className="absolute inset-0 bg-red-500/20 rounded-3xl blur-2xl" />
            <img src={miauchatLogo} alt="" className="relative h-20 w-20" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Pronto para começar?
          </h2>
          <p className="text-xl text-white/40 mb-10">
            Junte-se a milhares de empresas que já transformaram seu atendimento.
          </p>
          <Button asChild size="lg" className="bg-red-600 hover:bg-red-500 text-white h-16 px-14 rounded-2xl text-lg font-semibold shadow-xl shadow-red-600/20">
            <Link to="/auth?tab=signup">
              Criar conta
              <ArrowRight className="ml-3 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={miauchatLogo} alt="" className="h-8 w-8 opacity-60" />
            <span className="text-white/40">MIAU CHAT</span>
          </div>
          <p className="text-sm text-white/30">
            © {new Date().getFullYear()} MiauChat. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
