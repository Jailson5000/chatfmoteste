import { useCallback, useEffect, useRef } from "react";
import { Instagram } from "lucide-react";
import { IntegrationCard } from "../IntegrationCard";
import { MetaHandlerControls } from "./MetaHandlerControls";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { META_INSTAGRAM_APP_ID, buildInstagramBusinessLoginUrl, getFixedRedirectUri } from "@/lib/meta-config";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";

function InstagramIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
      <Instagram className="h-5 w-5 text-white" />
    </div>
  );
}

export function InstagramIntegration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
    };
  }, []);

  // Fetch existing connection
  const { data: connection, isLoading } = useQuery({
    queryKey: ["meta-connection", "instagram", user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id)
        .single();
      if (!profile?.law_firm_id) return null;

      const { data, error } = await supabase
        .from("meta_connections")
        .select("*")
        .eq("law_firm_id", profile.law_firm_id)
        .eq("type", "instagram")
        .eq("source", "oauth")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Toggle active state + auto resubscribe on activation
  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!connection?.id) throw new Error("No connection");
      const { error } = await supabase
        .from("meta_connections")
        .update({ is_active: isActive })
        .eq("id", connection.id);
      if (error) throw error;

      // Auto-resubscribe when activating
      if (isActive) {
        try {
          const { data, error: resubError } = await supabase.functions.invoke("meta-api", {
            body: { action: "resubscribe", connectionId: connection.id },
          });
          if (resubError) {
            console.error("[InstagramIntegration] Resubscribe error:", resubError);
          } else {
            console.log("[InstagramIntegration] Resubscribe result:", data);
          }
        } catch (err) {
          console.error("[InstagramIntegration] Resubscribe failed:", err);
        }
      }
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["meta-connection", "instagram"] });
      toast.success(isActive ? "Instagram ativado!" : "Instagram desativado");
    },
    onError: () => toast.error("Erro ao alterar status"),
  });

  // Delete connection
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!connection?.id) throw new Error("No connection");
      const { error } = await supabase
        .from("meta_connections")
        .delete()
        .eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-connection", "instagram"] });
      toast.success("Conexão removida");
    },
    onError: () => toast.error("Erro ao remover conexão"),
  });

  const updateHandlerMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!connection?.id) throw new Error("No connection");
      const { error } = await supabase
        .from("meta_connections")
        .update(updates)
        .eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-connection", "instagram"] });
      toast.success("Configuração atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar configuração"),
  });

  const handleConnect = useCallback(() => {
    if (!META_INSTAGRAM_APP_ID) {
      toast.error("META_INSTAGRAM_APP_ID não configurado.");
      return;
    }

    // Use Instagram Business Login (native Instagram OAuth)
    const authUrl = buildInstagramBusinessLoginUrl();
    window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");

    if (listenerRef.current) {
      window.removeEventListener("message", listenerRef.current);
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "meta-oauth-code" && event.data.connectionType === "instagram") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;
        const code = event.data.code;
        const redirectUri = getFixedRedirectUri("instagram");
        toast.loading("Conectando Instagram...", { id: "ig-connect" });
        try {
          // Use the new instagram_login flow (direct token exchange via api.instagram.com)
          const response = await supabase.functions.invoke("meta-oauth-callback", {
            body: { code, redirectUri, type: "instagram", flow: "instagram_login" },
          });
          if (response.error) {
            const realMsg = await getFunctionErrorMessage(response.error);
            throw new Error(realMsg);
          }
          if (!response.data?.success) {
            throw new Error(response.data?.error || response.data?.message || "Falha ao conectar Instagram");
          }
          queryClient.invalidateQueries({ queryKey: ["meta-connection", "instagram"] });
          toast.success("Instagram conectado com sucesso!", { id: "ig-connect" });
        } catch (err) {
          console.error("Instagram OAuth error:", err);
          toast.error(err instanceof Error ? err.message : "Erro ao conectar Instagram", { id: "ig-connect" });
        }
        return;
      }
      // Legacy handlers
      if (event.data?.type === "meta-oauth-success") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["meta-connection", "instagram"] });
        toast.success("Instagram conectado com sucesso!");
      }
      if (event.data?.type === "meta-oauth-error") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;
        toast.error(event.data.message || "Erro ao conectar Instagram");
      }
    };

    listenerRef.current = handleMessage;
    window.addEventListener("message", handleMessage);
  }, [queryClient]);

  if (!connection) {
    return (
      <IntegrationCard
        icon={<InstagramIcon />}
        title="Instagram DM"
        description="Receba e responda mensagens do Instagram Direct diretamente na plataforma. Requer conta Instagram Profissional."
        isLoading={isLoading}
        onConnect={handleConnect}
      />
    );
  }

  const currentHandlerType = (connection as any).default_handler_type || "human";

  return (
    <IntegrationCard
      icon={<InstagramIcon />}
      title="Instagram DM"
      description={`Conectado: ${connection.page_name || "Página"}`}
      isConnected={true}
      isActive={connection.is_active}
      isLoading={isLoading}
      onToggle={(checked) => toggleMutation.mutate(checked)}
      toggleDisabled={toggleMutation.isPending}
      onSettings={() => {
        toast.info(`Página: ${connection.page_name || "N/A"}\nIG Account: ${(connection as any).ig_account_id || "N/A"}`);
      }}
      onDisconnect={() => {
        if (window.confirm("Deseja desconectar o Instagram? Você poderá reconectar depois.")) {
          deleteMutation.mutate();
        }
      }}
    >
      <MetaHandlerControls
        handlerType={currentHandlerType}
        automationId={(connection as any).default_automation_id}
        humanAgentId={(connection as any).default_human_agent_id}
        disabled={updateHandlerMutation.isPending}
        onHandlerTypeChange={(value) => {
          if (value === "ai") {
            updateHandlerMutation.mutate({ default_handler_type: "ai", default_human_agent_id: null });
          } else {
            updateHandlerMutation.mutate({ default_handler_type: "human", default_automation_id: null });
          }
        }}
        onAutomationChange={(id) => {
          updateHandlerMutation.mutate({ default_automation_id: id === "none" ? null : id });
        }}
        onHumanAgentChange={(id) => {
          updateHandlerMutation.mutate({ default_human_agent_id: id === "none" ? null : id });
        }}
      />
    </IntegrationCard>
  );
}
