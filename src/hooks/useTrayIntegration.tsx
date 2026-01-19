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
  // Default settings
  default_department_id: string | null;
  default_status_id: string | null;
  default_automation_id: string | null;
  default_handler_type: string | null;
  default_human_agent_id: string | null;
}

// Generate snippet code from widget key
function generateSnippetCode(widgetKey: string): string {
  return `<!-- MiauChat Widget -->
<script>
  window.MiauChat = {
    tenant: "${widgetKey}",
    source: "WIDGET"
  };
</script>
<script async src="https://chatfmoteste.lovable.app/widget.js"></script>`;
}

export function useTrayIntegration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: integration, isLoading } = useQuery({
    queryKey: ["tray-integration", user?.id],
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

      // Cast to include new columns
      const integrationData = data as TrayIntegration;

      // Add snippet_code dynamically
      return {
        ...integrationData,
        is_enabled: integrationData.is_active,
        snippet_code: generateSnippetCode(integrationData.widget_key),
      };
    },
    enabled: !!user?.id,
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

        // Log audit (ignore errors)
        try {
          await supabase.from("tray_chat_audit_logs").insert({
            law_firm_id: profile.law_firm_id,
            integration_id: integration.id,
            action: enabled ? "ENABLED" : "DISABLED",
            performed_by: user?.id,
            metadata: {},
          });
        } catch (auditError) {
          console.warn("Failed to log audit (non-critical):", auditError);
        }

        return data;
      } else {
        // Create new - default to human handler
        const { data, error } = await supabase
          .from("tray_chat_integrations")
          .insert({
            law_firm_id: profile.law_firm_id,
            is_active: enabled,
            widget_key: widgetKey,
            activated_at: enabled ? new Date().toISOString() : null,
            activated_by: enabled ? user?.id : null,
            default_handler_type: 'human',
          })
          .select()
          .single();

        if (error) throw error;

        // Log audit
        try {
          await supabase.from("tray_chat_audit_logs").insert({
            law_firm_id: profile.law_firm_id,
            integration_id: data.id,
            action: "CREATED",
            performed_by: user?.id,
            metadata: {},
          });
        } catch (auditError) {
          console.warn("Failed to log audit (non-critical):", auditError);
        }

        return data;
      }
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["tray-integration", user?.id] });
      toast.success(enabled ? "Chat do site ativado!" : "Chat do site desativado");
    },
  });

  // Mutation to update default settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: {
      default_department_id?: string | null;
      default_status_id?: string | null;
      default_automation_id?: string | null;
      default_handler_type?: string | null;
      default_human_agent_id?: string | null;
    }) => {
      if (!integration?.id) {
        throw new Error("Integration not found");
      }

      const { data, error } = await supabase
        .from("tray_chat_integrations")
        .update(settings)
        .eq("id", integration.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-integration", user?.id] });
      toast.success("Configuração atualizada!");
    },
    onError: (error) => {
      console.error("Error updating settings:", error);
      toast.error("Erro ao atualizar configuração");
    },
  });

  return {
    integration,
    isLoading,
    toggleIntegration: toggleMutation.mutateAsync,
    isToggling: toggleMutation.isPending,
    updateSettings: updateSettingsMutation.mutate,
    isUpdatingSettings: updateSettingsMutation.isPending,
  };
}