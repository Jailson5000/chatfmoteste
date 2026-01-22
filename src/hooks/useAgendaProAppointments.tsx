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

  // Realtime subscription
  useEffect(() => {
    if (!lawFirm?.id) return;

    const channel = supabase
      .channel('agenda-pro-appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agenda_pro_appointments',
          filter: `law_firm_id=eq.${lawFirm.id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lawFirm?.id, refetch]);

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
          service:agenda_pro_services(id, name, color, duration_minutes)
        `)
        .single();

      if (error) throw error;

      // Log activity
      await logActivity(appointment.id, "created", { 
        source: data.source || 'manual',
        client_name: data.client_name || appointment.client?.name 
      });

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
      toast({ title: "Agendamento reagendado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reagendar", description: error.message, variant: "destructive" });
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
  };
}
