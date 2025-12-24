import { useEffect, useState } from "react";
import {
  MessageSquare,
  Users,
  Clock,
  TrendingUp,
  Bot,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

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

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#ef4444", "#f97316", "#eab308", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
];

export default function Dashboard() {
  const { statuses } = useCustomStatuses();
  const { departments } = useDepartments();
  const { clients } = useClients();

  // Calculate clients per status
  const clientsByStatus = statuses.map((status, index) => {
    const count = clients.filter((c) => c.custom_status_id === status.id).length;
    return {
      name: status.name,
      value: count,
      color: status.color || CHART_COLORS[index % CHART_COLORS.length],
    };
  });

  // Add clients without status
  const clientsWithoutStatus = clients.filter((c) => !c.custom_status_id).length;
  if (clientsWithoutStatus > 0) {
    clientsByStatus.push({
      name: "Sem status",
      value: clientsWithoutStatus,
      color: "#9ca3af",
    });
  }

  // Calculate clients per department
  const clientsByDepartment = departments.map((dept, index) => {
    const count = clients.filter((c) => c.department_id === dept.id).length;
    return {
      name: dept.name,
      count,
      color: dept.color || CHART_COLORS[index % CHART_COLORS.length],
    };
  });

  // Add clients without department
  const clientsWithoutDept = clients.filter((c) => !c.department_id).length;
  if (clientsWithoutDept > 0) {
    clientsByDepartment.push({
      name: "Sem departamento",
      count: clientsWithoutDept,
      color: "#9ca3af",
    });
  }

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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clients by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Clientes por Status
            </CardTitle>
            <CardDescription>
              Distribuição de clientes em cada status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clientsByStatus.length > 0 && clientsByStatus.some(s => s.value > 0) ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientsByStatus.filter(s => s.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {clientsByStatus.filter(s => s.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                <Tag className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhum cliente com status definido</p>
                <p className="text-sm">Configure status em Configurações</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clients by Department */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Clientes por Departamento
            </CardTitle>
            <CardDescription>
              Quantidade de clientes em cada departamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clientsByDepartment.length > 0 && clientsByDepartment.some(d => d.count > 0) ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsByDepartment.filter(d => d.count > 0)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Clientes" radius={[0, 4, 4, 0]}>
                      {clientsByDepartment.filter(d => d.count > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                <Briefcase className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhum cliente em departamentos</p>
                <p className="text-sm">Configure departamentos em Configurações</p>
              </div>
            )}
          </CardContent>
        </Card>
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
              <p className="text-2xl font-bold">{clients.length}</p>
              <p className="text-sm text-muted-foreground">Total de clientes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Statuses Overview */}
      {statuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Resumo por Status
            </CardTitle>
            <CardDescription>
              Status configurados pelo seu escritório
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {statuses.map((status) => {
                const count = clients.filter((c) => c.custom_status_id === status.id).length;
                return (
                  <div
                    key={status.id}
                    className="p-4 rounded-lg border"
                    style={{ borderColor: status.color + "40", backgroundColor: status.color + "10" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-sm font-medium truncate">{status.name}</span>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: status.color }}>
                      {count}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
