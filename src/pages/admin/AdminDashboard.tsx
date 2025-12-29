import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Bot, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";

interface Stats {
  teamMembers: number;
  totalConversations: number;
  activeAgents: number;
  whatsappInstances: number;
}

export default function AdminDashboard() {
  const { lawFirm } = useLawFirm();
  const [stats, setStats] = useState<Stats>({
    teamMembers: 0,
    totalConversations: 0,
    activeAgents: 0,
    whatsappInstances: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lawFirm?.id) return;

    const fetchStats = async () => {
      try {
        const [
          { count: teamCount },
          { count: convCount },
          { count: agentCount },
          { count: instanceCount },
        ] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("law_firm_id", lawFirm.id),
          supabase.from("conversations").select("*", { count: "exact", head: true }).eq("law_firm_id", lawFirm.id),
          supabase.from("automations").select("*", { count: "exact", head: true }).eq("law_firm_id", lawFirm.id).eq("is_active", true),
          supabase.from("whatsapp_instances").select("*", { count: "exact", head: true }).eq("law_firm_id", lawFirm.id),
        ]);

        setStats({
          teamMembers: teamCount || 0,
          totalConversations: convCount || 0,
          activeAgents: agentCount || 0,
          whatsappInstances: instanceCount || 0,
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [lawFirm?.id]);

  const statCards = [
    { 
      title: "Membros da Equipe", 
      value: stats.teamMembers, 
      icon: Users,
      description: "Usuários ativos na plataforma"
    },
    { 
      title: "Conversas", 
      value: stats.totalConversations, 
      icon: MessageSquare,
      description: "Total de conversas registradas"
    },
    { 
      title: "Agentes IA", 
      value: stats.activeAgents, 
      icon: Bot,
      description: "Automações ativas"
    },
    { 
      title: "Conexões WhatsApp", 
      value: stats.whatsappInstances, 
      icon: Smartphone,
      description: "Instâncias conectadas"
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Visão Geral</h1>
        <p className="text-muted-foreground">
          Gerencie sua empresa e equipe
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? (
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                ) : (
                  card.value
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>
              Acesse as principais configurações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a 
              href="/admin/team" 
              className="block p-3 rounded-lg border hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Gerenciar Equipe</p>
                  <p className="text-sm text-muted-foreground">
                    Adicionar, editar ou remover membros
                  </p>
                </div>
              </div>
            </a>
            <a 
              href="/admin/company" 
              className="block p-3 rounded-lg border hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Dados da Empresa</p>
                  <p className="text-sm text-muted-foreground">
                    Atualizar informações do escritório
                  </p>
                </div>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações da Empresa</CardTitle>
            <CardDescription>
              Dados do seu escritório
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-medium">{lawFirm?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">E-mail</p>
              <p className="font-medium">{lawFirm?.email || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Telefone</p>
              <p className="font-medium">{lawFirm?.phone || "-"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
