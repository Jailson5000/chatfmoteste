import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

// Types
export interface AgendaProSettings {
  id: string;
  law_firm_id: string;
  is_enabled: boolean;
  business_name: string | null;
  business_description: string | null;
  logo_url: string | null;
  primary_color: string;
  min_advance_hours: number;
  max_advance_days: number;
  min_gap_between_appointments: number;
  max_daily_appointments: number | null;
  block_holidays: boolean;
  require_confirmation: boolean;
  confirmation_deadline_hours: number;
  default_start_time: string;
  default_end_time: string;
  timezone: string;
  public_slug: string | null;
  public_booking_enabled: boolean;
  confirmation_message_template: string;
  reminder_message_template: string;
  cancellation_message_template: string;
  send_whatsapp_confirmation: boolean;
  send_email_confirmation: boolean;
  send_sms_confirmation: boolean;
  reminder_hours_before: number;
  // Second reminder fields
  reminder_2_enabled: boolean;
  reminder_2_value: number;
  reminder_2_unit: "minutes" | "hours";
  respect_business_hours: boolean;
  // Birthday fields
  birthday_enabled: boolean;
  birthday_message_template: string;
  birthday_include_coupon: boolean;
  birthday_coupon_type: "discount" | "service";
  birthday_coupon_value: number;
  birthday_coupon_service_id: string | null;
  birthday_send_time: string;
  // Weekend fields
  saturday_enabled: boolean;
  saturday_start_time: string;
  saturday_end_time: string;
  sunday_enabled: boolean;
  sunday_start_time: string;
  sunday_end_time: string;
  whatsapp_instance_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useAgendaPro() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["agenda-pro-settings", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("agenda_pro_settings")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) throw error;
      return data as AgendaProSettings | null;
    },
    enabled: !!lawFirm?.id,
  });

  // Enable Agenda Pro
  const enableAgendaPro = useMutation({
    mutationFn: async () => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      // Check if settings exist
      const { data: existing } = await supabase
        .from("agenda_pro_settings")
        .select("id")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from("agenda_pro_settings")
          .update({ is_enabled: true })
          .eq("law_firm_id", lawFirm.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("agenda_pro_settings")
          .insert({
            law_firm_id: lawFirm.id,
            is_enabled: true,
            business_name: lawFirm.name,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-settings"] });
      toast({ title: "Agenda Pro ativada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao ativar Agenda Pro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disable Agenda Pro
  const disableAgendaPro = useMutation({
    mutationFn: async () => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_settings")
        .update({ is_enabled: false })
        .eq("law_firm_id", lawFirm.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-settings"] });
      toast({ title: "Agenda Pro desativada" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desativar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update settings
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<AgendaProSettings>) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_settings")
        .update(updates)
        .eq("law_firm_id", lawFirm.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-settings"] });
      toast({ title: "Configurações salvas" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings,
    isLoading,
    isEnabled: settings?.is_enabled ?? false,
    enableAgendaPro,
    disableAgendaPro,
    updateSettings,
  };
}
