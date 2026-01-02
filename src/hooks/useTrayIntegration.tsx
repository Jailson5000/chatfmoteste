import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface TrayIntegration {
  id: string;
  law_firm_id: string;
  is_active: boolean;
  widget_key: string;
  widget_color: string | null;
  widget_position: string | null;
  welcome_message: string | null;
  offline_message: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  activated_by: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  first_use_at: string | null;
}

// Generate snippet code from widget key
function generateSnippetCode(widgetKey: string): string {
  return `<!-- MiauChat Widget - Tray Commerce -->
<script>
  window.MiauChat = {
    tenant: "${widgetKey}",
    source: "TRAY",
    pageUrl: window.location.href,
    referrer: document.referrer,
    device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop"
  };
</script>
<script async src="https://miauchat.com.br/widget.js"></script>`;
}

export function useTrayIntegration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: integration, isLoading } = useQuery({
    queryKey: ["tray-integration"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id)
        .single();

      if (!profile?.law_firm_id) return null;

      const { data, error } = await supabase
        .from("tray_chat_integrations")
        .select("*")
        .eq("law_firm_id", profile.law_firm_id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching Tray integration:", error);
        throw error;
      }

      if (!data) return null;

      // Add snippet_code dynamically
      return {
        ...data,
        is_enabled: data.is_active,
        snippet_code: generateSnippetCode(data.widget_key),
      };
    },
    enabled: !!user,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id)
        .single();

      if (!profile?.law_firm_id) {
        throw new Error("Law firm not found");
      }

      // Generate widget key if not exists
      const widgetKey = integration?.widget_key || crypto.randomUUID().replace(/-/g, "").substring(0, 16);

      if (integration) {
        // Update existing
        const { data, error } = await supabase
          .from("tray_chat_integrations")
          .update({
            is_active: enabled,
            activated_at: enabled ? new Date().toISOString() : integration.activated_at,
            activated_by: enabled ? user?.id : integration.activated_by,
            deactivated_at: !enabled ? new Date().toISOString() : null,
            deactivated_by: !enabled ? user?.id : null,
          })
          .eq("id", integration.id)
          .select()
          .single();

        if (error) throw error;

        // Log audit
        await supabase.from("tray_chat_audit_logs").insert({
          law_firm_id: profile.law_firm_id,
          integration_id: integration.id,
          action: enabled ? "ENABLED" : "DISABLED",
          performed_by: user?.id,
          metadata: {},
        });

        return data;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("tray_chat_integrations")
          .insert({
            law_firm_id: profile.law_firm_id,
            is_active: enabled,
            widget_key: widgetKey,
            activated_at: enabled ? new Date().toISOString() : null,
            activated_by: enabled ? user?.id : null,
          })
          .select()
          .single();

        if (error) throw error;

        // Log audit
        await supabase.from("tray_chat_audit_logs").insert({
          law_firm_id: profile.law_firm_id,
          integration_id: data.id,
          action: "CREATED",
          performed_by: user?.id,
          metadata: {},
        });

        return data;
      }
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["tray-integration"] });
      toast.success(enabled ? "Integração Tray ativada!" : "Integração Tray desativada");
    },
    onError: (error) => {
      console.error("Error toggling Tray integration:", error);
      toast.error("Erro ao alterar integração Tray");
    },
  });

  return {
    integration,
    isLoading,
    toggleIntegration: toggleMutation.mutateAsync,
    isToggling: toggleMutation.isPending,
  };
}
