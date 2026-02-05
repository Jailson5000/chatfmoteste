import React, { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  Bot,
  Zap,
  Clock,
  TrendingUp,
  Target,
  Users,
  MessageCircle,
  Check,
  Rocket,
  Brain,
  HeartHandshake,
  Phone,
  HelpCircle,
  Globe,
  Calendar,
  Bell,
  UserCheck,
  CalendarClock,
  Link2,
  Palette,
  PlayCircle,
} from "lucide-react";
import miauchatLogo from "@/assets/miauchat-logo.png";
import { supabase } from "@/integrations/supabase/client";

// Interface for database plans
interface DbPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  max_users: number;
  max_instances: number;
  max_ai_conversations: number;
  max_tts_minutes: number;
  max_agents: number;
  features: string[];
  is_active: boolean;
}

export function LandingPage() {
  const navigate = useNavigate();
  const [dbPlans, setDbPlans] = React.useState<DbPlan[]>([]);

  // Fetch plans from database
  useEffect(() => {
    const fetchPlans = async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });
      
      if (!error && data) {
        setDbPlans(data as DbPlan[]);
      }
    };
    fetchPlans();
  }, []);

  // Carrega o widget MiauChat
  useEffect(() => {
    // Configura o MiauChat
    (window as any).MiauChat = {
      tenant: "dc43d6dd6aaf4691",
      source: "WIDGET"
    };

    // Carrega o script do widget
    const script = document.createElement('script');
    script.src = 'https://widget.miauchat.com.br/widget.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup: remove o script quando o componente desmontar
      const existingScript = document.querySelector('script[src="https://widget.miauchat.com.br/widget.js"]');
      if (existingScript) {
        existingScript.remove();
      }
      // Remove o widget container se existir
      const widgetContainer = document.getElementById('miauchat-widget-container');
      if (widgetContainer) {
        widgetContainer.remove();
      }
    };
  }, []);

  // Format price for display (e.g., 1697 -> "1.697")
  const formatPrice = (price: number): string => {
    const hasDecimals = price % 1 !== 0;
    return price.toLocaleString("pt-BR", { 
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0 
    });
  };

  // Transform database plans into display format
  const plans = useMemo(() => {
    if (dbPlans.length === 0) {
      // Fallback while loading
      return [];
    }

    return dbPlans.map((plan) => {
      const isEnterprise = plan.name.toUpperCase() === "ENTERPRISE";
      const isProfessional = plan.name.toUpperCase() === "PROFESSIONAL";
      const isPrime = plan.name.toUpperCase() === "PRIME";
      
      return {
        name: plan.name.toUpperCase(),
        price: formatPrice(plan.price),
        description: plan.description || "",
        items: plan.features || [],
        cta: isEnterprise 
          ? "Começar agora" 
          : isProfessional 
            ? "Escalar meu atendimento" 
            : "Começar agora",
        popular: isProfessional,
        isEnterprise,
        startingFrom: isEnterprise,
        isPrime,
      };
    });
  }, [dbPlans]);

  // Get professional plan price for CTA buttons
  const professionalPrice = useMemo(() => {
    const prof = dbPlans.find(p => p.name.toUpperCase() === "PROFESSIONAL");
    return prof ? formatPrice(prof.price) : "897";
  }, [dbPlans]);

  const additionalPricing = [
    { item: "Conversa adicional com IA", price: "R$ 0,27 / conversa" },
    { item: "Minuto adicional de áudio", price: "R$ 0,97 / minuto" },
    { item: "WhatsApp adicional", price: "R$ 57,90 / mês" },
    { item: "Atendente adicional", price: "R$ 29,90 / mês" },
    { item: "Agente de IA adicional", price: "R$ 19,00 / mês" },
  ];

  const faqs = [
    {
      question: "O que acontece se eu ultrapassar o limite do meu plano?",
      answer:
        "Nada muda na sua operação. O sistema continua funcionando normalmente e o consumo adicional é cobrado apenas pelo excedente, conforme tabela de preços adicionais.",
    },
    {
      question: "Vou ficar sem atendimento se atingir o limite?",
      answer:
        "Não. A plataforma foi pensada para acompanhar o crescimento do seu negócio sem interrupções.",
    },
    {
      question: "Posso mudar de plano depois?",
      answer:
        "Sim. Você pode fazer upgrade ou downgrade a qualquer momento, conforme a necessidade da sua operação.",
    },
    {
      question: "O plano Enterprise tem limite?",
      answer:
        "O Enterprise funciona com um modelo flexível baseado em consumo, ideal para operações maiores e em crescimento contínuo.",
    },
    {
      question: "O áudio consome muito?",
      answer:
        "O uso de áudio é opcional. Você pode escolher quando utilizar e acompanhar tudo em tempo real para manter o controle.",
    },
    {
      question: "Preciso falar com vendas para contratar?",
      answer:
        "Apenas no plano Enterprise. Os demais planos podem ser contratados diretamente pelo site.",
    },
    {
      question: "A IA substitui meu time?",
      answer:
        "Não. Ela automatiza tarefas repetitivas e melhora a produtividade, permitindo que sua equipe foque no que realmente importa.",
    },
    {
      question: "Preciso de conhecimento técnico para usar?",
      answer:
        "Não! O MiauChat foi desenvolvido para ser simples e intuitivo. Nossa equipe configura o Agente IA para você, e o painel de controle é fácil de usar.",
    },
  ];

  const highlights = [
    { icon: Clock, text: "Atendimento contínuo 24/7" },
    { icon: TrendingUp, text: "Escalável sem aumentar custos fixos" },
    { icon: Zap, text: "Zero filas, zero atrasos" },
  ];

  const handlePlanClick = (planName: string) => {
    navigate(`/register?plan=${encodeURIComponent(planName)}`);
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-red-500/30">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
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
              <img
                src={miauchatLogo}
                alt="MiauChat"
                className="relative h-11 w-11"
              />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-red-500">MIAU</span> CHAT
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Button
              className="bg-red-600 hover:bg-red-500 text-white h-10 px-6 rounded-xl"
              onClick={() => handlePlanClick("PROFESSIONAL")}
            >
              Começar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 min-h-[85vh] flex items-center justify-center">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          {/* Logo com texto institucional */}
          <div className="mb-10">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-red-500/20 rounded-3xl blur-2xl" />
              <img
                src={miauchatLogo}
                alt="MiauChat"
                className="relative h-20 w-20 md:h-24 md:w-24"
              />
            </div>
            {/* Texto institucional */}
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                <span className="text-red-500">MIAU</span>CHAT
              </h2>
              <p className="text-xs md:text-sm text-white/40 font-medium tracking-wide">
                Multiplataforma de Inteligência Artificial Unificada
              </p>
              <p className="text-xs text-white/30">
                Plataforma de Comunicação
              </p>
            </div>
          </div>


          {/* Headline - Reduzida */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
            Amplie sua equipe,
            <br />
            <span className="text-red-500">não os custos</span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-base md:text-lg lg:text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
            Conversas naturais e inteligentes com Agentes de Inteligência
            Artificial que atendem, qualificam e convertem seus clientes 24/7.
          </p>

          {/* Texto de apoio */}
          <p className="mt-4 text-sm md:text-base text-white/40 max-w-2xl mx-auto leading-relaxed">
            Sua Inteligência Artificial é capaz de qualificar leads, agendar
            reuniões, tirar dúvidas e direcionar clientes para o checkout ou
            para o vendedor ideal.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
            <Button
              size="lg"
              className="bg-red-600 hover:bg-red-500 text-white h-12 px-8 rounded-xl text-sm font-semibold shadow-lg shadow-red-600/25"
              onClick={() => handlePlanClick("PROFESSIONAL")}
            >
              Quero conhecer o MIAUCHAT
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-12 px-8 rounded-xl text-sm"
              onClick={() => navigate("/register")}
            >
              <Rocket className="mr-2 h-4 w-4" />
              Teste 7 dias grátis
            </Button>
          </div>
        </div>
      </section>

      {/* Seção - Vídeo Tutorial */}
      <section className="relative z-10 py-16 md:py-20 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
              <PlayCircle className="h-7 w-7 text-red-500" strokeWidth={1.5} />
            </div>
            <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
              Veja como é simples
            </p>
            <h2 className="text-2xl md:text-3xl font-bold leading-tight">
              Como criar sua conta e
              <br />
              <span className="text-red-500">começar a usar o MiauChat</span>
            </h2>
            <p className="mt-4 text-base text-white/50">
              Assista ao vídeo e veja como é fácil começar
            </p>
          </div>
          
          {/* Video Container */}
          <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-black/50">
            <div className="aspect-video">
              <iframe
                src="https://www.youtube.com/embed/q9VESHWqHBQ"
                title="Como criar conta no MiauChat"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Seção 2 - Agentes IA ON */}
      <section className="relative z-10 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
                Sempre disponível
              </p>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
                Enquanto sua equipe está{" "}
                <span className="text-white/40">OFF</span>,
                <br />
                os Agentes IA estão{" "}
                <span className="text-red-500">ON</span>
              </h2>
              <p className="mt-5 text-base text-white/50 leading-relaxed">
                Com Inteligência Artificial, sua empresa pode crescer sem
                limites e sem comprometer o orçamento.
              </p>
              <p className="mt-3 text-sm text-white/40 leading-relaxed">
                Seu novo time virtual trabalha 24 horas por dia, 7 dias por
                semana, atendendo milhares de leads e clientes simultaneamente.
              </p>
            </div>

            <div className="space-y-3">
              {highlights.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-red-500/20 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                    <item.icon
                      className="h-6 w-6 text-red-500"
                      strokeWidth={1.5}
                    />
                  </div>
                  <span className="text-base font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Seção 3 - Tráfego Pago + Agente IA */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative p-6 md:p-8 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-red-500/5 to-transparent">
                <div className="absolute top-4 right-4 w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Target className="h-6 w-6 text-red-500" strokeWidth={1.5} />
                </div>
                <Rocket
                  className="h-10 w-10 text-red-500 mb-4"
                  strokeWidth={1.5}
                />
                <h3 className="text-xl font-bold mb-3">SDRs Virtuais</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  Na prática, os Agentes atuam como SDRs virtuais, qualificando
                  leads, respondendo objeções e conduzindo o cliente até o
                  próximo passo da jornada.
                </p>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
                Mais conversões
              </p>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
                Tráfego Pago +<br />
                <span className="text-red-500">Agente IA</span> = Mais
                Conversões
              </h2>
              <p className="mt-5 text-base text-white/50 leading-relaxed">
                Substitua landing pages tradicionais por Agentes de IA nas suas
                campanhas de tráfego pago.
              </p>
              <p className="mt-3 text-sm text-white/40 leading-relaxed">
                Grande parte do tráfego pago hoje já direciona usuários
                diretamente para o WhatsApp — e é ali que os Agentes IA fazem o
                trabalho pesado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Seção 4 - IA com DNA do negócio */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
            <Brain className="h-8 w-8 text-red-500" strokeWidth={1.5} />
          </div>
          <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
            Personalização Total
          </p>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
            Inteligência Artificial customizada
            <br />
            com o <span className="text-red-500">DNA do seu negócio</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
            No MIAUCHAT, cada Agente IA é treinado de acordo com o seu produto,
            sua linguagem e seus objetivos.
          </p>
          <p className="mt-3 text-sm text-white/40 max-w-xl mx-auto leading-relaxed">
            Não é uma IA genérica. É um agente preparado para vender, atender e
            representar sua marca.
          </p>

          <div className="mt-10 grid sm:grid-cols-3 gap-4">
            {[
              { icon: MessageCircle, label: "Sua linguagem" },
              { icon: HeartHandshake, label: "Seus valores" },
              { icon: Bot, label: "Seus objetivos" },
            ].map((item, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.02]"
              >
                <item.icon
                  className="h-6 w-6 text-red-500 mx-auto mb-2"
                  strokeWidth={1.5}
                />
                <span className="text-sm text-white/70 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seção - Integrações WhatsApp + Chat Web */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
              <Globe className="h-8 w-8 text-red-500" strokeWidth={1.5} />
            </div>
            <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
              Multiplataforma
            </p>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
              Atenda onde seus clientes estão:
              <br />
              <span className="text-red-500">WhatsApp e Site</span>
            </h2>
            <p className="mt-5 text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
              Unifique todos os seus canais de atendimento em uma única plataforma inteligente.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* WhatsApp Card */}
            <div className="relative p-6 md:p-8 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-green-500/5 to-transparent hover:border-green-500/20 transition-all duration-300">
              <div className="absolute top-4 right-4 w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-green-500" strokeWidth={1.5} />
              </div>
              <Phone className="h-10 w-10 text-green-500 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold mb-3">WhatsApp Integrado</h3>
              <p className="text-sm text-white/50 leading-relaxed mb-4">
                Conecte múltiplos números de WhatsApp e gerencie todas as conversas em um só lugar. A IA responde automaticamente, qualifica leads e direciona para o atendente certo.
              </p>
              <ul className="space-y-2">
                {[
                  "Múltiplos números conectados",
                  "IA respondendo 24/7",
                  "Transcrição de áudios",
                  "Leitura de imagens",
                  "Mensagens agendadas",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-white/60">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Chat Web Card */}
            <div className="relative p-6 md:p-8 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-blue-500/5 to-transparent hover:border-blue-500/20 transition-all duration-300">
              <div className="absolute top-4 right-4 w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Globe className="h-6 w-6 text-blue-500" strokeWidth={1.5} />
              </div>
              <Bot className="h-10 w-10 text-blue-500 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold mb-3">Chat Web para seu Site</h3>
              <p className="text-sm text-white/50 leading-relaxed mb-4">
                Instale um widget de chat em qualquer site com apenas uma linha de código. Capture leads, tire dúvidas e converta visitantes em clientes com IA ou atendente humano.
              </p>
              <ul className="space-y-2">
                {[
                  "Instalação em 1 minuto",
                  "Totalmente personalizável",
                  "IA ou atendente humano",
                  "Captura de leads automática",
                  "Histórico unificado",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-white/60">
                    <Check className="h-4 w-4 text-blue-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Highlight */}
          <div className="mt-8 p-5 rounded-xl border border-red-500/20 bg-red-500/5 text-center">
            <p className="text-sm text-white/70">
              <span className="text-red-500 font-semibold">Tudo integrado:</span> Conversas do WhatsApp e do Chat Web aparecem no mesmo painel, com histórico unificado e IA compartilhada.
            </p>
          </div>
        </div>
      </section>

      {/* Seção - Agenda Pro */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
                <Calendar className="h-7 w-7 text-red-500" strokeWidth={1.5} />
              </div>
              <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
                Módulo Agenda Pro
              </p>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
                Agendamento online completo
                <br />
                <span className="text-red-500">integrado ao MiauChat</span>
              </h2>
              <p className="mt-5 text-base text-white/50 leading-relaxed">
                Sistema profissional de agendamentos para clínicas, salões, consultórios e qualquer negócio que trabalhe com horários marcados.
              </p>
              <p className="mt-3 text-sm text-white/40 leading-relaxed">
                A IA pode agendar, confirmar e remarcar automaticamente via WhatsApp. Seus clientes também podem agendar por um link público personalizado.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: CalendarClock, title: "Múltiplas visualizações", desc: "Dia, semana e mês por profissional" },
                { icon: UserCheck, title: "Gestão de Profissionais", desc: "Horários individuais e especialidades" },
                { icon: Bell, title: "Lembretes automáticos", desc: "WhatsApp, e-mail e SMS" },
                { icon: Link2, title: "Link público", desc: "Clientes agendam online 24/7" },
                { icon: Calendar, title: "Google Calendar", desc: "Sincronização automática" },
                { icon: Palette, title: "Personalizável", desc: "Cores e identidade visual" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-red-500/20 transition-all duration-300"
                >
                  <item.icon className="h-6 w-6 text-red-500 mb-2" strokeWidth={1.5} />
                  <h4 className="text-sm font-semibold mb-1">{item.title}</h4>
                  <p className="text-xs text-white/50">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Features list */}
          <div className="mt-12 p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <h3 className="text-lg font-bold mb-4 text-center">Recursos completos da Agenda Pro</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                "Confirmação por link",
                "Mensagens pré-atendimento",
                "Bloqueio de feriados",
                "Limite de agendamentos",
                "Buffer entre atendimentos",
                "Cadastro de clientes",
                "Aniversariantes automático",
                "Relatórios e métricas",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-white/60">
                  <Check className="h-4 w-4 text-red-500 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Seção 5 - Planos */}
      <section
        id="planos"
        className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]"
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
              💼 Planos e Preços
            </p>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold">
              Automação de atendimento com IA
            </h2>
            <p className="mt-3 text-white/50 text-base max-w-2xl mx-auto">
              Planos flexíveis, sem desperdício, pensados para escalar com previsibilidade.
            </p>
          </div>

          {/* Banner Trial + Plano Anual */}
          <div className="mb-10 space-y-4">
            {/* Trial Info */}
            <div className="py-3 px-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center gap-2 text-white/70 text-xs">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span>Faça seu cadastro e solicite a avaliação de 7 dias. Pagamento apenas após o período de teste.</span>
            </div>

            {/* Banner Plano Anual */}
            <div className="p-5 md:p-6 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-red-600/5 to-transparent relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl" />
              <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
                    <span className="text-2xl">🎁</span>
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-white">
                      Assine o plano anual e ganhe <span className="text-red-400">1 mês grátis!</span>
                    </h3>
                    <p className="text-sm text-white/50 mt-1">
                      Economize o equivalente a 1 mensalidade por ano + receba <span className="text-red-400 font-medium">suporte dedicado para implementação</span> do sistema na sua empresa.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-lg text-xs font-semibold text-red-400 uppercase tracking-wide">
                    Economia de até 8%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-4 rounded-2xl border transition-all duration-300 flex flex-col ${
                  plan.popular || plan.isPrime
                    ? "border-red-500/40 bg-gradient-to-b from-red-500/10 to-transparent shadow-xl shadow-red-500/5"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-red-600 text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1">
                    ⭐ Mais Escolhido
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold tracking-wide">{plan.name}</p>
                <p className="text-xs text-white/40 mt-1 min-h-[72px]">
                    {plan.description}
                  </p>
                </div>
                <div className="mt-3 mb-3">
                  {plan.startingFrom && (
                    <span className="text-white/40 text-xs">A partir de </span>
                  )}
                  <span className="text-white/40 text-xs">R$</span>
                  <span className="text-2xl font-bold">{plan.price}</span>
                  <span className="text-white/40 text-xs"> / mês</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-white/60"
                    >
                      <Check className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => plan.isEnterprise 
                    ? navigate("/register?plan=enterprise")
                    : handlePlanClick(plan.name)
                  }
                  className={`w-full h-10 rounded-lg text-sm font-medium ${
                    plan.popular
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-white/5 hover:bg-white/10 text-white"
                  }`}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          {/* Consumo Adicional */}
          <div className="mt-12 p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold flex items-center justify-center gap-2">
                ➕ Consumo adicional <span className="text-white/40 font-normal text-sm">(escala sob demanda)</span>
              </h3>
              <p className="text-sm text-white/50 mt-2">
                Se sua operação crescer, você continua usando a plataforma normalmente. O consumo adicional é cobrado apenas pelo que for excedido.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {additionalPricing.map((item, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <span className="text-xs text-white/70">{item.item}</span>
                  <span className="text-sm font-semibold text-red-400">{item.price}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mensagem de escala */}
          <div className="mt-8 text-center">
            <p className="text-white/40 text-sm">
              🚀 <span className="text-white/60 font-medium">Cresça sem desperdício</span> — Comece com o plano ideal e adicione capacidade conforme sua demanda aumenta.
            </p>
          </div>
        </div>
      </section>

      {/* Seção FAQ */}
      <section
        id="faq"
        className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]"
      >
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
              <HelpCircle className="h-6 w-6 text-red-500" strokeWidth={1.5} />
            </div>
            <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
              Dúvidas Frequentes
            </p>
            <h2 className="text-2xl md:text-3xl font-bold">
              Perguntas e respostas
            </h2>
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border border-white/[0.06] rounded-xl bg-white/[0.02] px-5 data-[state=open]:bg-white/[0.04]"
              >
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-white/60 leading-relaxed pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section
        id="contato"
        className="relative z-10 py-20 md:py-28 border-t border-white/[0.06]"
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
            Pronto para começar?
          </p>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
            Transforme seu atendimento
            <br />
            com <span className="text-red-500">Inteligência Artificial</span>
          </h2>
          <p className="mt-5 text-white/50 text-base max-w-2xl mx-auto">
            Fale com um especialista ou comece agora mesmo. Nosso time está
            pronto para ajudar sua empresa a escalar.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Button
              size="lg"
              className="bg-red-600 hover:bg-red-500 text-white h-12 px-8 rounded-xl text-sm font-semibold shadow-lg shadow-red-600/25"
              onClick={() => handlePlanClick("PROFESSIONAL")}
            >
              Começar agora
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-12 px-8 rounded-xl text-sm"
            >
              <a
                href="https://wa.me/5563999540484?text=Olá! Quero saber mais sobre o MiauChat"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Phone className="mr-2 h-4 w-4" />
                Falar no WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-10">
        <div className="max-w-6xl mx-auto px-6">

        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={miauchatLogo} alt="MiauChat" className="h-8 w-8" />
              <span className="text-sm font-medium text-white/60">
                <span className="text-red-500">MIAU</span>CHAT
              </span>
            </div>
            
            <nav className="flex items-center gap-6 text-sm" aria-label="Links legais">
              <Link 
                to="/privacidade" 
                className="text-white/50 hover:text-white transition-colors underline"
              >
                Política de Privacidade
              </Link>
              <Link 
                to="/termos" 
                className="text-white/50 hover:text-white transition-colors underline"
              >
                Termos de Serviço
              </Link>
            </nav>
            
            <p className="text-xs text-white/30">
              © {new Date().getFullYear()} MiauChat. Todos os direitos
              reservados.
            </p>
          </div>

          {/* Informações Comerciais */}
          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-xs text-white/30">
              MIAU - SOLUCOES DIGITAIS
            </p>
          <p className="text-xs text-white/25 mt-1">
              CNPJ: 64.774.567/0001-06
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
