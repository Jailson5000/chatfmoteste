import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useLawFirm } from "./useLawFirm";

export type AppRole = "admin" | "gerente" | "advogado" | "estagiario" | "atendente";

// Roles that have full access to all departments
const FULL_ACCESS_ROLES: AppRole[] = ["admin", "gerente", "advogado", "estagiario"];

interface UserDepartmentsData {
  role: AppRole | null;
  departmentIds: string[];
  hasFullAccess: boolean;
  isLoading: boolean;
  userId: string | null;
}

async function fetchUserRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user role:", error);
    return null;
  }

  return (data?.role as AppRole) || null;
}

async function fetchMemberDepartmentIds(userId: string): Promise<string[]> {
  // Use RPC to avoid TypeScript deep instantiation issues
  const { data, error } = await supabase.rpc(
    "get_member_department_ids_for_user" as any,
    { _user_id: userId }
  );

  if (error) {
    console.error("Error fetching member departments:", error);
    return [];
  }

  return (data || []) as string[];
}

export function useUserDepartments(): UserDepartmentsData {
  const { user, loading: authLoading } = useAuth();
  const { lawFirm } = useLawFirm();

  // Fetch user role
  const { data: roleData, isLoading: roleLoading } = useQuery<AppRole | null>({
    queryKey: ["user-role", user?.id],
    queryFn: () => fetchUserRole(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const role = roleData || "atendente"; // Default to most restricted role
  const hasFullAccess = FULL_ACCESS_ROLES.includes(role);

  // Fetch assigned departments for restricted roles (atendente)
  const { data: departmentIds = [], isLoading: deptLoading } = useQuery<string[]>({
    queryKey: ["user-departments", user?.id, lawFirm?.id],
    queryFn: () => fetchMemberDepartmentIds(user!.id),
    enabled: !!user?.id && !!lawFirm?.id && !hasFullAccess,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    role,
    departmentIds,
    hasFullAccess,
    isLoading: authLoading || roleLoading || (!hasFullAccess && deptLoading),
    userId: user?.id || null,
  };
}
