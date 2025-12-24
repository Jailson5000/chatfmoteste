import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "advogado" | "estagiario" | "atendente";

interface UserRoleData {
  role: AppRole;
  isAdmin: boolean;
  isAttendant: boolean;
  loading: boolean;
}

export function useUserRole(): UserRoleData {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole>("atendente");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (error) {
          console.error("Error fetching user role:", error);
          setRole("atendente"); // Default to most restricted role
        } else if (data) {
          setRole(data.role as AppRole);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole("atendente");
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user, authLoading]);

  return {
    role,
    isAdmin: role === "admin",
    isAttendant: role === "atendente",
    loading: loading || authLoading,
  };
}
