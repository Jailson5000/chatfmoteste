import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserPlus, Shield, User, Briefcase, GraduationCap } from "lucide-react";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserRole";

const roleLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  admin: { label: "Administrador", variant: "default" },
  advogado: { label: "Advogado", variant: "secondary" },
  estagiario: { label: "Estagiário", variant: "outline" },
  atendente: { label: "Atendente", variant: "outline" },
};

const roleIcons: Record<string, React.ReactNode> = {
  admin: <Shield className="h-3 w-3" />,
  advogado: <Briefcase className="h-3 w-3" />,
  estagiario: <GraduationCap className="h-3 w-3" />,
  atendente: <User className="h-3 w-3" />,
};

export default function AdminTeam() {
  const { members, isLoading, updateMemberRole } = useTeamMembers();
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setUpdatingRole(userId);
    try {
      await updateMemberRole.mutateAsync({ memberId: userId, role: newRole });
      toast.success("Role atualizada com sucesso");
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Erro ao atualizar role");
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !currentStatus })
        .eq("id", userId);

      if (error) throw error;

      toast.success(currentStatus ? "Usuário desativado" : "Usuário ativado");
    } catch (error) {
      console.error("Error toggling user status:", error);
      toast.error("Erro ao alterar status do usuário");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">
            Gerencie os membros da sua equipe e suas permissões
          </p>
        </div>
        <Button disabled className="gap-2">
          <UserPlus className="h-4 w-4" />
          Convidar Membro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros da Equipe</CardTitle>
          <CardDescription>
            {members.length} membro{members.length !== 1 ? "s" : ""} cadastrado{members.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membro</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback>
                            {member.full_name?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.full_name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{member.oab_number || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={roleLabels[member.role]?.variant || "outline"}
                        className="gap-1"
                      >
                        {roleIcons[member.role]}
                        {roleLabels[member.role]?.label || member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.is_active ? "default" : "secondary"}>
                        {member.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={updatingRole === member.id}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, "admin")}
                            disabled={member.role === "admin"}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            Tornar Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, "advogado")}
                            disabled={member.role === "advogado"}
                          >
                            <Briefcase className="h-4 w-4 mr-2" />
                            Tornar Advogado
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, "estagiario")}
                            disabled={member.role === "estagiario"}
                          >
                            <GraduationCap className="h-4 w-4 mr-2" />
                            Tornar Estagiário
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, "atendente")}
                            disabled={member.role === "atendente"}
                          >
                            <User className="h-4 w-4 mr-2" />
                            Tornar Atendente
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(member.id, member.is_active)}
                          >
                            {member.is_active ? "Desativar" : "Ativar"} Usuário
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
