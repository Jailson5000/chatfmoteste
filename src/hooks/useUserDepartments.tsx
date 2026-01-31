import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useLawFirm } from "./useLawFirm";

export type AppRole = "admin" | "gerente" | "advogado" | "estagiario" | "atendente";

// Roles that have full access to all departments
const FULL_ACCESS_ROLES: AppRole[] = ["admin", "gerente", "advogado", "estagiario"];

// Special ID for "No Department" permission - used in UI and filtering, NOT stored as UUID
export const NO_DEPARTMENT_ID = "__no_department__";

interface UserDepartmentsData {
  role: AppRole | null;
  departmentIds: string[];
  hasFullAccess: boolean;
  isLoading: boolean;
  userId: string | null;
  canAccessArchived: boolean;
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

async function fetchMemberNoDepartmentAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "get_member_no_department_access_for_user" as any,
    { _user_id: userId }
  );

  if (error) {
    console.error("Error fetching no-department access:", error);
    return false;
  }

  return data === true;
}

async function fetchMemberArchivedAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "get_member_archived_access_for_user" as any,
    { _user_id: userId }
  );

  if (error) {
    console.error("Error fetching archived access:", error);
    return false;
  }

  return data === true;
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
  const { data: uuidDepartmentIds = [], isLoading: deptLoading } = useQuery<string[]>({
    queryKey: ["user-departments", user?.id, lawFirm?.id],
    queryFn: () => fetchMemberDepartmentIds(user!.id),
    enabled: !!user?.id && !!lawFirm?.id && !hasFullAccess,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch "no department" access flag for restricted roles
  const { data: canAccessNoDepartment = false, isLoading: noDeptLoading } = useQuery<boolean>({
    queryKey: ["user-no-dept-access", user?.id, lawFirm?.id],
    queryFn: () => fetchMemberNoDepartmentAccess(user!.id),
    enabled: !!user?.id && !!lawFirm?.id && !hasFullAccess,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch "archived" access flag for restricted roles
  const { data: canAccessArchivedFlag = false, isLoading: archivedLoading } = useQuery<boolean>({
    queryKey: ["user-archived-access", user?.id, lawFirm?.id],
    queryFn: () => fetchMemberArchivedAccess(user!.id),
    enabled: !!user?.id && !!lawFirm?.id && !hasFullAccess,
    staleTime: 5 * 60 * 1000,
  });

  // Compose final departmentIds array including special NO_DEPARTMENT_ID if allowed
  const departmentIds = hasFullAccess
    ? [] // Full access roles don't need department filtering
    : [
        ...uuidDepartmentIds,
        ...(canAccessNoDepartment ? [NO_DEPARTMENT_ID] : []),
      ];

  // Full access roles can always see archived, restricted roles need explicit permission
  const canAccessArchived = hasFullAccess || canAccessArchivedFlag;

  return {
    role,
    departmentIds,
    hasFullAccess,
    isLoading: authLoading || roleLoading || (!hasFullAccess && (deptLoading || noDeptLoading || archivedLoading)),
    userId: user?.id || null,
    canAccessArchived,
  };
}
