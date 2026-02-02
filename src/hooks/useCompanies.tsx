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
  trial_type: 'none' | 'auto_plan' | 'manual' | null;
  trial_started_at: string | null;
  created_at: string;
  updated_at: string;
  subdomain?: string;
  // Custom limits fields
  use_custom_limits: boolean;
  max_agents: number | null;
  max_workspaces: number | null;
  max_ai_conversations: number | null;
  max_tts_minutes: number | null;
  // Provisioning status fields
  client_app_status: string;
  provisioning_status: string;
  // Health check fields
  health_status: string | null;
  last_health_check_at: string | null;
  // n8n workflow fields
  n8n_workflow_id: string | null;
  n8n_workflow_name: string | null;
  n8n_workflow_status: string | null;
  n8n_last_error: string | null;
  n8n_created_at: string | null;
  n8n_updated_at: string | null;
  n8n_retry_count: number;
  n8n_next_retry_at: string | null;
  plan?: {
    id: string;
    name: string;
    price: number;
    max_users: number;
    max_instances: number;
    max_agents: number;
    max_workspaces: number;
    max_ai_conversations: number;
    max_tts_minutes: number;
  } | null;
  law_firm?: {
    id: string;
    subdomain: string | null;
  } | null;
  // Initial access email tracking
  admin_user_id: string | null;
  initial_access_email_sent: boolean;
  initial_access_email_sent_at: string | null;
  initial_access_email_error: string | null;
  // Approval status fields
  approval_status: 'pending_approval' | 'approved' | 'rejected';
  rejection_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
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
  // Custom limits
  use_custom_limits?: boolean;
  max_agents?: number;
  max_workspaces?: number;
  max_ai_conversations?: number;
  max_tts_minutes?: number;
  // Admin user creation
  admin_email?: string;
  admin_name?: string;
}

interface ProvisionResponse {
  success: boolean;
  company: Company;
  law_firm: { id: string; subdomain: string };
  tenant_id: string;
  subdomain: string;
  subdomain_url: string;
  automation_id?: string;
  // Provisioning status
  client_app_status: string;
  n8n_workflow_status: string;
  provisioning_status: string;
  // n8n details
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
          plan:plans!companies_plan_id_fkey(id, name, price, max_users, max_instances, max_agents, max_workspaces, max_ai_conversations, max_tts_minutes),
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
      // Use the new delete-company-full Edge Function for complete deletion
      const { data, error } = await supabase.functions.invoke('delete-company-full', {
        body: {
          company_id: company.id,
          delete_users: true,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao excluir empresa');
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      const message = data.deleted_users > 0 
        ? `Empresa "${data.company_name}" excluída. ${data.deleted_users} usuário(s) removido(s).`
        : `Empresa "${data.company_name}" excluída com sucesso.`;
      toast.success(message);
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

  const runHealthCheck = useMutation({
    mutationFn: async (companyId?: string) => {
      const url = companyId 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-health-check?company_id=${companyId}`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-health-check`;
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to run health check');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Health check executado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao executar health check: " + error.message);
    },
  });

  const retryAllFailedWorkflows = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/retry-failed-workflows`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to retry workflows');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(`Retry executado: ${data.summary.success} sucesso, ${data.summary.failed} falha`);
    },
    onError: (error) => {
      toast.error("Erro ao executar retry: " + error.message);
    },
  });

  const resendInitialAccess = useMutation({
    mutationFn: async ({ companyId, resetPassword = true }: { companyId: string; resetPassword?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('resend-initial-access', {
        body: {
          company_id: companyId,
          reset_password: resetPassword,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao reenviar acesso');
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Email de acesso reenviado", {
        description: `Enviado para: ${data.email_sent_to}`,
      });
    },
    onError: (error) => {
      toast.error("Erro ao reenviar acesso: " + error.message);
    },
  });

  const approveCompany = useMutation({
    mutationFn: async ({ 
      companyId, 
      planId, 
      maxUsers = 5, 
      maxInstances = 2,
      enableTrial = false,
    }: { 
      companyId: string; 
      planId?: string; 
      maxUsers?: number; 
      maxInstances?: number; 
      enableTrial?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('approve-company', {
        body: {
          company_id: companyId,
          action: 'approve',
          plan_id: planId,
          max_users: maxUsers,
          max_instances: maxInstances,
          auto_activate_workflow: true,
          enable_trial: enableTrial,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao aprovar empresa');
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa aprovada com sucesso!", {
        description: data.provisioning_status === 'active' 
          ? "Provisionamento completo" 
          : "Provisionamento parcial - verifique logs",
      });
    },
    onError: (error) => {
      toast.error("Erro ao aprovar empresa: " + error.message);
    },
  });

  const rejectCompany = useMutation({
    mutationFn: async ({ companyId, reason }: { companyId: string; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke('approve-company', {
        body: {
          company_id: companyId,
          action: 'reject',
          rejection_reason: reason || 'Não informado',
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao rejeitar empresa');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa rejeitada");
    },
    onError: (error) => {
      toast.error("Erro ao rejeitar empresa: " + error.message);
    },
  });

  const suspendCompany = useMutation({
    mutationFn: async ({ companyId, reason }: { companyId: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("companies")
        .update({
          status: 'suspended',
          suspended_at: new Date().toISOString(),
          suspended_by: user?.id,
          suspended_reason: reason || 'Inadimplência',
        })
        .eq("id", companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa suspensa com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao suspender empresa: " + error.message);
    },
  });

  const unsuspendCompany = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase
        .from("companies")
        .update({
          status: 'active',
          suspended_at: null,
          suspended_by: null,
          suspended_reason: null,
        })
        .eq("id", companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa liberada com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao liberar empresa: " + error.message);
    },
  });

  // Filter companies by approval status
  const pendingApprovalCompanies = companies.filter(c => c.approval_status === 'pending_approval');
  const approvedCompanies = companies.filter(c => c.approval_status === 'approved');
  const rejectedCompanies = companies.filter(c => c.approval_status === 'rejected');

  return {
    companies,
    pendingApprovalCompanies,
    approvedCompanies,
    rejectedCompanies,
    isLoading,
    createCompany,
    updateCompany,
    deleteCompany,
    retryN8nWorkflow,
    runHealthCheck,
    retryAllFailedWorkflows,
    resendInitialAccess,
    approveCompany,
    rejectCompany,
    suspendCompany,
    unsuspendCompany,
  };
}
