import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useEffect } from "react";

export interface AgendaProAppointment {
  id: string;
  law_firm_id: string;
  client_id: string | null;
  professional_id: string;
  service_id: string;
  resource_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  confirmed_at: string | null;
  confirmed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  internal_notes: string | null;
  source: 'manual' | 'public_booking' | 'whatsapp' | 'phone' | 'api';
  is_recurring: boolean;
  recurrence_rule: string | null;
  parent_appointment_id: string | null;
  price: number | null;
  is_paid: boolean;
  payment_method: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  pre_message_sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  client?: { id: string; name: string; phone: string | null } | null;
  professional?: { id: string; name: string; color: string } | null;
  service?: { id: string; name: string; color: string; duration_minutes: number } | null;
  resource?: { id: string; name: string } | null;
}

export type ViewType = 'day' | 'week' | 'month';

export function useAgendaProAppointments(options?: {
  date?: Date;
  view?: ViewType;
  professionalId?: string;
  resourceId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const { date = new Date(), view = 'week', professionalId, resourceId } = options || {};

  // Calculate date range
  const getDateRange = () => {
    switch (view) {
      case 'day':
        return { start: startOfDay(date), end: endOfDay(date) };
      case 'week':
        return { start: startOfWeek(date, { weekStartsOn: 0 }), end: endOfWeek(date, { weekStartsOn: 0 }) };
      case 'month':
        return { start: startOfMonth(date), end: endOfMonth(date) };
      default:
        return { start: startOfDay(date), end: endOfDay(date) };
    }
  };

  const { start, end } = getDateRange();

  // Fetch appointments
  const { data: appointments = [], isLoading, refetch } = useQuery({
    queryKey: ["agenda-pro-appointments", lawFirm?.id, format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'), professionalId, resourceId],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      let query = supabase
        .from("agenda_pro_appointments")
        .select(`
          *,
          client:agenda_pro_clients(id, name, phone),
          professional:agenda_pro_professionals(id, name, color),
          service:agenda_pro_services(id, name, color, duration_minutes),
          resource:agenda_pro_resources(id, name)
        `)
        .eq("law_firm_id", lawFirm.id)
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time", { ascending: true });

      if (professionalId) {
        query = query.eq("professional_id", professionalId);
      }

      if (resourceId) {
        query = query.eq("resource_id", resourceId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AgendaProAppointment[];
    },
    enabled: !!lawFirm?.id,
  });

  // Real-time subscription removed - now handled by centralized useRealtimeSync

  // Helper to log activity
  const logActivity = async (appointmentId: string, action: string, details?: Record<string, any>) => {
    if (!lawFirm?.id) return;
    const { data: user } = await supabase.auth.getUser();
    
    await supabase.from("agenda_pro_activity_log").insert({
      law_firm_id: lawFirm.id,
      appointment_id: appointmentId,
      user_id: user.user?.id || null,
      action,
      details: details || null,
    });
  };

  // Create appointment
  const createAppointment = useMutation({
    mutationFn: async (data: Partial<AgendaProAppointment>) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data: user } = await supabase.auth.getUser();

      // Build insert object without spreading interface
      const insertData = {
        law_firm_id: lawFirm.id,
        professional_id: data.professional_id!,
        service_id: data.service_id!,
        start_time: data.start_time!,
        end_time: data.end_time!,
        duration_minutes: data.duration_minutes!,
        client_id: data.client_id || null,
        resource_id: data.resource_id || null,
        client_name: data.client_name || null,
        client_phone: data.client_phone || null,
        client_email: data.client_email || null,
        status: data.status || 'scheduled',
        notes: data.notes || null,
        internal_notes: data.internal_notes || null,
        source: data.source || 'manual',
        price: data.price || null,
        created_by: user.user?.id || null,
      };

      const { data: appointment, error } = await supabase
        .from("agenda_pro_appointments")
        .insert(insertData)
        .select(`
          *,
          client:agenda_pro_clients(id, name, phone),
          professional:agenda_pro_professionals(id, name, color),
          service:agenda_pro_services(id, name, color, duration_minutes, pre_message_enabled, pre_message_hours_before, pre_message_text)
        `)
        .single();

      if (error) throw error;

      // Log activity
      await logActivity(appointment.id, "created", { 
        source: data.source || 'manual',
        client_name: data.client_name || appointment.client?.name 
      });

      // Create scheduled reminder messages based on settings
      try {
        const startTime = new Date(appointment.start_time);
        const now = new Date();
        
        // Get settings for reminder configuration including message template
        const { data: settings } = await supabase
          .from("agenda_pro_settings")
          .select("reminder_hours_before, reminder_2_enabled, reminder_2_value, reminder_2_unit, reminder_message_template, business_name")
          .eq("law_firm_id", lawFirm.id)
          .single();
        
        const scheduledMessages = [];
        
        // Helper function to replace variables in message template
        const formatMessage = (template: string | null, defaultMsg: string): string => {
          if (!template) return defaultMsg;
          const clientName = data.client_name || appointment.client?.name || "Cliente";
          const serviceName = (appointment.service as any)?.name || "Serviço";
          const professionalName = (appointment.professional as any)?.name || "Profissional";
          const dateStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(startTime);
          const timeStr = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(startTime);
          
          return template
            .replace(/{client_name}/g, clientName)
            .replace(/{service_name}/g, serviceName)
            .replace(/{professional_name}/g, professionalName)
            .replace(/{date}/g, dateStr)
            .replace(/{time}/g, timeStr)
            .replace(/{business_name}/g, settings?.business_name || "");
        };
        
        // Default reminder message template
        const defaultReminderTemplate = "Olá {client_name}! 👋 Lembramos que você tem um agendamento de {service_name} no dia {date} às {time}. Confirme sua presença!";
        
        // First reminder (configurable hours)
        const reminder1Hours = settings?.reminder_hours_before || 24;
        const reminderTime = new Date(startTime.getTime() - reminder1Hours * 60 * 60 * 1000);
        
        if (reminderTime > now) {
          scheduledMessages.push({
            law_firm_id: lawFirm.id,
            appointment_id: appointment.id,
            client_id: appointment.client_id,
            message_type: "reminder",
            message_content: formatMessage(settings?.reminder_message_template, defaultReminderTemplate),
            scheduled_at: reminderTime.toISOString(),
            channel: "whatsapp",
            status: "pending",
          });
        }

        // Second reminder (configurable)
        if (settings?.reminder_2_enabled && settings?.reminder_2_value) {
          const reminder2Minutes = settings.reminder_2_unit === 'hours' 
            ? settings.reminder_2_value * 60 
            : settings.reminder_2_value;
          const reminder2Time = new Date(startTime.getTime() - reminder2Minutes * 60 * 1000);
          
          if (reminder2Time > now) {
            scheduledMessages.push({
              law_firm_id: lawFirm.id,
              appointment_id: appointment.id,
              client_id: appointment.client_id,
              message_type: "reminder_2",
              message_content: formatMessage(settings?.reminder_message_template, defaultReminderTemplate),
              scheduled_at: reminder2Time.toISOString(),
              channel: "whatsapp",
              status: "pending",
            });
          }
        }

        // Create pre-message if service has it enabled
        const service = appointment.service as any;
        if (service?.pre_message_enabled && service?.pre_message_hours_before) {
          const preMessageTime = new Date(startTime.getTime() - (service.pre_message_hours_before * 60 * 60 * 1000));
          
          if (preMessageTime > now) {
            scheduledMessages.push({
              law_firm_id: lawFirm.id,
              appointment_id: appointment.id,
              client_id: appointment.client_id,
              message_type: "pre_message",
              message_content: formatMessage(service.pre_message_text, "Mensagem pré-atendimento"),
              scheduled_at: preMessageTime.toISOString(),
              channel: "whatsapp",
              status: "pending",
            });
          }
        }

        // Insert all scheduled messages at once
        if (scheduledMessages.length > 0) {
          await supabase.from("agenda_pro_scheduled_messages").insert(scheduledMessages);
        }
      } catch (msgError) {
        console.error("Error creating scheduled messages:", msgError);
      }

      // Send notification
      try {
        await supabase.functions.invoke("agenda-pro-notification", {
          body: { appointment_id: appointment.id, type: "created" }
        });
      } catch (notifError) {
        console.error("Notification error:", notifError);
      }

      return appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-clients"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-custom-messages"] });
      toast({ title: "Agendamento criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar agendamento", description: error.message, variant: "destructive" });
    },
  });

  // Update appointment
  const updateAppointment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgendaProAppointment> & { id: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select(`
          *,
          client:agenda_pro_clients(id, name, phone),
          professional:agenda_pro_professionals(id, name, color),
          service:agenda_pro_services(id, name, color, duration_minutes)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      toast({ title: "Agendamento atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Cancel appointment
  const cancelAppointment = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.user?.email || 'system',
          cancellation_reason: reason,
        })
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Cancel all pending scheduled messages for this appointment
      try {
        await supabase
          .from("agenda_pro_scheduled_messages")
          .update({ 
            status: "cancelled", 
            cancelled_at: new Date().toISOString() 
          })
          .eq("appointment_id", id)
          .eq("status", "pending")
          .eq("law_firm_id", lawFirm.id);
      } catch (msgError) {
        console.error("Error cancelling scheduled messages:", msgError);
      }

      // Log activity
      await logActivity(id, "cancelled", { reason, source: "manual" });

      // Send cancellation notification
      try {
        await supabase.functions.invoke("agenda-pro-notification", {
          body: { appointment_id: id, type: "cancelled" }
        });
      } catch (notifError) {
        console.error("Cancellation notification error:", notifError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-custom-messages"] });
      toast({ title: "Agendamento cancelado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  // Confirm appointment
  const confirmAppointment = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.user?.email || 'system',
        })
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await logActivity(id, "confirmed_manual", { source: "manual" });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      toast({ title: "Agendamento confirmado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao confirmar", description: error.message, variant: "destructive" });
    },
  });

  // Complete appointment
  const completeAppointment = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await logActivity(id, "completed", { source: "manual" });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      toast({ title: "Atendimento concluído" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao concluir", description: error.message, variant: "destructive" });
    },
  });

  // Mark as no-show
  const markNoShow = useMutation({
    mutationFn: async ({ id, sendRescheduleMessage = true }: { id: string; sendRescheduleMessage?: boolean }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .update({ status: 'no_show' })
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await logActivity(id, "no_show", { source: "manual" });

      // Send reschedule message to client
      if (sendRescheduleMessage) {
        try {
          await supabase.functions.invoke("agenda-pro-notification", {
            body: { appointment_id: id, type: "no_show" }
          });
        } catch (notifError) {
          console.error("No-show notification error:", notifError);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-clients"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      toast({ title: "Marcado como falta", description: "Mensagem de reagendamento enviada ao cliente" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  // Reschedule appointment
  const rescheduleAppointment = useMutation({
    mutationFn: async ({ id, start_time, end_time }: { id: string; start_time: string; end_time: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      const { data: user } = await supabase.auth.getUser();

      // Generate new confirmation token
      const newToken = crypto.randomUUID();

      // First, get the appointment to know service details
      const { data: existingAppointment } = await supabase
        .from("agenda_pro_appointments")
        .select(`
          *,
          service:agenda_pro_services(pre_message_enabled, pre_message_hours_before, pre_message_text)
        `)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id)
        .single();

      const { data, error } = await supabase
        .from("agenda_pro_appointments")
        .update({
          start_time,
          end_time,
          status: 'scheduled',
          confirmation_token: newToken,
          confirmed_at: null,
          confirmed_by: null,
          reminder_sent_at: null,
          pre_message_sent_at: null,
          confirmation_sent_at: null,
        })
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Update scheduled messages with new times
      try {
        const newStartTime = new Date(start_time);
        
        // Cancel old pending messages
        await supabase
          .from("agenda_pro_scheduled_messages")
          .update({ 
            status: "cancelled", 
            cancelled_at: new Date().toISOString() 
          })
          .eq("appointment_id", id)
          .eq("status", "pending")
          .eq("law_firm_id", lawFirm.id);

        // Create new reminder (24h before)
        const reminderTime = new Date(newStartTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminderTime > new Date()) {
          await supabase.from("agenda_pro_scheduled_messages").insert({
            law_firm_id: lawFirm.id,
            appointment_id: id,
            client_id: existingAppointment?.client_id,
            message_type: "reminder",
            message_content: "Lembrete automático de 24h (reagendado)",
            scheduled_at: reminderTime.toISOString(),
            channel: "whatsapp",
            status: "pending",
          });
        }

        // Create new pre-message if service has it enabled
        const service = existingAppointment?.service as any;
        if (service?.pre_message_enabled && service?.pre_message_hours_before) {
          const preMessageTime = new Date(newStartTime.getTime() - (service.pre_message_hours_before * 60 * 60 * 1000));
          
          if (preMessageTime > new Date()) {
            await supabase.from("agenda_pro_scheduled_messages").insert({
              law_firm_id: lawFirm.id,
              appointment_id: id,
              client_id: existingAppointment?.client_id,
              message_type: "pre_message",
              message_content: service.pre_message_text || "Mensagem pré-atendimento",
              scheduled_at: preMessageTime.toISOString(),
              channel: "whatsapp",
              status: "pending",
            });
          }
        }
      } catch (msgError) {
        console.error("Error updating scheduled messages:", msgError);
      }

      // Log activity
      await logActivity(id, "rescheduled", { 
        source: "manual", 
        new_start_time: start_time,
        rescheduled_by: user.user?.email 
      });

      // Send notification about rescheduling
      try {
        await supabase.functions.invoke("agenda-pro-notification", {
          body: { appointment_id: id, type: "updated" }
        });
      } catch (notifError) {
        console.error("Reschedule notification error:", notifError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-custom-messages"] });
      toast({ title: "Agendamento reagendado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reagendar", description: error.message, variant: "destructive" });
    },
  });

  // Cancel entire series
  const cancelSeries = useMutation({
    mutationFn: async ({ parentId, reason }: { parentId: string; reason?: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      const { data: user } = await supabase.auth.getUser();

      // Cancel parent appointment
      const { error: parentError } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.user?.email || 'system',
          cancellation_reason: reason,
        })
        .eq("id", parentId)
        .eq("law_firm_id", lawFirm.id);

      if (parentError) throw parentError;

      // Cancel all child appointments
      const { error: childError } = await supabase
        .from("agenda_pro_appointments")
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.user?.email || 'system',
          cancellation_reason: `Série cancelada: ${reason || ''}`.trim(),
        })
        .eq("parent_appointment_id", parentId)
        .eq("law_firm_id", lawFirm.id)
        .in("status", ["scheduled", "confirmed"]);

      if (childError) throw childError;

      // Cancel all scheduled messages for the series
      await supabase
        .from("agenda_pro_scheduled_messages")
        .update({ 
          status: "cancelled", 
          cancelled_at: new Date().toISOString() 
        })
        .or(`appointment_id.eq.${parentId},appointment_id.in.(select id from agenda_pro_appointments where parent_appointment_id='${parentId}')`)
        .eq("status", "pending")
        .eq("law_firm_id", lawFirm.id);

      // Log activity
      await logActivity(parentId, "series_cancelled", { reason, source: "manual" });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-scheduled-messages"] });
      toast({ title: "Série de agendamentos cancelada" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar série", description: error.message, variant: "destructive" });
    },
  });

  return {
    appointments,
    isLoading,
    refetch,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    confirmAppointment,
    completeAppointment,
    markNoShow,
    rescheduleAppointment,
    cancelSeries,
  };
}
