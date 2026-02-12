import { useState, useCallback } from "react";
import { Facebook } from "lucide-react";
import { IntegrationCard } from "../IntegrationCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
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
    const META_APP_ID = import.meta.env.VITE_META_APP_ID;
    if (!META_APP_ID) {
      toast.error("META_APP_ID não configurado. Configure nas variáveis de ambiente.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/meta-callback`;
    const scope = "pages_messaging,pages_manage_metadata";
    const state = JSON.stringify({ type: "facebook" });

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;

    window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");
  }, []);

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
    />
  );
}
