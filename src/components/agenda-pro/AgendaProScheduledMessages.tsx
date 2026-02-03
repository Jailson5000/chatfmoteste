import { useState } from "react";
import { format, parseISO, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, MessageSquare, Clock, User, Pencil, XCircle, Send, CalendarClock, Plus, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduledMessageDialog } from "./ScheduledMessageDialog";

interface ScheduledMessage {
  id: string;
  appointment_id: string | null;
  client_id: string | null;
  type: "reminder" | "pre_message" | "confirmation" | "custom" | "birthday" | "reminder_2";
  scheduled_for: string;
  message_content: string | null;
  status: "pending" | "sent" | "cancelled";
  channel: string;
  sent_at?: string | null;
  appointment?: {
    id: string;
    start_time: string;
    client_name: string | null;
    client_phone: string | null;
    status: string;
    agenda_pro_clients: { name: string; phone: string } | null;
    agenda_pro_services: { name: string; pre_message_text: string | null } | null;
    agenda_pro_professionals: { name: string } | null;
  };
  client?: {
    name: string;
    phone: string | null;
  } | null;
}

export function AgendaProScheduledMessages() {
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [cancellingMessage, setCancellingMessage] = useState<ScheduledMessage | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch custom scheduled messages from new table
  const { data: customMessages = [], isLoading: loadingCustom } = useQuery({
    queryKey: ["agenda-pro-custom-messages", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("agenda_pro_scheduled_messages")
        .select(`
          *,
          agenda_pro_clients(name, phone),
          agenda_pro_appointments(
            id,
            start_time,
            client_name,
            client_phone,
            status,
            agenda_pro_services(name),
            agenda_pro_professionals(name)
          )
        `)
        .eq("law_firm_id", lawFirm.id)
        .eq("status", "pending")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true });

      if (error) throw error;

      return (data || []).map((msg: any) => ({
        id: msg.id,
        appointment_id: msg.appointment_id,
        client_id: msg.client_id,
        type: msg.message_type as any,
        scheduled_for: msg.scheduled_at,
        message_content: msg.message_content,
        status: msg.status,
        channel: msg.channel,
        client: msg.agenda_pro_clients,
        appointment: msg.agenda_pro_appointments,
      }));
    },
    enabled: !!lawFirm?.id,
  });

  // Fetch sent messages count (always runs for tab badge)
  const { data: sentMessagesCount = 0 } = useQuery({
    queryKey: ["agenda-pro-sent-messages-count", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return 0;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { count, error } = await supabase
        .from("agenda_pro_scheduled_messages")
        .select("*", { count: "exact", head: true })
        .eq("law_firm_id", lawFirm.id)
        .eq("status", "sent")
        .gte("sent_at", sevenDaysAgo.toISOString());

      if (error) throw error;
      return count || 0;
    },
    enabled: !!lawFirm?.id,
  });

  // Fetch sent messages from last 7 days (lazy load on tab switch)
  const { data: sentMessages = [], isLoading: loadingSent } = useQuery({
    queryKey: ["agenda-pro-sent-messages", lawFirm?.id, activeTab],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from("agenda_pro_scheduled_messages")
        .select(`
          *,
          agenda_pro_clients(name, phone),
          agenda_pro_appointments(
            id,
            start_time,
            client_name,
            client_phone,
            status,
            agenda_pro_services(name),
            agenda_pro_professionals(name)
          )
        `)
        .eq("law_firm_id", lawFirm.id)
        .eq("status", "sent")
        .gte("sent_at", sevenDaysAgo.toISOString())
        .order("sent_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((msg: any) => ({
        id: msg.id,
        appointment_id: msg.appointment_id,
        client_id: msg.client_id,
        type: msg.message_type as any,
        scheduled_for: msg.scheduled_at,
        message_content: msg.message_content,
        status: msg.status,
        channel: msg.channel,
        sent_at: msg.sent_at,
        client: msg.agenda_pro_clients,
        appointment: msg.agenda_pro_appointments,
      }));
    },
    enabled: !!lawFirm?.id && activeTab === "sent",
  });

  // Fetch auto-generated messages from appointments
  const { data: autoMessages = [], isLoading: loadingAuto } = useQuery({
    queryKey: ["agenda-pro-scheduled-messages", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

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
              client_id: null,
              type: "reminder",
              scheduled_for: reminderTime.toISOString(),
              message_content: null,
              status: "pending",
              channel: "whatsapp",
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
              client_id: null,
              type: "pre_message",
              scheduled_for: preMessageTime.toISOString(),
              message_content: service.pre_message_text,
              status: "pending",
              channel: "whatsapp",
              appointment: apt,
            });
          }
        }
      });

      return scheduledMessages.sort((a, b) => 
        new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
    },
    enabled: !!lawFirm?.id,
    refetchInterval: 60000,
  });

  // Combine all pending messages
  const allMessages = [...customMessages, ...autoMessages].sort((a, b) =>
    new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
  );

  const isLoading = loadingCustom || loadingAuto || (activeTab === "sent" && loadingSent);
  const pendingMessages = allMessages.filter(m => m.status === "pending");

  // Cancel a scheduled message
  const cancelMessage = useMutation({
    mutationFn: async (message: ScheduledMessage) => {
      // Check if it's a custom message or auto-generated
      if (message.id.includes("_reminder") || message.id.includes("_pre_message")) {
        // Auto-generated: mark as sent (skipped)
        const field = message.type === "reminder" ? "reminder_sent_at" : "pre_message_sent_at";
        const { error } = await supabase
          .from("agenda_pro_appointments")
          .update({ [field]: new Date().toISOString() })
          .eq("id", message.appointment_id);
        if (error) throw error;
      } else {
        // Custom message: update status
        const { error } = await supabase
          .from("agenda_pro_scheduled_messages")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", message.id)
          .eq("law_firm_id", lawFirm?.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-custom-messages"] });
      toast({ title: "Mensagem cancelada" });
      setCancellingMessage(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  // Save custom message
  const saveMessage = useMutation({
    mutationFn: async (message: any) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      if (message.id && !message.id.includes("_")) {
        // Update existing custom message
        const { error } = await supabase
          .from("agenda_pro_scheduled_messages")
          .update({
            message_content: message.message_content,
            scheduled_at: message.scheduled_at,
            message_type: message.message_type,
            channel: message.channel,
            client_id: message.client_id,
          })
          .eq("id", message.id)
          .eq("law_firm_id", lawFirm.id);
        if (error) throw error;
      } else {
        // Create new custom message
        const { error } = await supabase
          .from("agenda_pro_scheduled_messages")
          .insert({
            law_firm_id: lawFirm.id,
            message_content: message.message_content,
            scheduled_at: message.scheduled_at,
            message_type: message.message_type,
            channel: message.channel,
            client_id: message.client_id,
            appointment_id: message.appointment_id || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-custom-messages"] });
      toast({ title: "Mensagem salva" });
      setShowNewDialog(false);
      setEditingMessage(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-custom-messages"] });
      toast({ title: "Mensagem enviada" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "reminder": return "Lembrete 24h";
      case "reminder_2": return "Lembrete 2";
      case "pre_message": return "Pré-atendimento";
      case "confirmation": return "Confirmação";
      case "birthday": return "Aniversário";
      case "custom": return "Personalizada";
      default: return type;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "reminder": return "bg-blue-500/10 text-blue-500";
      case "reminder_2": return "bg-indigo-500/10 text-indigo-500";
      case "pre_message": return "bg-purple-500/10 text-purple-500";
      case "confirmation": return "bg-green-500/10 text-green-500";
      case "birthday": return "bg-pink-500/10 text-pink-500";
      case "custom": return "bg-orange-500/10 text-orange-500";
      default: return "";
    }
  };

  const canSendNow = (message: ScheduledMessage) => {
    // reminder_2 é gerado automaticamente pelo cron e não suporta envio manual
    if (message.type === "reminder_2") return false;
    // Mensagens com appointment_id e tipos suportados podem ser enviadas
    return !!message.appointment_id && ["reminder", "pre_message"].includes(message.type);
  };

  const isCustomMessage = (message: ScheduledMessage) => {
    return !message.id.includes("_reminder") && !message.id.includes("_pre_message");
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
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowNewDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Mensagem
          </Button>
          <Badge variant="outline" className="text-lg px-3 py-1">
            {pendingMessages.length} pendente{pendingMessages.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendentes ({pendingMessages.length})
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Enviadas ({sentMessagesCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingMessages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium">Nenhuma mensagem pendente</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  As mensagens agendadas aparecerão aqui
                </p>
                <Button variant="outline" onClick={() => setShowNewDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Criar Mensagem
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingMessages.map((message) => {
                const apt = message.appointment;
                const clientName = apt?.agenda_pro_clients?.name || apt?.client_name || message.client?.name || "Cliente";
                const clientPhone = apt?.agenda_pro_clients?.phone || apt?.client_phone || message.client?.phone || "";
                const serviceName = apt?.agenda_pro_services?.name || "Serviço";
                const professionalName = apt?.agenda_pro_professionals?.name;

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
                            <Badge variant="secondary" className="text-xs">
                              {message.channel === "whatsapp" ? "WhatsApp" : "E-mail"}
                            </Badge>
                          </div>

                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{clientName}</span>
                              {clientPhone && <span className="text-muted-foreground">{clientPhone}</span>}
                            </div>
                            {apt && (
                              <div className="text-muted-foreground">
                                {serviceName} • {format(parseISO(apt.start_time), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                {professionalName && ` • ${professionalName}`}
                              </div>
                            )}
                          </div>

                          {message.message_content && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              <p className="text-muted-foreground text-xs mb-1">Mensagem:</p>
                              <p className="line-clamp-2">{message.message_content}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {canSendNow(message) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => sendNow.mutate(message)}
                              disabled={sendNow.isPending}
                              title="Enviar agora"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {isCustomMessage(message) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingMessage(message)}
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

        <TabsContent value="sent" className="mt-4">
          {loadingSent ? (
            <div className="flex items-center justify-center h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : sentMessages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium">Nenhuma mensagem enviada</h3>
                <p className="text-sm text-muted-foreground">
                  Mensagens enviadas nos últimos 7 dias aparecerão aqui
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sentMessages.map((message) => {
                const apt = message.appointment;
                const clientName = apt?.agenda_pro_clients?.name || apt?.client_name || message.client?.name || "Cliente";
                const clientPhone = apt?.agenda_pro_clients?.phone || apt?.client_phone || message.client?.phone || "";
                const serviceName = apt?.agenda_pro_services?.name || "Serviço";
                const professionalName = apt?.agenda_pro_professionals?.name;

                return (
                  <Card key={message.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              ✓ Enviada
                            </Badge>
                            <Badge className={getTypeBadgeColor(message.type)}>
                              {getTypeLabel(message.type)}
                            </Badge>
                            {message.sent_at && (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {format(parseISO(message.sent_at), "dd/MM HH:mm", { locale: ptBR })}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {message.channel === "whatsapp" ? "WhatsApp" : "E-mail"}
                            </Badge>
                          </div>

                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{clientName}</span>
                              {clientPhone && <span className="text-muted-foreground">{clientPhone}</span>}
                            </div>
                            {apt && (
                              <div className="text-muted-foreground">
                                {serviceName} • {format(parseISO(apt.start_time), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                {professionalName && ` • ${professionalName}`}
                              </div>
                            )}
                          </div>

                          {message.message_content && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              <p className="text-muted-foreground text-xs mb-1">Mensagem:</p>
                              <p className="line-clamp-2">{message.message_content}</p>
                            </div>
                          )}
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

      {/* New/Edit Message Dialog */}
      <ScheduledMessageDialog
        open={showNewDialog || !!editingMessage}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewDialog(false);
            setEditingMessage(null);
          }
        }}
        message={editingMessage ? {
          id: editingMessage.id,
          appointment_id: editingMessage.appointment_id,
          client_id: editingMessage.client_id,
          message_type: editingMessage.type,
          message_content: editingMessage.message_content || "",
          scheduled_at: editingMessage.scheduled_for,
          channel: editingMessage.channel,
        } : null}
        onSave={async (msg) => {
          await saveMessage.mutateAsync(msg);
        }}
        isSaving={saveMessage.isPending}
      />

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancellingMessage} onOpenChange={() => setCancellingMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Envio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar o envio desta mensagem? 
              O cliente não receberá este {getTypeLabel(cancellingMessage?.type || "")}.
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
