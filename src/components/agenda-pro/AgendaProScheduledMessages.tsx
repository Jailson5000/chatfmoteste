import { useState } from "react";
import { format, parseISO, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, MessageSquare, Clock, User, Pencil, XCircle, Send, CalendarClock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ScheduledMessage {
  id: string;
  appointment_id: string;
  type: "reminder" | "pre_message" | "confirmation";
  scheduled_for: string;
  message_content: string | null;
  status: "pending" | "sent" | "cancelled";
  appointment: {
    id: string;
    start_time: string;
    client_name: string | null;
    client_phone: string | null;
    status: string;
    agenda_pro_clients: { name: string; phone: string } | null;
    agenda_pro_services: { name: string; pre_message_text: string | null } | null;
    agenda_pro_professionals: { name: string } | null;
  };
}

export function AgendaProScheduledMessages() {
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [cancellingMessage, setCancellingMessage] = useState<ScheduledMessage | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch scheduled messages (appointments with pending reminders/pre-messages)
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["agenda-pro-scheduled-messages", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      // Get all upcoming appointments that haven't sent reminders/pre-messages yet
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .select(`
          id,
          start_time,
          end_time,
          client_name,
          client_phone,
          status,
          reminder_sent_at,
          pre_message_sent_at,
          confirmation_link_sent_at,
          agenda_pro_clients(name, phone),
          agenda_pro_services(name, pre_message_text, pre_message_enabled, pre_message_hours_before),
          agenda_pro_professionals(name)
        `)
        .eq("law_firm_id", lawFirm.id)
        .gte("start_time", now)
        .in("status", ["pending", "confirmed"])
        .order("start_time", { ascending: true });

      if (error) throw error;

      // Transform into scheduled message format
      const scheduledMessages: ScheduledMessage[] = [];

      (data || []).forEach((apt: any) => {
        const service = apt.agenda_pro_services;
        const startTime = parseISO(apt.start_time);

        // Reminder (24h before) - if not sent
        if (!apt.reminder_sent_at) {
          const reminderTime = new Date(startTime);
          reminderTime.setHours(reminderTime.getHours() - 24);
          
          if (isFuture(reminderTime)) {
            scheduledMessages.push({
              id: `${apt.id}_reminder`,
              appointment_id: apt.id,
              type: "reminder",
              scheduled_for: reminderTime.toISOString(),
              message_content: null,
              status: "pending",
              appointment: apt,
            });
          }
        }

        // Pre-message (custom hours before) - if enabled and not sent
        if (service?.pre_message_enabled && !apt.pre_message_sent_at) {
          const hoursBeforePre = service.pre_message_hours_before || 2;
          const preMessageTime = new Date(startTime);
          preMessageTime.setHours(preMessageTime.getHours() - hoursBeforePre);
          
          if (isFuture(preMessageTime)) {
            scheduledMessages.push({
              id: `${apt.id}_pre_message`,
              appointment_id: apt.id,
              type: "pre_message",
              scheduled_for: preMessageTime.toISOString(),
              message_content: service.pre_message_text,
              status: "pending",
              appointment: apt,
            });
          }
        }
      });

      // Sort by scheduled time
      return scheduledMessages.sort((a, b) => 
        new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
    },
    enabled: !!lawFirm?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Cancel a scheduled message
  const cancelMessage = useMutation({
    mutationFn: async (message: ScheduledMessage) => {
      // Mark as sent (skipped) so it won't be sent
      const field = message.type === "reminder" ? "reminder_sent_at" : "pre_message_sent_at";
      
      const { error } = await supabase
        .from("agenda_pro_appointments")
        .update({ [field]: new Date().toISOString() })
        .eq("id", message.appointment_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      toast({ title: "Mensagem cancelada" });
      setCancellingMessage(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  // Update pre-message content
  const updateMessage = useMutation({
    mutationFn: async ({ appointmentId, content }: { appointmentId: string; content: string }) => {
      // Get service ID from appointment
      const { data: apt } = await supabase
        .from("agenda_pro_appointments")
        .select("service_id")
        .eq("id", appointmentId)
        .single();

      if (!apt?.service_id) throw new Error("Serviço não encontrado");

      // Update the service's pre_message_text (this will affect only this type of message)
      // Note: For per-appointment customization, we'd need a new field. For now, we show a note.
      toast({ 
        title: "Nota", 
        description: "Para alterar a mensagem, edite o texto padrão do serviço na aba Serviços.",
      });
    },
    onSuccess: () => {
      setEditingMessage(null);
    },
  });

  // Send message now
  const sendNow = useMutation({
    mutationFn: async (message: ScheduledMessage) => {
      const notificationType = message.type === "reminder" ? "reminder" : "pre_message";
      
      const { error } = await supabase.functions.invoke("agenda-pro-notification", {
        body: { 
          appointment_id: message.appointment_id, 
          type: notificationType,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      toast({ title: "Mensagem enviada" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const pendingMessages = messages.filter(m => m.status === "pending");

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "reminder": return "Lembrete 24h";
      case "pre_message": return "Pré-atendimento";
      case "confirmation": return "Confirmação";
      default: return type;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "reminder": return "bg-blue-500/10 text-blue-500";
      case "pre_message": return "bg-purple-500/10 text-purple-500";
      case "confirmation": return "bg-green-500/10 text-green-500";
      default: return "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mensagens Agendadas</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie lembretes e mensagens pré-atendimento pendentes
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          {pendingMessages.length} pendente{pendingMessages.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendentes ({pendingMessages.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingMessages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium">Nenhuma mensagem pendente</h3>
                <p className="text-sm text-muted-foreground">
                  As mensagens agendadas aparecerão aqui
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingMessages.map((message) => {
                const apt = message.appointment;
                const clientName = apt.agenda_pro_clients?.name || apt.client_name || "Cliente";
                const clientPhone = apt.agenda_pro_clients?.phone || apt.client_phone || "";
                const serviceName = apt.agenda_pro_services?.name || "Serviço";
                const professionalName = apt.agenda_pro_professionals?.name;

                return (
                  <Card key={message.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getTypeBadgeColor(message.type)}>
                              {getTypeLabel(message.type)}
                            </Badge>
                            <Badge variant="outline" className="gap-1">
                              <CalendarClock className="h-3 w-3" />
                              {format(parseISO(message.scheduled_for), "dd/MM HH:mm", { locale: ptBR })}
                            </Badge>
                          </div>

                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{clientName}</span>
                              <span className="text-muted-foreground">{clientPhone}</span>
                            </div>
                            <div className="text-muted-foreground">
                              {serviceName} • {format(parseISO(apt.start_time), "dd/MM 'às' HH:mm", { locale: ptBR })}
                              {professionalName && ` • ${professionalName}`}
                            </div>
                          </div>

                          {message.type === "pre_message" && message.message_content && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              <p className="text-muted-foreground text-xs mb-1">Mensagem:</p>
                              <p className="line-clamp-2">{message.message_content}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => sendNow.mutate(message)}
                            disabled={sendNow.isPending}
                            title="Enviar agora"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          {message.type === "pre_message" && message.message_content && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingMessage(message);
                                setEditedContent(message.message_content || "");
                              }}
                              title="Editar mensagem"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCancellingMessage(message)}
                            title="Cancelar envio"
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingMessage} onOpenChange={() => setEditingMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={5}
              placeholder="Conteúdo da mensagem..."
            />
            <p className="text-xs text-muted-foreground">
              Nota: Esta mensagem é definida no cadastro do serviço. 
              Para alterar permanentemente, edite o serviço na aba "Serviços".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMessage(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancellingMessage} onOpenChange={() => setCancellingMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Envio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar o envio desta mensagem? 
              O cliente não receberá este {cancellingMessage?.type === "reminder" ? "lembrete" : "aviso pré-atendimento"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancellingMessage && cancelMessage.mutate(cancellingMessage)}
              className="bg-destructive text-destructive-foreground"
            >
              Cancelar Envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
