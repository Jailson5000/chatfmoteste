import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";
import { useCompanyLimits } from "./useCompanyLimits";
import type { AppRole } from "./useUserRole";

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  oab_number: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role: AppRole;
  department_ids: string[];
}

export interface MemberDepartment {
  id: string;
  member_id: string;
  department_id: string;
}

export function useTeamMembers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { checkLimit, refetch: refetchLimits } = useCompanyLimits();
  const queryClient = useQueryClient();

  // Fetch all team members with their roles
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      // Get the user's law firm id
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id || "")
        .single();

      if (!profile?.law_firm_id) return [];

      // Get all profiles in the law firm
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("law_firm_id", profile.law_firm_id);

      if (profilesError) throw profilesError;

      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Get member departments
      let memberDepts: Array<{ member_id: string; department_id: string }> = [];
      try {
        const { data } = await supabase
          .from("member_departments")
          .select("member_id, department_id");
        memberDepts = data || [];
      } catch (e) {
        // Table might not exist yet
        memberDepts = [];
      }

      // Map profiles with their roles and departments
      return profiles.map((p) => {
        const userRole = roles.find((r) => r.user_id === p.id);
        const deptIds = (memberDepts || [])
          .filter((md: any) => md.member_id === p.id)
          .map((md: any) => md.department_id);

        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          oab_number: p.oab_number,
          avatar_url: p.avatar_url,
          is_active: p.is_active,
          role: (userRole?.role || "atendente") as AppRole,
          department_ids: deptIds,
        };
      });
    },
    enabled: !!user,
  });

  // Update member role
  const updateMemberRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({
        title: "Função atualizada",
        description: "A função do membro foi atualizada com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar função",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update member departments
  const updateMemberDepartments = useMutation({
    mutationFn: async ({ memberId, departmentIds }: { memberId: string; departmentIds: string[] }) => {
      // First delete existing departments
      await supabase
        .from("member_departments" as any)
        .delete()
        .eq("member_id", memberId);

      // Then insert new ones
      if (departmentIds.length > 0) {
        const { error } = await supabase
          .from("member_departments" as any)
          .insert(departmentIds.map((deptId) => ({
            member_id: memberId,
            department_id: deptId,
          })));

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({
        title: "Departamentos atualizados",
        description: "Os departamentos do membro foram atualizados.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar departamentos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Invite new member
  const inviteMember = useMutation({
    mutationFn: async ({ 
      email, 
      fullName, 
      role, 
      departmentIds = [] 
    }: { 
      email: string; 
      fullName: string; 
      role: AppRole; 
      departmentIds?: string[];
    }) => {
      // Check limit before creating
      const limitCheck = await checkLimit('users', 1, true);
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || "Limite de usuários atingido. Considere fazer um upgrade do seu plano.");
      }

      // Get the user's law firm id
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id || "")
        .single();

      if (!profile?.law_firm_id) throw new Error("Escritório não encontrado");

      // Call edge function to create user and send email
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: {
          email,
          full_name: fullName,
          role,
          law_firm_id: profile.law_firm_id,
          department_ids: departmentIds,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      refetchLimits();
      toast({
        title: "Convite enviado",
        description: data?.email_sent 
          ? "Um email de convite foi enviado para o novo membro."
          : "Membro adicionado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao convidar membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove member
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({
        title: "Membro removido",
        description: "O membro foi desativado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    members,
    isLoading,
    updateMemberRole,
    updateMemberDepartments,
    inviteMember,
    removeMember,
  };
}
