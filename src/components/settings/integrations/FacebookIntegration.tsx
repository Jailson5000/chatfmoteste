import { useCallback } from "react";
import { Facebook } from "lucide-react";
import { IntegrationCard } from "../IntegrationCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { META_APP_ID, buildMetaOAuthUrl } from "@/lib/meta-config";

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
    const popup = window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "meta-oauth-success") {
        window.removeEventListener("message", handleMessage);
        queryClient.invalidateQueries({ queryKey: ["meta-connection", "facebook"] });
        toast.success("Facebook conectado com sucesso!");
      }
      if (event.data?.type === "meta-oauth-error") {
        window.removeEventListener("message", handleMessage);
        toast.error(event.data.message || "Erro ao conectar Facebook");
      }
    };
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
    />
  );
}
