import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CalendarDays, 
  List, 
  Clock, 
  UserCheck, 
  Users, 
  Settings2,
  BarChart3,
  Link2,
  Loader2,
  MessageSquare
} from "lucide-react";
import { useAgendaPro } from "@/hooks/useAgendaPro";
import { AgendaProCalendar } from "@/components/agenda-pro/AgendaProCalendar";
import { AgendaProAppointmentsList } from "@/components/agenda-pro/AgendaProAppointmentsList";
import { AgendaProServices } from "@/components/agenda-pro/AgendaProServices";
import { AgendaProProfessionals } from "@/components/agenda-pro/AgendaProProfessionals";
import { AgendaProClients } from "@/components/agenda-pro/AgendaProClients";
// AgendaProResources removed - functionality not yet integrated
import { AgendaProSettings } from "@/components/agenda-pro/AgendaProSettings";
import { AgendaProReports } from "@/components/agenda-pro/AgendaProReports";
import { AgendaProPublicLink } from "@/components/agenda-pro/AgendaProPublicLink";
import { AgendaProScheduledMessages } from "@/components/agenda-pro/AgendaProScheduledMessages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AgendaPro() {
  const navigate = useNavigate();
  const { settings, isLoading, isEnabled, enableAgendaPro } = useAgendaPro();
  const [activeTab, setActiveTab] = useState("calendar");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center h-[calc(100vh-120px)]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle>Agenda Pro</CardTitle>
            <CardDescription>
              Sistema completo de agendamentos para clínicas e escritórios
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>✓ Visualização diária, semanal e mensal</p>
              <p>✓ Gestão de profissionais e salas</p>
              <p>✓ Link público para agendamento online</p>
              <p>✓ Confirmações automáticas via WhatsApp</p>
              <p>✓ Relatórios e métricas detalhadas</p>
            </div>
            <Button 
              className="w-full" 
              onClick={() => enableAgendaPro.mutateAsync()}
              disabled={enableAgendaPro.isPending}
            >
              {enableAgendaPro.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ativando...
                </>
              ) : (
                "Ativar Agenda Pro"
              )}
            </Button>
            <Button 
              variant="ghost" 
              className="w-full" 
              onClick={() => navigate('/settings')}
            >
              Voltar para Configurações
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Agenda Pro</h1>
        <p className="text-muted-foreground">
          Gerencie agendamentos, profissionais e serviços de forma inteligente
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto gap-1 min-w-max">
            <TabsTrigger value="calendar" className="flex items-center gap-1.5 px-3 py-2">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-1.5 px-3 py-2">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Agendamentos</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-1.5 px-3 py-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Serviços</span>
            </TabsTrigger>
            <TabsTrigger value="professionals" className="flex items-center gap-1.5 px-3 py-2">
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Profissionais</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center gap-1.5 px-3 py-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="public-link" className="flex items-center gap-1.5 px-3 py-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Link Público</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center gap-1.5 px-3 py-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Mensagens</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5 px-3 py-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Relatórios</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5 px-3 py-2">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Configurar</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar" className="mt-6">
          <AgendaProCalendar />
        </TabsContent>

        <TabsContent value="appointments" className="mt-6">
          <AgendaProAppointmentsList />
        </TabsContent>

        <TabsContent value="services" className="mt-6">
          <AgendaProServices />
        </TabsContent>

        <TabsContent value="professionals" className="mt-6">
          <AgendaProProfessionals />
        </TabsContent>

        <TabsContent value="clients" className="mt-6">
          <AgendaProClients />
        </TabsContent>

        <TabsContent value="public-link" className="mt-6">
          <AgendaProPublicLink />
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <AgendaProScheduledMessages />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <AgendaProReports />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <AgendaProSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
