import {
  MessageSquare,
  Users,
  Clock,
  TrendingUp,
  Bot,
  UserCheck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const stats = [
  {
    title: "Conversas Ativas",
    value: "24",
    change: "+12%",
    icon: MessageSquare,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    title: "Clientes Atendidos",
    value: "156",
    change: "+8%",
    icon: Users,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    title: "Tempo Médio de Resposta",
    value: "2m 34s",
    change: "-15%",
    icon: Clock,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    title: "Taxa de Resolução",
    value: "94%",
    change: "+5%",
    icon: TrendingUp,
    color: "text-success",
    bgColor: "bg-success/10",
  },
];

const recentConversations = [
  {
    id: 1,
    name: "Maria Silva",
    lastMessage: "Preciso de orientação sobre divórcio...",
    time: "2 min",
    handler: "ai" as const,
    status: "triagem_ia",
  },
  {
    id: 2,
    name: "João Santos",
    lastMessage: "Obrigado pela ajuda!",
    time: "15 min",
    handler: "human" as const,
    status: "em_andamento",
  },
  {
    id: 3,
    name: "Ana Costa",
    lastMessage: "Quando posso enviar os documentos?",
    time: "32 min",
    handler: "human" as const,
    status: "aguardando_documentos",
  },
  {
    id: 4,
    name: "Pedro Oliveira",
    lastMessage: "Tenho uma dúvida sobre contrato...",
    time: "1h",
    handler: "ai" as const,
    status: "novo_contato",
  },
];

const teamPerformance = [
  { name: "Dr. Carlos Mendes", cases: 12, resolved: 10 },
  { name: "Dra. Fernanda Lima", cases: 8, resolved: 7 },
  { name: "Dr. Roberto Alves", cases: 15, resolved: 12 },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do seu escritório jurídico
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <Badge
                    variant={stat.change.startsWith("+") ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {stat.change} vs. mês anterior
                  </Badge>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Conversations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Conversas Recentes
            </CardTitle>
            <CardDescription>
              Últimos atendimentos em andamento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentConversations.map((conv) => (
              <div
                key={conv.id}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {conv.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{conv.name}</p>
                    <p className="text-sm text-muted-foreground truncate max-w-xs">
                      {conv.lastMessage}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      conv.handler === "ai"
                        ? "border-status-ai text-status-ai"
                        : "border-status-human text-status-human"
                    }
                  >
                    {conv.handler === "ai" ? (
                      <Bot className="h-3 w-3 mr-1" />
                    ) : (
                      <UserCheck className="h-3 w-3 mr-1" />
                    )}
                    {conv.handler === "ai" ? "IA" : "Advogado"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{conv.time}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Team Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Desempenho da Equipe
            </CardTitle>
            <CardDescription>Casos por advogado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {teamPerformance.map((member) => (
              <div key={member.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{member.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {member.resolved}/{member.cases}
                  </span>
                </div>
                <Progress
                  value={(member.resolved / member.cases) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-status-ai/10 border-status-ai/20">
          <CardContent className="p-4 flex items-center gap-4">
            <Bot className="h-8 w-8 text-status-ai" />
            <div>
              <p className="text-2xl font-bold">8</p>
              <p className="text-sm text-muted-foreground">Em triagem IA</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-warning/10 border-warning/20">
          <CardContent className="p-4 flex items-center gap-4">
            <AlertCircle className="h-8 w-8 text-warning" />
            <div>
              <p className="text-2xl font-bold">5</p>
              <p className="text-sm text-muted-foreground">Aguardando docs</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <UserCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">11</p>
              <p className="text-sm text-muted-foreground">Com advogado</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-success/10 border-success/20">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div>
              <p className="text-2xl font-bold">42</p>
              <p className="text-sm text-muted-foreground">Finalizados hoje</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
