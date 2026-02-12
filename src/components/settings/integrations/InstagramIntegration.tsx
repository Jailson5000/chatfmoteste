import { useState, useCallback, useEffect } from "react";
import { Instagram, ExternalLink, Loader2, Trash2, RefreshCw } from "lucide-react";
import { IntegrationCard } from "../IntegrationCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { META_APP_ID, buildMetaOAuthUrl } from "@/lib/meta-config";

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
  const [isConnecting, setIsConnecting] = useState(false);

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
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Toggle active state
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

  const handleConnect = useCallback(() => {
    if (!META_APP_ID) {
      toast.error("META_APP_ID não configurado. Configure nas variáveis de ambiente.");
      return;
    }

    const authUrl = buildMetaOAuthUrl("instagram");
    window.location.href = authUrl;
  }, []);

  // Token expiry info
  const tokenExpiresAt = connection?.token_expires_at ? new Date(connection.token_expires_at) : null;
  const daysUntilExpiry = tokenExpiresAt
    ? Math.ceil((tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7;

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
        // Could open a settings dialog - for now show info toast
        toast.info(`Página: ${connection.page_name}${connection.ig_account_id ? ` | IG: ${connection.ig_account_id}` : ""}`);
      }}
    />
  );
}
