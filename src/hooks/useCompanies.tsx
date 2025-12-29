import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Company {
  id: string;
  law_firm_id: string | null;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  plan_id: string | null;
  status: string;
  max_users: number;
  max_instances: number;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
  plan?: {
    id: string;
    name: string;
    price: number;
  } | null;
}

interface CreateCompanyData {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  plan_id?: string;
  max_users?: number;
  max_instances?: number;
}

export function useCompanies() {
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(`
          *,
          plan:plans(id, name, price)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Company[];
    },
  });

  const createCompany = useMutation({
    mutationFn: async (companyData: CreateCompanyData) => {
      // First create a law_firm
      const { data: lawFirm, error: lawFirmError } = await supabase
        .from("law_firms")
        .insert({ name: companyData.name, email: companyData.email, phone: companyData.phone, document: companyData.document })
        .select()
        .single();

      if (lawFirmError) throw lawFirmError;

      // Then create the company linked to the law_firm
      const { data, error } = await supabase
        .from("companies")
        .insert({
          ...companyData,
          law_firm_id: lawFirm.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa criada com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao criar empresa: " + error.message);
    },
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<CreateCompanyData>) => {
      const { error } = await supabase
        .from("companies")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa atualizada com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar empresa: " + error.message);
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa excluída com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao excluir empresa: " + error.message);
    },
  });

  return {
    companies,
    isLoading,
    createCompany,
    updateCompany,
    deleteCompany,
  };
}
