import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { useCompanyLimits } from "./useCompanyLimits";

export type WhatsAppInstance = Tables<"whatsapp_instances">;

interface CreateInstanceParams {
  instanceName: string;
  displayName: string;
  apiUrl?: string;
  apiKey?: string;
}

interface SetSettingsParams {
  instanceId: string;
  rejectCall: boolean;
}

interface EvolutionSettings {
  rejectCall: boolean;
}

interface EvolutionResponse {
  success: boolean;
  error?: string;
  qrCode?: string;
  status?: string;
  instance?: WhatsAppInstance;
  message?: string;
  evolutionState?: string;
  settings?: EvolutionSettings;
  phoneNumber?: string | null;
}

function normalizeApiUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/manager$/i, "");
}

export function useWhatsAppInstances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { checkLimit, refetch: refetchLimits } = useCompanyLimits();

  const { data: instances = [], isLoading, error, refetch } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      console.log("[useWhatsAppInstances] Fetching instances...");
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[useWhatsAppInstances] Fetch error:", error);
        throw error;
      }
      console.log("[useWhatsAppInstances] Fetched instances:", data?.length);
      return data as WhatsAppInstance[];
    },
  });

  const testConnection = useMutation({
    mutationFn: async ({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }): Promise<EvolutionResponse> => {
      console.log("[useWhatsAppInstances] Testing connection to:", apiUrl);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "test_connection",
          apiUrl: normalizeApiUrl(apiUrl),
          apiKey,
        },
      });

      console.log("[useWhatsAppInstances] Test connection response:", response);

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Test failed");

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Conexão estabelecida",
        description: "A Evolution API está respondendo corretamente",
      });
    },
    onError: (error: Error) => {
      console.error("[useWhatsAppInstances] Test connection error:", error);
      toast({
        title: "Erro na conexão",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createInstance = useMutation({
    mutationFn: async ({ instanceName, displayName, apiUrl, apiKey }: CreateInstanceParams): Promise<EvolutionResponse> => {
      // Check limit before creating
      const limitCheck = await checkLimit('instances', 1, true);
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || "Limite de conexões WhatsApp atingido. Considere fazer um upgrade do seu plano.");
      }

      console.log("[useWhatsAppInstances] Creating instance:", instanceName, "Display:", displayName);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Build request body - apiUrl and apiKey are optional, edge function will use default connection
      const requestBody: any = {
        action: "create_instance",
        instanceName,
        displayName,
      };

      // Only include apiUrl/apiKey if provided (for backwards compatibility)
      if (apiUrl) requestBody.apiUrl = normalizeApiUrl(apiUrl);
      if (apiKey) requestBody.apiKey = apiKey;

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: requestBody,
      });

      console.log("[useWhatsAppInstances] Create instance response:", response);

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to create instance");

      return response.data;
    },
    onSuccess: async (data) => {
      console.log("[useWhatsAppInstances] Instance created successfully:", data.instance?.id);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await refetch();
      refetchLimits();

      toast({
        title: "Instância criada",
        description: data.qrCode ? "Escaneie o QR Code para conectar" : "Instância criada com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error("[useWhatsAppInstances] Create instance error:", error);
      toast({
        title: "Erro ao criar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getQRCode = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      console.log("[useWhatsAppInstances] Getting QR code for:", instanceId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "get_qrcode",
          instanceId,
        },
      });

      console.log("[useWhatsAppInstances] Get QR code response:", response);

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to get QR code");

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    },
    onError: (error: Error) => {
      console.error("[useWhatsAppInstances] Get QR code error:", error);
      toast({
        title: "Erro ao obter QR Code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatus = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "get_status",
          instanceId,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to get status");

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    },
  });

  const deleteInstance = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      console.log("[useWhatsAppInstances] Deleting instance:", instanceId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "delete_instance",
          instanceId,
        },
      });

      console.log("[useWhatsAppInstances] Delete instance response:", response);

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to delete instance");

      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await refetch();
      toast({
        title: "Instância removida",
        description: "A instância foi removida com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error("[useWhatsAppInstances] Delete instance error:", error);
      toast({
        title: "Erro ao remover instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const configureWebhook = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      console.log("[useWhatsAppInstances] Configuring webhook for:", instanceId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "configure_webhook",
          instanceId,
        },
      });

      console.log("[useWhatsAppInstances] Configure webhook response:", response);

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to configure webhook");

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Webhook configurado",
        description: "Pronto para receber mensagens e status em tempo real.",
      });
    },
    onError: (error: Error) => {
      console.error("[useWhatsAppInstances] Configure webhook error:", error);
      toast({
        title: "Erro ao configurar webhook",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getSettings = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "get_settings",
          instanceId,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to get settings");

      return response.data;
    },
  });

  const setSettings = useMutation({
    mutationFn: async ({ instanceId, rejectCall }: SetSettingsParams): Promise<EvolutionResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "set_settings",
          instanceId,
          rejectCall,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to set settings");

      return response.data;
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar configuração",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshStatus = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      console.log("[useWhatsAppInstances] Refreshing status for:", instanceId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "refresh_status",
          instanceId,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to refresh status");

      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Status atualizado",
        description: "O status da instância foi atualizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshPhone = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      console.log("[useWhatsAppInstances] Refreshing phone for:", instanceId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "refresh_phone",
          instanceId,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to refresh phone");

      return response.data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Número atualizado",
        description: data.phoneNumber ? `Número: ${data.phoneNumber}` : "Número não encontrado",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar número",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const updateDefaultDepartment = useMutation({
    mutationFn: async ({ instanceId, departmentId }: { instanceId: string; departmentId: string | null }) => {
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ default_department_id: departmentId } as any)
        .eq("id", instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Departamento atualizado",
        description: "O departamento padrão foi configurado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar departamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateDefaultStatus = useMutation({
    mutationFn: async ({ instanceId, statusId }: { instanceId: string; statusId: string | null }) => {
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ default_status_id: statusId } as any)
        .eq("id", instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Status atualizado",
        description: "O status padrão foi configurado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateDefaultAssigned = useMutation({
    mutationFn: async ({ instanceId, userId }: { instanceId: string; userId: string | null }) => {
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ default_assigned_to: userId } as any)
        .eq("id", instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Responsável atualizado",
        description: "O responsável padrão foi configurado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar responsável",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    instances,
    isLoading,
    error,
    refetch,
    testConnection,
    createInstance,
    getQRCode,
    getStatus,
    deleteInstance,
    configureWebhook,
    getSettings,
    setSettings,
    refreshStatus,
    refreshPhone,
    updateDefaultDepartment,
    updateDefaultStatus,
    updateDefaultAssigned,
  };
}
