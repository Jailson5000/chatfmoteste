import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

export interface AgendaProProfessional {
  id: string;
  law_firm_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  specialty: string | null;
  bio: string | null;
  avatar_url: string | null;
  color: string;
  is_active: boolean;
  position: number;
  notify_new_appointment: boolean;
  notify_cancellation: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  services?: { id: string; name: string }[];
  working_hours?: AgendaProWorkingHour[];
}

export type DeleteAction = 'transfer' | 'delete_all';

export interface DeleteProfessionalOptions {
  id: string;
  action: DeleteAction;
  transferToId?: string;
}

export interface AgendaProWorkingHour {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

export interface AgendaProBreak {
  id: string;
  professional_id: string;
  name: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null;
}

export interface AgendaProTimeOff {
  id: string;
  professional_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_all_day: boolean;
  start_time: string | null;
  end_time: string | null;
}

export function useAgendaProProfessionals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch professionals
  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ["agenda-pro-professionals", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("agenda_pro_professionals")
        .select(`
          *,
          agenda_pro_service_professionals(
            service:agenda_pro_services(id, name)
          ),
          agenda_pro_working_hours(*)
        `)
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (error) throw error;

      return (data || []).map((p: any) => ({
        ...p,
        services: p.agenda_pro_service_professionals?.map((sp: any) => sp.service).filter(Boolean) || [],
        working_hours: p.agenda_pro_working_hours || [],
      })) as AgendaProProfessional[];
    },
    enabled: !!lawFirm?.id,
  });

  // Create professional
  const createProfessional = useMutation({
    mutationFn: async (data: Partial<AgendaProProfessional> & { service_ids?: string[] }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { service_ids } = data;

      const insertData = {
        law_firm_id: lawFirm.id,
        name: data.name || '',
        email: data.email || null,
        phone: data.phone || null,
        document: data.document || null,
        specialty: data.specialty || null,
        bio: data.bio || null,
        avatar_url: data.avatar_url || null,
        color: data.color || '#6366f1',
        is_active: data.is_active ?? true,
        position: data.position || 0,
        notify_new_appointment: data.notify_new_appointment ?? true,
        notify_cancellation: data.notify_cancellation ?? true,
      };

      const { data: professional, error } = await supabase
        .from("agenda_pro_professionals")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Create default working hours
      const defaultHours = [1, 2, 3, 4, 5].map((day) => ({
        professional_id: professional.id,
        day_of_week: day,
        start_time: "08:00",
        end_time: "18:00",
        is_enabled: true,
      }));

      await supabase.from("agenda_pro_working_hours").insert(defaultHours);

      // Link services
      if (service_ids && service_ids.length > 0) {
        const serviceLinks = service_ids.map((serviceId) => ({
          professional_id: professional.id,
          service_id: serviceId,
        }));
        await supabase.from("agenda_pro_service_professionals").insert(serviceLinks);
      }

      return professional;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-professionals"] });
      toast({ title: "Profissional criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    },
  });

  // Update professional
  const updateProfessional = useMutation({
    mutationFn: async ({ id, service_ids, ...updates }: Partial<AgendaProProfessional> & { id: string; service_ids?: string[] }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_professionals")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Update service links
      if (service_ids !== undefined) {
        await supabase.from("agenda_pro_service_professionals").delete().eq("professional_id", id);
        
        if (service_ids.length > 0) {
          const serviceLinks = service_ids.map((serviceId) => ({
            professional_id: id,
            service_id: serviceId,
          }));
          await supabase.from("agenda_pro_service_professionals").insert(serviceLinks);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-professionals"] });
      toast({ title: "Profissional atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Get appointment count for a professional
  const getAppointmentCount = async (professionalId: string): Promise<number> => {
    if (!lawFirm?.id) return 0;
    
    const { count, error } = await supabase
      .from("agenda_pro_appointments")
      .select("id", { count: 'exact', head: true })
      .eq("professional_id", professionalId)
      .eq("law_firm_id", lawFirm.id);
    
    return error ? 0 : (count || 0);
  };

  // Delete professional with options for handling appointments
  const deleteProfessionalWithOptions = useMutation({
    mutationFn: async ({ id, action, transferToId }: DeleteProfessionalOptions) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      if (action === 'transfer') {
        if (!transferToId) {
          throw new Error("Selecione um profissional para transferir os agendamentos");
        }
        // Transfer appointments to another professional
        const { error: transferError } = await supabase
          .from("agenda_pro_appointments")
          .update({ professional_id: transferToId })
          .eq("professional_id", id)
          .eq("law_firm_id", lawFirm.id);
        
        if (transferError) throw transferError;
      } else if (action === 'delete_all') {
        // Get appointment IDs first
        const { data: appointmentIds } = await supabase
          .from("agenda_pro_appointments")
          .select("id")
          .eq("professional_id", id)
          .eq("law_firm_id", lawFirm.id);

        if (appointmentIds && appointmentIds.length > 0) {
          const ids = appointmentIds.map(a => a.id);
          
          // Delete related scheduled messages first
          await supabase
            .from("agenda_pro_scheduled_messages")
            .delete()
            .in("appointment_id", ids);

          // Delete all appointments
          const { error: deleteApptError } = await supabase
            .from("agenda_pro_appointments")
            .delete()
            .in("id", ids);
          
          if (deleteApptError) throw deleteApptError;
        }
      }

      // Now delete the professional
      const { error } = await supabase
        .from("agenda_pro_professionals")
        .delete()
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id);
      
      if (error) {
        if (error.message.includes('violates foreign key constraint')) {
          throw new Error(
            "Não foi possível excluir o profissional. " +
            "Verifique se há dados vinculados que impedem a exclusão."
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-professionals"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-appointments"] });
      toast({ title: "Profissional removido com sucesso" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao remover profissional", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Update working hours
  const updateWorkingHours = useMutation({
    mutationFn: async ({ professionalId, hours }: { professionalId: string; hours: AgendaProWorkingHour[] }) => {
      // Delete existing
      await supabase.from("agenda_pro_working_hours").delete().eq("professional_id", professionalId);

      // Insert new
      if (hours.length > 0) {
        const { error } = await supabase.from("agenda_pro_working_hours").insert(
          hours.map((h) => ({
            professional_id: professionalId,
            day_of_week: h.day_of_week,
            start_time: h.start_time,
            end_time: h.end_time,
            is_enabled: h.is_enabled,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-professionals"] });
      toast({ title: "Horários atualizados" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar horários", description: error.message, variant: "destructive" });
    },
  });

  return {
    professionals,
    activeProfessionals: professionals.filter((p) => p.is_active),
    isLoading,
    createProfessional,
    updateProfessional,
    deleteProfessionalWithOptions,
    getAppointmentCount,
    updateWorkingHours,
  };
}
