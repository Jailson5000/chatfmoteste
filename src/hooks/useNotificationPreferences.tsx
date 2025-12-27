import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";

interface NotificationPreferences {
  soundEnabled: boolean;
  browserEnabled: boolean;
}

export function useNotificationPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const {
    data: preferences,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async (): Promise<NotificationPreferences> => {
      if (!user?.id) {
        return { soundEnabled: true, browserEnabled: true };
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("notification_sound_enabled, notification_browser_enabled")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("[useNotificationPreferences] Fetch error:", error);
        throw error;
      }

      return {
        soundEnabled: data?.notification_sound_enabled ?? true,
        browserEnabled: data?.notification_browser_enabled ?? true,
      };
    },
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updatePreferences = useMutation({
    mutationFn: async (newPreferences: Partial<NotificationPreferences>) => {
      if (!user?.id) throw new Error("User not authenticated");

      const updateData: Record<string, boolean> = {};
      
      if (newPreferences.soundEnabled !== undefined) {
        updateData.notification_sound_enabled = newPreferences.soundEnabled;
      }
      if (newPreferences.browserEnabled !== undefined) {
        updateData.notification_browser_enabled = newPreferences.browserEnabled;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (error) throw error;

      return { ...preferences, ...newPreferences };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["notification-preferences", user?.id], data);
      toast({
        title: "Preferências atualizadas",
        description: "Suas configurações de notificação foram salvas",
      });
    },
    onError: (error: Error) => {
      console.error("[useNotificationPreferences] Update error:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    soundEnabled: preferences?.soundEnabled ?? true,
    browserEnabled: preferences?.browserEnabled ?? true,
    isLoading,
    error,
    updatePreferences,
    toggleSound: () => {
      updatePreferences.mutate({ soundEnabled: !preferences?.soundEnabled });
    },
    toggleBrowser: () => {
      updatePreferences.mutate({ browserEnabled: !preferences?.browserEnabled });
    },
  };
}
