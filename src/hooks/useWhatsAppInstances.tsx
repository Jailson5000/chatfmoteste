import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";

export type WhatsAppInstance = Tables<"whatsapp_instances">;

interface CreateInstanceParams {
  instanceName: string;
  apiUrl: string;
  apiKey: string;
}

interface EvolutionResponse {
  success: boolean;
  error?: string;
  qrCode?: string;
  status?: string;
  instance?: WhatsAppInstance;
  message?: string;
  evolutionState?: string;
}

export function useWhatsAppInstances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: instances = [], isLoading, error } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as WhatsAppInstance[];
    },
  });

  const testConnection = useMutation({
    mutationFn: async ({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }): Promise<EvolutionResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "test_connection",
          apiUrl,
          apiKey,
        },
      });

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
      toast({
        title: "Erro na conexão",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createInstance = useMutation({
    mutationFn: async ({ instanceName, apiUrl, apiKey }: CreateInstanceParams): Promise<EvolutionResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "create_instance",
          instanceName,
          apiUrl,
          apiKey,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to create instance");
      
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Instância criada",
        description: data.qrCode ? "Escaneie o QR Code para conectar" : "Instância criada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getQRCode = useMutation({
    mutationFn: async (instanceId: string): Promise<EvolutionResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "get_qrcode",
          instanceId,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to get QR code");
      
      return response.data;
    },
    onError: (error: Error) => {
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke<EvolutionResponse>("evolution-api", {
        body: {
          action: "delete_instance",
          instanceId,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Failed to delete instance");
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({
        title: "Instância removida",
        description: "A instância foi removida com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    instances,
    isLoading,
    error,
    testConnection,
    createInstance,
    getQRCode,
    getStatus,
    deleteInstance,
  };
}
