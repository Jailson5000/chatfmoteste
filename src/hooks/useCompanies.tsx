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
  subdomain?: string;
  // n8n workflow fields
  n8n_workflow_id: string | null;
  n8n_workflow_name: string | null;
  n8n_workflow_status: string | null;
  n8n_last_error: string | null;
  n8n_created_at: string | null;
  n8n_updated_at: string | null;
  plan?: {
    id: string;
    name: string;
    price: number;
  } | null;
  law_firm?: {
    id: string;
    subdomain: string | null;
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
  subdomain?: string;
  auto_activate_workflow?: boolean;
}

interface ProvisionResponse {
  success: boolean;
  company: Company;
  law_firm: { id: string; subdomain: string };
  subdomain: string;
  subdomain_url: string;
  automation_id?: string;
  n8n_workflow_id?: string;
  n8n_workflow_name?: string;
  message: string;
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
          plan:plans(id, name, price),
          law_firm:law_firms(id, subdomain)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Company[];
    },
  });

  const createCompany = useMutation({
    mutationFn: async (companyData: CreateCompanyData): Promise<ProvisionResponse> => {
      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Não autenticado");
      }

      // Call the provision-company edge function
      const { data, error } = await supabase.functions.invoke('provision-company', {
        body: companyData,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao criar empresa');
      
      return data as ProvisionResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa criada com sucesso", {
        description: `Subdomínio: ${data.subdomain}.miauchat.com.br`,
      });
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
    mutationFn: async (company: Company) => {
      // First, delete the n8n workflow if it exists
      if (company.n8n_workflow_id) {
        try {
          console.log('Deleting n8n workflow:', company.n8n_workflow_id);
          await supabase.functions.invoke('delete-n8n-workflow', {
            body: {
              workflow_id: company.n8n_workflow_id,
              company_id: company.id,
            },
          });
        } catch (error) {
          console.warn('Failed to delete n8n workflow:', error);
          // Continue with company deletion even if workflow deletion fails
        }
      }

      // Then delete the company
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", company.id);

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

  const retryN8nWorkflow = useMutation({
    mutationFn: async (company: Company) => {
      const { data, error } = await supabase.functions.invoke('create-n8n-workflow', {
        body: {
          company_id: company.id,
          company_name: company.name,
          law_firm_id: company.law_firm_id,
          subdomain: company.law_firm?.subdomain || '',
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao criar workflow');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Workflow n8n criado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao criar workflow: " + error.message);
    },
  });

  return {
    companies,
    isLoading,
    createCompany,
    updateCompany,
    deleteCompany,
    retryN8nWorkflow,
  };
}
