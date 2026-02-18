import { useCallback, useEffect, useRef } from "react";
import { Facebook } from "lucide-react";
import { IntegrationCard } from "../IntegrationCard";
import { MetaHandlerControls } from "./MetaHandlerControls";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { META_APP_ID, buildMetaOAuthUrl, getFixedRedirectUri } from "@/lib/meta-config";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";

function FacebookIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
      <Facebook className="h-5 w-5 text-white" />
    </div>
  );
}

export function FacebookIntegration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
    };
  }, []);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["meta-connection", "facebook", user?.id],
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
        .eq("type", "facebook")
        .eq("source", "oauth")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

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
      queryClient.invalidateQueries({ queryKey: ["meta-connection", "facebook"] });
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
      queryClient.invalidateQueries({ queryKey: ["meta-connection", "facebook"] });
      toast.success("Configuração atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar configuração"),
  });

  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!connection?.id) throw new Error("No connection");
      const { error } = await supabase
        .from("meta_connections")
        .update({ is_active: isActive })
        .eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["meta-connection", "facebook"] });
      toast.success(isActive ? "Facebook ativado!" : "Facebook desativado");
    },
    onError: () => toast.error("Erro ao alterar status"),
  });

  const handleConnect = useCallback(() => {
    if (!META_APP_ID) {
      toast.error("META_APP_ID não configurado. Configure nas variáveis de ambiente.");
      return;
    }

    const authUrl = buildMetaOAuthUrl("facebook");
    window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");

    if (listenerRef.current) {
      window.removeEventListener("message", listenerRef.current);
    }

    const handleMessage = async (event: MessageEvent) => {
      // Handle code from popup (new flow)
      if (event.data?.type === "meta-oauth-code" && event.data.connectionType === "facebook") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;

        const code = event.data.code;
        const redirectUri = getFixedRedirectUri("facebook");

        toast.loading("Conectando Facebook...", { id: "fb-connect" });

        try {
          const response = await supabase.functions.invoke("meta-oauth-callback", {
            body: { code, redirectUri, type: "facebook" },
          });

          if (response.error) {
            const realMsg = await getFunctionErrorMessage(response.error);
            throw new Error(realMsg);
          }

          if (!response.data?.success) {
            throw new Error(response.data?.error || response.data?.message || "Falha ao salvar conexão");
          }

          queryClient.invalidateQueries({ queryKey: ["meta-connection", "facebook"] });
          toast.success("Facebook conectado com sucesso!", { id: "fb-connect" });
        } catch (err) {
          console.error("Facebook OAuth error:", err);
          toast.error(err instanceof Error ? err.message : "Erro ao conectar Facebook", { id: "fb-connect" });
        }
        return;
      }

      // Legacy handlers
      if (event.data?.type === "meta-oauth-success") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["meta-connection", "facebook"] });
        toast.success("Facebook conectado com sucesso!");
      }
      if (event.data?.type === "meta-oauth-error") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;
        toast.error(event.data.message || "Erro ao conectar Facebook");
      }
    };

    listenerRef.current = handleMessage;
    window.addEventListener("message", handleMessage);
  }, [queryClient]);

  if (!connection) {
    return (
      <IntegrationCard
        icon={<FacebookIcon />}
        title="Facebook Messenger"
        description="Receba e responda mensagens do Facebook Messenger diretamente na plataforma."
        isLoading={isLoading}
        onConnect={handleConnect}
      />
    );
  }

  const currentHandlerType = (connection as any).default_handler_type || "human";

  return (
    <IntegrationCard
      icon={<FacebookIcon />}
      title="Facebook Messenger"
      description={`Conectado: ${connection.page_name || "Página"}`}
      isConnected={true}
      isActive={connection.is_active}
      isLoading={isLoading}
      onToggle={(checked) => toggleMutation.mutate(checked)}
      toggleDisabled={toggleMutation.isPending}
      onSettings={() => {
        toast.info(`Página: ${connection.page_name}`);
      }}
      onDisconnect={() => {
        if (window.confirm("Deseja desconectar o Facebook? Você poderá reconectar depois.")) {
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
