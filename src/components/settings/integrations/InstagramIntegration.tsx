import { useCallback, useEffect, useRef, useState } from "react";
import { Instagram } from "lucide-react";
import { IntegrationCard } from "../IntegrationCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { META_APP_ID, buildMetaOAuthUrl, getFixedRedirectUri } from "@/lib/meta-config";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";
import { InstagramPagePickerDialog, type InstagramPage } from "./InstagramPagePickerDialog";

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPages, setPickerPages] = useState<InstagramPage[]>([]);
  // pendingOAuthData removed - tokens are now passed via encryptedToken in page picker

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

  // Save selected Instagram page
  const handleSelectPage = useCallback(async (page: InstagramPage) => {
    toast.loading("Conectando Instagram...", { id: "ig-connect" });

    try {
      const response = await supabase.functions.invoke("meta-oauth-callback", {
        body: {
          type: "instagram",
          step: "save",
          pageId: page.pageId,
          encryptedPageToken: page.encryptedToken,
        },
      });

      if (response.error) {
        const realMsg = await getFunctionErrorMessage(response.error);
        throw new Error(realMsg);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || response.data?.message || "Falha ao salvar conexão");
      }

      queryClient.invalidateQueries({ queryKey: ["meta-connection", "instagram"] });
      toast.success("Instagram conectado com sucesso!", { id: "ig-connect" });
      setPickerOpen(false);
      // no longer need pendingOAuthData
      setPickerPages([]);
    } catch (err) {
      console.error("Instagram save error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao conectar Instagram", { id: "ig-connect" });
    }
  }, [queryClient]);

  const handleConnect = useCallback(() => {
    if (!META_APP_ID) {
      toast.error("META_APP_ID não configurado. Configure nas variáveis de ambiente.");
      return;
    }

    const authUrl = buildMetaOAuthUrl("instagram");
    window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");

    // Remove previous listener if any
    if (listenerRef.current) {
      window.removeEventListener("message", listenerRef.current);
    }

    const handleMessage = async (event: MessageEvent) => {
      // Handle code from popup (new flow)
      if (event.data?.type === "meta-oauth-code" && event.data.connectionType === "instagram") {
        window.removeEventListener("message", handleMessage);
        listenerRef.current = null;

        const code = event.data.code;
        const redirectUri = getFixedRedirectUri("instagram");

        toast.loading("Buscando contas Instagram...", { id: "ig-connect" });

        try {
          // Step 1: List pages with IG accounts
          const response = await supabase.functions.invoke("meta-oauth-callback", {
            body: { code, redirectUri, type: "instagram", step: "list_pages" },
          });

          if (response.error) {
            const realMsg = await getFunctionErrorMessage(response.error);
            throw new Error(realMsg);
          }

          if (!response.data?.success) {
            throw new Error(response.data?.error || response.data?.message || "Falha ao buscar contas");
          }

          const pages: InstagramPage[] = response.data.pages || [];

          if (pages.length === 0) {
            throw new Error("Nenhuma conta Instagram encontrada vinculada às suas páginas.");
          }

          // Pages now include encryptedToken from backend
          setPickerPages(pages);
          setPickerPages(pages);
          setPickerOpen(true);
          toast.dismiss("ig-connect");
        } catch (err) {
          console.error("Instagram OAuth error:", err);
          toast.error(err instanceof Error ? err.message : "Erro ao conectar Instagram", { id: "ig-connect" });
        }
        return;
      }

      // Legacy handlers (backward compat)
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
      <>
        <IntegrationCard
          icon={<InstagramIcon />}
          title="Instagram DM"
          description="Receba e responda mensagens do Instagram Direct diretamente na plataforma. Requer conta Instagram Profissional."
          isLoading={isLoading}
          onConnect={handleConnect}
        />
        <InstagramPagePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          pages={pickerPages}
          onSelect={handleSelectPage}
        />
      </>
    );
  }

  return (
    <>
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
          toast.info(`Página: ${connection.page_name}${connection.ig_account_id ? ` | IG: ${connection.ig_account_id}` : ""}`);
        }}
        onDisconnect={() => {
          if (window.confirm("Deseja desconectar o Instagram? Você poderá reconectar depois.")) {
            deleteMutation.mutate();
          }
        }}
      />
      <InstagramPagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        pages={pickerPages}
        onSelect={handleSelectPage}
      />
    </>
  );
}
