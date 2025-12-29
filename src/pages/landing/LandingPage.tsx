import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  Bot,
  Check,
  Lock,
  MessagesSquare,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import miauchatLogo from "@/assets/miauchat-logo.png";

const navItems = [
  { label: "Recursos", href: "#recursos" },
  { label: "Planos", href: "#planos" },
  { label: "FAQ", href: "#faq" },
] as const;

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: MessagesSquare,
    title: "Centralização total",
    description: "Todos os canais no mesmo lugar para você atender com contexto e velocidade.",
  },
  {
    icon: Bot,
    title: "IA que trabalha junto",
    description: "Sugestões, triagem e automações para reduzir tarefas repetitivas.",
  },
  {
    icon: Workflow,
    title: "Fluxos inteligentes",
    description: "Distribuição, etiquetas e handoff para humano quando necessário.",
  },
  {
    icon: Lock,
    title: "Confiável por padrão",
    description: "Estrutura pronta para operações profissionais com controle e auditoria.",
  },
];

const plans = [
  {
    name: "Essencial",
    price: "R$ 149",
    subtitle: "Para começar com eficiência",
    bullets: ["2 usuários", "1 conexão WhatsApp", "Relatórios básicos", "Suporte por email"],
    highlighted: false,
  },
  {
    name: "Profissional",
    price: "R$ 349",
    subtitle: "Para equipes em crescimento",
    bullets: [
      "10 usuários",
      "5 conexões WhatsApp",
      "Automação com IA",
      "Relatórios completos",
      "Suporte prioritário",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Sob consulta",
    subtitle: "Para operações avançadas",
    bullets: [
      "Usuários ilimitados",
      "Conexões ilimitadas",
      "SLA e onboarding",
      "Customizações",
    ],
    highlighted: false,
  },
] as const;

const faqs = [
  {
    q: "Preciso de cartão de crédito para começar?",
    a: "Não. Você pode criar sua conta e testar o produto sem cadastrar cartão.",
  },
  {
    q: "Consigo usar com minha equipe?",
    a: "Sim. Você pode adicionar usuários e organizar permissões conforme o seu plano.",
  },
  {
    q: "A IA responde sozinha?",
    a: "Você pode configurar automações e também alternar para atendimento humano quando necessário.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-28 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-[-140px] right-[-120px] h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={miauchatLogo}
              alt="Logo MiauChat"
              className="h-10 w-10"
              loading="eager"
              decoding="async"
            />
            <span className="font-semibold tracking-tight">MiauChat</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/auth?tab=signup">
                Começar agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* HERO */}
        <section className="relative">
          <div className="container grid gap-10 py-16 md:grid-cols-[1.15fr_0.85fr] md:py-24">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Multiplataforma de Inteligência Artificial Unificada
              </div>

              <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
                Atendimento elegante,
                <span className="text-primary"> rápido</span> e
                <span className="text-primary"> inteligente</span>.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Uma plataforma para centralizar conversas, automatizar rotinas e dar visibilidade
                total do seu atendimento — sem complicação.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/auth?tab=signup">
                    Criar conta grátis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#planos">Ver planos</a>
                </Button>
              </div>

              <p className="mt-6 text-xs text-muted-foreground">
                Sem cartão de crédito • Cancele quando quiser
              </p>
            </div>

            {/* Visual */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
              <div className="relative w-full max-w-sm">
                <div className="rounded-3xl border border-border/60 bg-card/60 p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
                        <img
                          src={miauchatLogo}
                          alt="Ícone do MiauChat"
                          className="h-7 w-7"
                          loading="eager"
                          decoding="async"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">MiauChat</p>
                        <p className="text-xs text-muted-foreground">Visão unificada</p>
                      </div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-success" aria-label="Online" />
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="h-10 rounded-2xl bg-muted/50" />
                    <div className="h-10 rounded-2xl bg-muted/30" />
                    <div className="h-10 rounded-2xl bg-muted/50" />
                  </div>

                  <div className="mt-6 rounded-2xl border border-border/60 bg-background/40 p-4">
                    <p className="text-xs text-muted-foreground">Sugestão de resposta (IA)</p>
                    <p className="mt-2 text-sm">
                      Posso te ajudar com isso agora. Você prefere atendimento por mensagem ou uma
                      ligação rápida?
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {["Tempo de resposta", "Satisfação"].map((label) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-border/60 bg-card/40 p-4"
                    >
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-semibold">+48%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="recursos" className="relative">
          <div className="container py-16 md:py-24">
            <header className="max-w-2xl">
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">
                Recursos com foco em operação
              </h2>
              <p className="mt-3 text-muted-foreground">
                Menos ruído, mais clareza. Tudo desenhado para acelerar o dia a dia do seu time.
              </p>
            </header>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <Card key={f.title} className="border-border/60 bg-card/50">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold">{f.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="planos" className="relative">
          <div className="container py-16 md:py-24">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <h2 className="font-display text-3xl tracking-tight md:text-4xl">Planos</h2>
                <p className="mt-3 text-muted-foreground">
                  Comece pequeno e escale conforme seu atendimento cresce.
                </p>
              </div>
              <Button variant="outline" asChild className="w-fit">
                <Link to="/auth?tab=signup">Criar conta</Link>
              </Button>
            </header>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {plans.map((p) => (
                <Card
                  key={p.name}
                  className={
                    p.highlighted
                      ? "border-primary/40 bg-card/60"
                      : "border-border/60 bg-card/40"
                  }
                >
                  <CardContent className="p-7">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{p.subtitle}</p>
                      </div>
                      {p.highlighted ? (
                        <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
                          Recomendo
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-6 text-3xl font-semibold">{p.price}</p>

                    <ul className="mt-6 space-y-3">
                      {p.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="mt-8 w-full"
                      variant={p.highlighted ? "default" : "outline"}
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

        {/* FAQ */}
        <section id="faq" className="relative">
          <div className="container py-16 md:py-24">
            <header className="max-w-2xl">
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">FAQ</h2>
              <p className="mt-3 text-muted-foreground">
                Respostas rápidas para dúvidas comuns.
              </p>
            </header>

            <div className="mt-10 max-w-2xl">
              <Accordion type="single" collapsible>
                {faqs.map((item) => (
                  <AccordionItem key={item.q} value={item.q}>
                    <AccordionTrigger>{item.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 bg-background/70">
        <div className="container flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={miauchatLogo}
              alt="Logo MiauChat"
              className="h-8 w-8 opacity-80"
              loading="lazy"
              decoding="async"
            />
            <p className="text-sm text-muted-foreground">MiauChat</p>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MiauChat. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      <link rel="canonical" href="https://www.miauchat.com.br" />
    </div>
  );
}
