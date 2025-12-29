import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import miauchatLogo from "@/assets/miauchat-logo.png";

export function LandingPage() {
  const plans = [
    {
      name: "START",
      price: "199",
      description: "Indicado para começar.",
      items: [
        "1 número de WhatsApp",
        "Até 3 usuários",
        "Agente IA básico",
        "Atendimento automatizado",
        "Painel de controle",
      ],
      cta: "Começar agora",
      ctaLink: "/auth?tab=signup",
    },
    {
      name: "PRO",
      price: "399",
      description: "Para empresas em crescimento.",
      items: [
        "2 números de WhatsApp",
        "Mais usuários",
        "Agente IA avançado",
        "Entendimento com IA",
        "Fluxos mais inteligentes",
        "Relatórios básicos",
      ],
      cta: "Quero escalar meu atendimento",
      ctaLink: "/auth?tab=signup",
      popular: true,
    },
    {
      name: "ENTERPRISE",
      price: "1.399",
      description: "Para operações robustas.",
      items: [
        "API completa",
        "SLA dedicada",
        "Integrações avançadas",
        "Agentes IA ilimitados",
        "Alto volume de mensagens",
        "Suporte prioritário",
      ],
      cta: "Falar com vendas",
      ctaLink: "/auth?tab=signup",
    },
  ];

  const faqs = [
    {
      question: "O que é o MiauChat?",
      answer:
        "O MiauChat é uma plataforma de atendimento com Inteligência Artificial que permite automatizar conversas no WhatsApp. Nossos Agentes IA qualificam leads, respondem dúvidas, agendam reuniões e direcionam clientes para vendas — tudo 24 horas por dia, 7 dias por semana.",
    },
    {
      question: "Como funciona o Agente de IA?",
      answer:
        "O Agente IA é treinado com informações do seu negócio: produtos, serviços, tom de voz e objetivos. Ele conversa de forma natural e humanizada, entendendo o contexto das mensagens e respondendo de maneira precisa e empática.",
    },
    {
      question: "Preciso de conhecimento técnico para usar?",
      answer:
        "Não! O MiauChat foi desenvolvido para ser simples e intuitivo. Nossa equipe configura o Agente IA para você, e o painel de controle é fácil de usar. Você não precisa programar nada.",
    },
    {
      question: "Posso integrar com meu CRM ou outras ferramentas?",
      answer:
        "Sim! O plano Enterprise oferece API completa e integrações avançadas com CRMs, ERPs e outras ferramentas que sua empresa já utiliza.",
    },
    {
      question: "Qual a diferença entre os planos?",
      answer:
        "O plano Start é ideal para começar com 1 WhatsApp e até 3 usuários. O Pro oferece mais recursos como IA avançada e relatórios. O Enterprise é para operações robustas com API completa, integrações avançadas e suporte prioritário.",
    },
    {
      question: "Existe período de teste ou contrato mínimo?",
      answer:
        "Oferecemos demonstração gratuita para você conhecer a plataforma. Não há contrato mínimo de fidelidade — você pode cancelar quando quiser.",
    },
    {
      question: "Como é o suporte ao cliente?",
      answer:
        "Todos os planos incluem suporte por chat e email. O plano Enterprise conta com suporte prioritário e SLA dedicada para garantir atendimento rápido.",
    },
    {
      question: "O MiauChat funciona com grupos do WhatsApp?",
      answer:
        "Atualmente, o MiauChat é focado em conversas individuais (1:1) para atendimento e vendas. Funcionalidades para grupos estão em nosso roadmap.",
    },
  ];

  const highlights = [
    { icon: Clock, text: "Atendimento contínuo 24/7" },
    { icon: TrendingUp, text: "Escalável sem aumentar custos fixos" },
    { icon: Zap, text: "Zero filas, zero atrasos" },
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
            <Link
              to="/auth"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Entrar
            </Link>
            <Button
              asChild
              className="bg-red-600 hover:bg-red-500 text-white h-10 px-6 rounded-xl"
            >
              <Link to="/auth?tab=signup">
                Começar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
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
              asChild
              size="lg"
              className="bg-red-600 hover:bg-red-500 text-white h-12 px-8 rounded-xl text-sm font-semibold shadow-lg shadow-red-600/25"
            >
              <Link to="/auth?tab=signup">
                Quero conhecer o MIAUCHAT
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-12 px-8 rounded-xl text-sm"
            >
              <a href="#contato">
                <Phone className="mr-2 h-4 w-4" />
                Falar com especialista
              </a>
            </Button>
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

      {/* Seção 5 - Planos */}
      <section
        id="planos"
        className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]"
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
              Planos e Preços
            </p>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold">
              Escolha o plano ideal
            </h2>
            <p className="mt-3 text-white/40 text-base">
              Soluções para empresas de todos os tamanhos
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-6 rounded-2xl border transition-all duration-300 flex flex-col ${
                  plan.popular
                    ? "border-red-500/40 bg-gradient-to-b from-red-500/10 to-transparent shadow-xl shadow-red-500/5"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-red-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                    Mais Popular
                  </div>
                )}
                <div>
                  <p className="text-base font-bold tracking-wide">{plan.name}</p>
                  <p className="text-xs text-white/40 mt-1">
                    {plan.description}
                  </p>
                </div>
                <div className="mt-4 mb-4">
                  <span className="text-white/40 text-xs">R$</span>
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-white/40 text-sm"> / mês</span>
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
                  asChild
                  className={`w-full h-10 rounded-lg text-sm font-medium ${
                    plan.popular
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-white/5 hover:bg-white/10 text-white"
                  }`}
                >
                  <Link to={plan.ctaLink}>{plan.cta}</Link>
                </Button>
              </div>
            ))}
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
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold">
              Perguntas e Respostas
            </h2>
            <p className="mt-3 text-white/40 text-base">
              Tudo o que você precisa saber sobre o MiauChat
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border border-white/[0.06] bg-white/[0.02] rounded-xl px-5 data-[state=open]:border-red-500/20 data-[state=open]:bg-red-500/[0.02] transition-all"
              >
                <AccordionTrigger className="text-left text-sm md:text-base font-medium py-4 hover:no-underline hover:text-red-400 transition-colors [&[data-state=open]]:text-red-400">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-white/50 text-sm leading-relaxed pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-10 text-center">
            <p className="text-white/40 text-sm mb-3">Ainda tem dúvidas?</p>
            <Button
              asChild
              variant="outline"
              className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-10 px-6 rounded-lg text-sm"
            >
              <a href="#contato">
                <MessageCircle className="mr-2 h-4 w-4" />
                Fale com nossa equipe
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Seção 6 - CTA Final */}
      <section
        id="contato"
        className="relative z-10 py-16 md:py-24 border-t border-white/[0.06]"
      >
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="relative inline-block mb-8">
            <div className="absolute inset-0 bg-red-500/20 rounded-2xl blur-2xl" />
            <img src={miauchatLogo} alt="" className="relative h-16 w-16" />
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 leading-tight">
            Transforme seu atendimento com
            <br />
            <span className="text-red-500">Inteligência Artificial</span>
          </h2>
          <p className="text-base md:text-lg text-white/50 mb-3">
            Chega de perder leads e sobrecarregar sua equipe.
          </p>
          <p className="text-sm text-white/40 mb-8 max-w-xl mx-auto">
            Com o MIAUCHAT, você escala seu atendimento e suas vendas sem
            escalar seus custos.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-red-600 hover:bg-red-500 text-white h-12 px-8 rounded-xl text-sm font-semibold shadow-xl shadow-red-600/20"
            >
              <Link to="/auth?tab=signup">
                Começar agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-12 px-8 rounded-xl text-sm"
            >
              <Link to="/auth?tab=signup">Solicitar demonstração</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={miauchatLogo} alt="" className="h-6 w-6 opacity-60" />
            <span className="text-sm text-white/40">MIAUCHAT</span>
          </div>
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} MiauChat. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
