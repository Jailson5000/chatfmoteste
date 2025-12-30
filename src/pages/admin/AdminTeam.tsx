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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreHorizontal, UserPlus, Shield, Users, Headphones, Building2 } from "lucide-react";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useDepartments } from "@/hooks/useDepartments";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserRole";
import { InviteMemberDialog } from "@/components/admin/InviteMemberDialog";

const roleLabels: Record<AppRole, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; description: string }> = {
  admin: { label: "Administrador", variant: "default", description: "Acesso total ao sistema" },
  gerente: { label: "Gerente", variant: "secondary", description: "Acesso completo à operação" },
  advogado: { label: "Supervisor", variant: "outline", description: "Supervisão de equipe e conversas" },
  estagiario: { label: "Supervisor", variant: "outline", description: "Supervisão de equipe e conversas" },
  atendente: { label: "Atendente", variant: "outline", description: "Apenas departamentos selecionados" },
};

const roleIcons: Record<AppRole, React.ReactNode> = {
  admin: <Shield className="h-3 w-3" />,
  gerente: <Users className="h-3 w-3" />,
  advogado: <Users className="h-3 w-3" />,
  estagiario: <Users className="h-3 w-3" />,
  atendente: <Headphones className="h-3 w-3" />,
};

export default function AdminTeam() {
  const { members, isLoading, updateMemberRole, updateMemberDepartments, inviteMember } = useTeamMembers();
  const { departments } = useDepartments();
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editingDepartments, setEditingDepartments] = useState<{ memberId: string; departmentIds: string[] } | null>(null);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setUpdatingRole(userId);
    try {
      await updateMemberRole.mutateAsync({ memberId: userId, role: newRole });
      toast.success("Perfil atualizado com sucesso");
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Erro ao atualizar perfil");
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

  const handleInvite = async (data: { email: string; fullName: string; role: AppRole; departmentIds: string[] }) => {
    setInviting(true);
    try {
      await inviteMember.mutateAsync({
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        departmentIds: data.departmentIds,
      });
      
      toast.success("Convite enviado com sucesso");
    } catch (error: any) {
      // Propagate the error to the dialog
      throw error;
    } finally {
      setInviting(false);
    }
  };

  const handleDepartmentToggle = (deptId: string) => {
    if (!editingDepartments) return;
    
    setEditingDepartments(prev => {
      if (!prev) return null;
      const newDepts = prev.departmentIds.includes(deptId)
        ? prev.departmentIds.filter(id => id !== deptId)
        : [...prev.departmentIds, deptId];
      return { ...prev, departmentIds: newDepts };
    });
  };

  const handleSaveDepartments = async () => {
    if (!editingDepartments) return;
    
    try {
      await updateMemberDepartments.mutateAsync({
        memberId: editingDepartments.memberId,
        departmentIds: editingDepartments.departmentIds,
      });
      setEditingDepartments(null);
    } catch (error) {
      console.error("Error updating departments:", error);
    }
  };

  const getMemberDepartments = (departmentIds: string[]) => {
    return departments.filter(d => departmentIds.includes(d.id));
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
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Convidar Membro
        </Button>
      </div>

      {/* Roles Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Perfis de Acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Administrador</p>
                <p className="text-xs text-muted-foreground">Acesso total ao sistema e gestão de usuários</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <Users className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Gerente</p>
                <p className="text-xs text-muted-foreground">Acesso completo à operação e todos departamentos</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <Headphones className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Atendente</p>
                <p className="text-xs text-muted-foreground">Acesso apenas aos departamentos selecionados</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead>Perfil</TableHead>
                  <TableHead>Departamentos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const memberDepts = getMemberDepartments(member.department_ids);
                  const isAttendant = member.role === "atendente";
                  
                  return (
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
                        <Badge 
                          variant={roleLabels[member.role]?.variant || "outline"}
                          className="gap-1"
                        >
                          {roleIcons[member.role]}
                          {roleLabels[member.role]?.label || member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isAttendant ? (
                          <div className="flex flex-wrap gap-1">
                            {memberDepts.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">
                                Nenhum departamento
                              </span>
                            ) : (
                              memberDepts.slice(0, 2).map(dept => (
                                <Badge 
                                  key={dept.id} 
                                  variant="outline" 
                                  className="text-xs"
                                  style={{ borderColor: dept.color, color: dept.color }}
                                >
                                  {dept.name}
                                </Badge>
                              ))
                            )}
                            {memberDepts.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{memberDepts.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Todos os departamentos
                          </span>
                        )}
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
                              Tornar Administrador
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRoleChange(member.id, "gerente")}
                              disabled={member.role === "gerente"}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Tornar Gerente
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRoleChange(member.id, "atendente")}
                              disabled={member.role === "atendente"}
                            >
                              <Headphones className="h-4 w-4 mr-2" />
                              Tornar Atendente
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isAttendant && (
                              <DropdownMenuItem
                                onClick={() => setEditingDepartments({ 
                                  memberId: member.id, 
                                  departmentIds: member.department_ids 
                                })}
                              >
                                <Building2 className="h-4 w-4 mr-2" />
                                Gerenciar Departamentos
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(member.id, member.is_active)}
                            >
                              {member.is_active ? "Desativar" : "Ativar"} Usuário
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={handleInvite}
        isLoading={inviting}
      />

      {/* Edit Departments Dialog */}
      <Dialog open={!!editingDepartments} onOpenChange={() => setEditingDepartments(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Departamentos</DialogTitle>
            <DialogDescription>
              Selecione os departamentos que este atendente pode acessar
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[250px] border rounded-md p-3">
            {departments.filter(d => d.is_active).map((dept) => (
              <div
                key={dept.id}
                className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                onClick={() => handleDepartmentToggle(dept.id)}
              >
                <Checkbox
                  checked={editingDepartments?.departmentIds.includes(dept.id)}
                  onCheckedChange={() => handleDepartmentToggle(dept.id)}
                />
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: dept.color }}
                />
                <span className="text-sm">{dept.name}</span>
              </div>
            ))}
          </ScrollArea>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingDepartments(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDepartments}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
