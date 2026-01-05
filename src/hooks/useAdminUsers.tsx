import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminRole } from "./useAdminAuth";

interface AdminUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  role?: AdminRole;
}

export function useAdminUsers() {
  const queryClient = useQueryClient();

  const { data: adminUsers = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("admin_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles for each profile
      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from("admin_user_roles")
            .select("role")
            .eq("user_id", profile.user_id)
            .maybeSingle();

          return {
            ...profile,
            role: roleData?.role as AdminRole | undefined,
          };
        })
      );

      return usersWithRoles as AdminUser[];
    },
  });

  const updateAdminRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AdminRole }) => {
      // Use secure RPC that validates caller is super_admin
      const { data, error } = await supabase.rpc("update_admin_role", {
        _target_user_id: userId,
        _new_role: role,
      });

      if (error) throw error;
      
      // Check if the RPC returned an error in its response
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error || "Falha ao atualizar role");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role atualizada com sucesso");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar role: " + error.message);
    },
  });

  const toggleAdminActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      // Use secure RPC that validates caller is super_admin
      const { data, error } = await supabase.rpc("toggle_admin_active", {
        _target_user_id: userId,
        _is_active: isActive,
      });

      if (error) throw error;
      
      // Check if the RPC returned an error in its response
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error || "Falha ao atualizar status");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Status atualizado com sucesso");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  return {
    adminUsers,
    isLoading,
    updateAdminRole,
    toggleAdminActive,
  };
}
