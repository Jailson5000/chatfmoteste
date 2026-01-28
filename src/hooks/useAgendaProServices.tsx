import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

export interface AgendaProService {
  id: string;
  law_firm_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price: number | null;
  color: string;
  is_active: boolean;
  is_public: boolean;
  requires_resource: boolean;
  position: number;
  return_enabled: boolean;
  return_interval_days: number | null;
  pre_message_enabled: boolean;
  pre_message_text: string | null;
  pre_message_hours_before: number;
  created_at: string;
  updated_at: string;
  // Joined
  professionals?: { id: string; name: string }[];
  resources?: { id: string; name: string }[];
}

export function useAgendaProServices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch services
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["agenda-pro-services", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("agenda_pro_services")
        .select(`
          *,
          agenda_pro_service_professionals(
            professional:agenda_pro_professionals(id, name)
          ),
          agenda_pro_service_resources(
            resource:agenda_pro_resources(id, name)
          )
        `)
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (error) throw error;

      return (data || []).map((s: any) => ({
        ...s,
        professionals: s.agenda_pro_service_professionals?.map((sp: any) => sp.professional).filter(Boolean) || [],
        resources: s.agenda_pro_service_resources?.map((sr: any) => sr.resource).filter(Boolean) || [],
      })) as AgendaProService[];
    },
    enabled: !!lawFirm?.id,
  });

  // Create service
  const createService = useMutation({
    mutationFn: async (data: Partial<AgendaProService> & { professional_ids?: string[]; resource_ids?: string[] }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { professional_ids, resource_ids } = data;

      const insertData = {
        law_firm_id: lawFirm.id,
        name: data.name || '',
        description: data.description || null,
        duration_minutes: data.duration_minutes || 30,
        buffer_before_minutes: data.buffer_before_minutes || 0,
        buffer_after_minutes: data.buffer_after_minutes || 0,
        price: data.price || null,
        color: data.color || '#6366f1',
        is_active: data.is_active ?? true,
        is_public: data.is_public ?? true,
        requires_resource: data.requires_resource ?? false,
        position: data.position || 0,
        return_enabled: data.return_enabled ?? false,
        return_interval_days: data.return_interval_days || null,
        pre_message_enabled: data.pre_message_enabled ?? false,
        pre_message_text: data.pre_message_text || null,
        pre_message_hours_before: data.pre_message_hours_before || 2,
      };

      const { data: service, error } = await supabase
        .from("agenda_pro_services")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Link professionals
      if (professional_ids && professional_ids.length > 0) {
        const professionalLinks = professional_ids.map((profId) => ({
          service_id: service.id,
          professional_id: profId,
        }));
        await supabase.from("agenda_pro_service_professionals").insert(professionalLinks);
      }

      // Link resources
      if (resource_ids && resource_ids.length > 0) {
        const resourceLinks = resource_ids.map((resId) => ({
          service_id: service.id,
          resource_id: resId,
        }));
        await supabase.from("agenda_pro_service_resources").insert(resourceLinks);
      }

      return service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-services"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-professionals"] });
      toast({ title: "Serviço criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    },
  });

  // Update service
  const updateService = useMutation({
    mutationFn: async ({ id, professional_ids, resource_ids, ...updates }: Partial<AgendaProService> & { id: string; professional_ids?: string[]; resource_ids?: string[] }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_services")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;

      // Update professional links
      if (professional_ids !== undefined) {
        await supabase.from("agenda_pro_service_professionals").delete().eq("service_id", id);
        
        if (professional_ids.length > 0) {
          const professionalLinks = professional_ids.map((profId) => ({
            service_id: id,
            professional_id: profId,
          }));
          await supabase.from("agenda_pro_service_professionals").insert(professionalLinks);
        }
      }

      // Update resource links
      if (resource_ids !== undefined) {
        await supabase.from("agenda_pro_service_resources").delete().eq("service_id", id);
        
        if (resource_ids.length > 0) {
          const resourceLinks = resource_ids.map((resId) => ({
            service_id: id,
            resource_id: resId,
          }));
          await supabase.from("agenda_pro_service_resources").insert(resourceLinks);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-services"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-professionals"] });
      toast({ title: "Serviço atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Delete service
  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      // Check for future non-cancelled/completed appointments
      const { data: futureAppointments, error: checkError } = await supabase
        .from("agenda_pro_appointments")
        .select("id")
        .eq("service_id", id)
        .eq("law_firm_id", lawFirm.id)
        .gte("start_time", new Date().toISOString())
        .not("status", "in", '("cancelled","no_show","completed")')
        .limit(1);

      if (checkError) throw checkError;

      if (futureAppointments && futureAppointments.length > 0) {
        throw new Error(
          "Este serviço possui agendamentos futuros. " +
          "Cancele ou reagende os atendimentos antes de remover, " +
          "ou desative o serviço."
        );
      }

      const { error } = await supabase
        .from("agenda_pro_services")
        .delete()
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id);
      
      if (error) {
        // Translate FK error to friendly message
        if (error.message.includes('violates foreign key constraint')) {
          throw new Error(
            "Este serviço possui agendamentos no histórico. " +
            "Desative-o para preservar os registros."
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-services"] });
      toast({ title: "Serviço removido" });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível remover", description: error.message, variant: "destructive" });
    },
  });

  return {
    services,
    activeServices: services.filter((s) => s.is_active),
    publicServices: services.filter((s) => s.is_active && s.is_public),
    isLoading,
    createService,
    updateService,
    deleteService,
  };
}
