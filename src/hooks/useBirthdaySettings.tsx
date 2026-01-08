import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BirthdaySettings {
  id: string;
  law_firm_id: string;
  enabled: boolean;
  message_template: string;
  send_time: string;
  include_coupon: boolean;
  coupon_discount_percent: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_MESSAGE = `Olá {nome}! 🎂 Feliz aniversário! Desejamos um dia muito especial para você. Como presente, oferecemos um desconto especial. Entre em contato conosco!`;

export function useBirthdaySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["birthday-settings"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", auth.user.id)
        .single();

      if (!profile?.law_firm_id) return null;

      const { data, error } = await supabase
        .from("birthday_settings")
        .select("*")
        .eq("law_firm_id", profile.law_firm_id)
        .maybeSingle();

      if (error) throw error;
      return data as BirthdaySettings | null;
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (newSettings: Partial<BirthdaySettings>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", auth.user.id)
        .single();

      if (!profile?.law_firm_id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("birthday_settings")
        .upsert({
          law_firm_id: profile.law_firm_id,
          enabled: newSettings.enabled ?? false,
          message_template: newSettings.message_template || DEFAULT_MESSAGE,
          send_time: newSettings.send_time || "09:00",
          include_coupon: newSettings.include_coupon ?? false,
          coupon_discount_percent: newSettings.coupon_discount_percent || 10,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["birthday-settings"] });
      toast({ title: "Configurações salvas" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  return {
    settings,
    isLoading,
    saveSettings,
    defaultMessage: DEFAULT_MESSAGE,
  };
}
