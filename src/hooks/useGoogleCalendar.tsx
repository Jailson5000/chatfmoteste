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

  // Listen for OAuth completion (popup writes to localStorage)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "google_calendar_oauth_result" || !event.newValue) return;

      try {
        const payload = JSON.parse(event.newValue) as {
          status: "success" | "error";
          email?: string;
          message?: string;
          ts?: number;
        };

        // cleanup
        localStorage.removeItem("google_calendar_oauth_result");
        setIsConnecting(false);

        if (payload.status === "success") {
          queryClient.invalidateQueries({ queryKey: ["google-calendar-integration"] });
          toast({
            title: "Google Calendar conectado",
            description: payload.email ? `Conta: ${payload.email}` : "Conexão concluída com sucesso.",
          });
        } else {
          toast({
            title: "Erro ao conectar",
            description: payload.message || "Não foi possível conectar ao Google Calendar.",
            variant: "destructive",
          });
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient, toast]);

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

  // Connect with Google - uses popup to avoid iframe restrictions (Lovable preview runs in an iframe)
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

    // Open popup synchronously (prevents popup blockers and avoids loading Google inside an iframe)
    const popup = window.open(
      "about:blank",
      "google_calendar_oauth",
      "popup=yes,width=520,height=680"
    );

    try {
      // Callback URL must match EXACTLY what is configured in Google Cloud Console
      const redirectUrl = `${window.location.origin}/integrations/google-calendar/callback`;

      // Store return URL so we can redirect back after OAuth (non-popup flows)
      sessionStorage.setItem("google_calendar_return_url", window.location.href);

      // Call backend function to initiate OAuth
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: {
          action: "get_auth_url",
          law_firm_id: lawFirm.id,
          redirect_url: redirectUrl,
        },
      });

      if (error) throw error;

      if (data?.auth_url) {
        console.log("[GoogleCalendar] Redirecting to OAuth URL:", data.auth_url);

        if (popup && !popup.closed) {
          popup.location.href = data.auth_url;
          popup.focus();
        } else {
          // If popup was blocked, open a new tab as fallback (still avoids iframe)
          window.open(data.auth_url, "_blank");
        }
      } else {
        throw new Error("URL de autenticação não recebida");
      }
    } catch (error: any) {
      console.error("Error connecting to Google Calendar:", error);
      toast({
        title: "Erro ao conectar",
        description: error.message || "Não foi possível iniciar a conexão com o Google Calendar",
        variant: "destructive",
      });

      try {
        popup?.close();
      } catch {
        // ignore
      }

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
    onSuccess: (data) => {
      // Invalidate both integration AND events queries so UI updates immediately
      queryClient.invalidateQueries({ queryKey: ["google-calendar-integration"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      
      const syncedMsg = data?.synced_events !== undefined 
        ? `Sincronizados ${data.synced_events} eventos.`
        : "Os eventos foram sincronizados.";
      const deletedMsg = data?.deleted_events > 0 
        ? ` Removidos ${data.deleted_events} cancelados.`
        : "";
      
      toast({
        title: "Sincronização concluída",
        description: syncedMsg + deletedMsg,
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
