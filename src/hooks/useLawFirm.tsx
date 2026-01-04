import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BusinessHours {
  monday: { enabled: boolean; start: string; end: string };
  tuesday: { enabled: boolean; start: string; end: string };
  wednesday: { enabled: boolean; start: string; end: string };
  thursday: { enabled: boolean; start: string; end: string };
  friday: { enabled: boolean; start: string; end: string };
  saturday: { enabled: boolean; start: string; end: string };
  sunday: { enabled: boolean; start: string; end: string };
}

export interface LawFirm {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phone2?: string | null;
  document: string | null;
  address: string | null;
  logo_url: string | null;
  oab_number: string | null;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  business_hours: BusinessHours | null;
  created_at: string;
  updated_at: string;
}

export function useLawFirm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lawFirm, isLoading } = useQuery({
    queryKey: ["law_firm"],
    queryFn: async () => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) return null;

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) return null;

      const { data, error } = await supabase
        .from("law_firms")
        .select("*")
        .eq("id", userProfile.law_firm_id)
        .single();

      if (error) throw error;
      return data as unknown as LawFirm;
    },
  });

  const updateLawFirm = useMutation({
    mutationFn: async (updates: Partial<LawFirm>) => {
      if (!lawFirm) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("law_firms")
        .update(updates as any)
        .eq("id", lawFirm.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law_firm"] });
      toast({ title: "Empresa atualizada" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar empresa", description: error.message, variant: "destructive" });
    },
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!lawFirm) throw new Error("Empresa não encontrada");

      const fileExt = file.name.split(".").pop();
      const fileName = `${lawFirm.id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("law_firms")
        .update({ logo_url: urlData.publicUrl })
        .eq("id", lawFirm.id);

      if (updateError) throw updateError;

      return urlData.publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law_firm"] });
      toast({ title: "Logo atualizado com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao fazer upload do logo", description: error.message, variant: "destructive" });
    },
  });

  return {
    lawFirm,
    isLoading,
    updateLawFirm,
    uploadLogo,
  };
}
