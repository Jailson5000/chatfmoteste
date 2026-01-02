import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";

interface GoogleCalendarIntegration {
  id: string;
  law_firm_id: string;
  google_email: string;
  default_calendar_id: string | null;
  default_calendar_name: string | null;
  allow_read_events: boolean;
  allow_create_events: boolean;
  allow_edit_events: boolean;
  allow_delete_events: boolean;
  is_active: boolean;
  last_sync_at: string | null;
  next_sync_at: string | null;
  connected_at: string;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  primary: boolean;
}

export function useGoogleCalendar() {
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch current integration status
  const { data: integration, isLoading, refetch } = useQuery({
    queryKey: ["google-calendar-integration", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("google_calendar_integrations")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) throw error;
      return data as GoogleCalendarIntegration | null;
    },
    enabled: !!lawFirm?.id,
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (settings: Partial<GoogleCalendarIntegration>) => {
      if (!integration?.id) throw new Error("Integração não encontrada");

      const { error } = await supabase
        .from("google_calendar_integrations")
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-integration"] });
      toast({
        title: "Configurações salvas",
        description: "As configurações do Google Calendar foram atualizadas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect mutation
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!integration?.id) throw new Error("Integração não encontrada");

      const { error } = await supabase
        .from("google_calendar_integrations")
        .delete()
        .eq("id", integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-integration"] });
      toast({
        title: "Desconectado",
        description: "Google Calendar foi desconectado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle active status
  const toggleActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!integration?.id) throw new Error("Integração não encontrada");

      const { error } = await supabase
        .from("google_calendar_integrations")
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-integration"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Connect with Google - opens popup for OAuth
  const connect = async () => {
    if (!lawFirm?.id) {
      toast({
        title: "Erro",
        description: "Empresa não identificada",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);

    try {
      // Get the callback URL - this must match exactly what's in Google OAuth console
      const redirectUrl = `${window.location.origin}/integrations/google-calendar/callback`;
      
      // Call edge function to initiate OAuth
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: {
          action: "get_auth_url",
          law_firm_id: lawFirm.id,
          redirect_url: redirectUrl,
        },
      });

      if (error) throw error;
      
      if (data?.auth_url) {
        // Open Google OAuth in a popup
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        const popup = window.open(
          data.auth_url,
          "google-calendar-auth",
          `width=${width},height=${height},left=${left},top=${top}`
        );

        // Listen for the popup to close
        const checkPopup = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkPopup);
            setIsConnecting(false);
            refetch();
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error("Error connecting to Google Calendar:", error);
      toast({
        title: "Erro ao conectar",
        description: error.message || "Não foi possível iniciar a conexão com o Google Calendar",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  // Note: OAuth callback is now handled by GoogleCalendarCallback page

  // Sync now
  const syncNow = useMutation({
    mutationFn: async () => {
      if (!lawFirm?.id) throw new Error("Empresa não identificada");

      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: {
          law_firm_id: lawFirm.id,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-integration"] });
      toast({
        title: "Sincronização iniciada",
        description: "Os eventos estão sendo sincronizados.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na sincronização",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    integration,
    isLoading,
    isConnected: !!integration,
    isConnecting,
    connect,
    disconnect,
    updateSettings,
    toggleActive,
    syncNow,
    refetch,
  };
}
