import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfDay, endOfDay, addMinutes, isBefore, isAfter, isEqual } from "date-fns";
import { useLawFirm, BusinessHours } from "@/hooks/useLawFirm";
import { Service } from "@/hooks/useServices";

export interface Appointment {
  id: string;
  law_firm_id: string;
  service_id: string;
  client_id: string | null;
  conversation_id: string | null;
  google_event_id: string | null;
  start_time: string;
  end_time: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  reminder_sent_at: string | null;
  confirmation_sent_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: "system" | "admin" | "client" | "ai";
  created_at: string;
  updated_at: string;
  // Joined
  service?: Service;
  client?: { id: string; name: string; phone: string };
}

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

const DAY_MAP: Record<string, keyof BusinessHours> = {
  "0": "sunday",
  "1": "monday",
  "2": "tuesday",
  "3": "wednesday",
  "4": "thursday",
  "5": "friday",
  "6": "saturday",
};

export function useAppointments(date?: Date) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", date?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*, service:services(*), client:clients(id, name, phone)")
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });

      if (date) {
        const start = startOfDay(date).toISOString();
        const end = endOfDay(date).toISOString();
        query = query.gte("start_time", start).lte("start_time", end);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Appointment[];
    },
  });

  const createAppointment = useMutation({
    mutationFn: async (appointment: Partial<Appointment>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", auth.user.id)
        .single();

      if (!profile?.law_firm_id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("appointments")
        .insert({
          service_id: appointment.service_id!,
          start_time: appointment.start_time!,
          end_time: appointment.end_time!,
          client_id: appointment.client_id,
          client_name: appointment.client_name,
          client_phone: appointment.client_phone,
          client_email: appointment.client_email,
          notes: appointment.notes,
          status: appointment.status || "scheduled",
          created_by: appointment.created_by || "admin",
          law_firm_id: profile.law_firm_id,
        })
        .select("*, service:services(*)")
        .single();

      if (error) throw error;

      // TODO: Create Google Calendar event
      // await createGoogleCalendarEvent(data);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Agendamento criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar agendamento", description: error.message, variant: "destructive" });
    },
  });

  const updateAppointment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Appointment> & { id: string }) => {
      const { data, error } = await supabase
        .from("appointments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Agendamento atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  const cancelAppointment = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Agendamento cancelado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  // Generate available time slots for a given date and service
  const getAvailableSlots = (targetDate: Date, service: Service): TimeSlot[] => {
    if (!lawFirm?.business_hours) return [];

    const dayOfWeek = targetDate.getDay().toString();
    const dayKey = DAY_MAP[dayOfWeek];
    const dayHours = lawFirm.business_hours[dayKey];

    if (!dayHours?.enabled) return [];

    const slots: TimeSlot[] = [];
    const totalDuration = service.duration_minutes + service.buffer_before_minutes + service.buffer_after_minutes;

    // Parse business hours
    const [startHour, startMin] = dayHours.start.split(":").map(Number);
    const [endHour, endMin] = dayHours.end.split(":").map(Number);

    let currentStart = new Date(targetDate);
    currentStart.setHours(startHour, startMin, 0, 0);

    const businessEnd = new Date(targetDate);
    businessEnd.setHours(endHour, endMin, 0, 0);

    // Get existing appointments for this day
    const dayAppointments = appointments.filter((apt) => {
      const aptDate = parseISO(apt.start_time);
      return (
        aptDate.getFullYear() === targetDate.getFullYear() &&
        aptDate.getMonth() === targetDate.getMonth() &&
        aptDate.getDate() === targetDate.getDate()
      );
    });

    while (addMinutes(currentStart, totalDuration) <= businessEnd) {
      const slotEnd = addMinutes(currentStart, totalDuration);

      // Check if slot conflicts with existing appointments
      const hasConflict = dayAppointments.some((apt) => {
        const aptStart = parseISO(apt.start_time);
        const aptEnd = parseISO(apt.end_time);

        // Check overlap
        return (
          (isAfter(currentStart, aptStart) && isBefore(currentStart, aptEnd)) ||
          (isAfter(slotEnd, aptStart) && isBefore(slotEnd, aptEnd)) ||
          (isBefore(currentStart, aptStart) && isAfter(slotEnd, aptEnd)) ||
          isEqual(currentStart, aptStart)
        );
      });

      // Check if slot is in the past
      const isPast = isBefore(currentStart, new Date());

      slots.push({
        start: new Date(currentStart),
        end: slotEnd,
        available: !hasConflict && !isPast,
      });

      // Move to next slot (use service duration for slot intervals)
      currentStart = addMinutes(currentStart, service.duration_minutes);
    }

    return slots;
  };

  return {
    appointments,
    isLoading,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    getAvailableSlots,
  };
}
