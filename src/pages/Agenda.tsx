import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Settings2, Clock, List, Bot } from "lucide-react";
import { AgendaCalendar } from "@/components/agenda/AgendaCalendar";
import { AgendaServices } from "@/components/agenda/AgendaServices";
import { AgendaSettings } from "@/components/agenda/AgendaSettings";
import { AgendaAppointmentsList } from "@/components/agenda/AgendaAppointmentsList";
import { AgendaAIAgent } from "@/components/agenda/AgendaAIAgent";

export default function Agenda() {
  const navigate = useNavigate();
  const { isConnected, integration, isLoading } = useGoogleCalendar();
  const [activeTab, setActiveTab] = useState("calendar");

  // Redirect if Google Calendar is not connected
  useEffect(() => {
    if (!isLoading && (!isConnected || !integration?.is_active)) {
      navigate("/dashboard");
    }
  }, [isConnected, integration, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isConnected || !integration?.is_active) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Agenda Inteligente</h1>
        <p className="text-muted-foreground">
          Gerencie serviços, horários e agendamentos de forma inteligente
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendário</span>
          </TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Agendamentos</span>
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Serviços</span>
          </TabsTrigger>
          <TabsTrigger value="ai-agent" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Agente IA</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Configurar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-6">
          <AgendaCalendar />
        </TabsContent>

        <TabsContent value="appointments" className="mt-6">
          <AgendaAppointmentsList />
        </TabsContent>

        <TabsContent value="services" className="mt-6">
          <AgendaServices />
        </TabsContent>

        <TabsContent value="ai-agent" className="mt-6">
          <AgendaAIAgent />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <AgendaSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
