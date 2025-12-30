import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Users, Headphones, AlertCircle } from "lucide-react";
import { useDepartments } from "@/hooks/useDepartments";
import type { AppRole } from "@/hooks/useUserRole";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (data: { email: string; fullName: string; role: AppRole; departmentIds: string[] }) => Promise<void>;
  isLoading?: boolean;
}

const roles: { value: AppRole; label: string; description: string; icon: React.ReactNode; requiresDepartments: boolean }[] = [
  {
    value: "admin",
    label: "Administrador",
    description: "Acesso total ao sistema e a todos os módulos",
    icon: <Shield className="h-4 w-4" />,
    requiresDepartments: false,
  },
  {
    value: "gerente",
    label: "Gerente",
    description: "Acesso completo à operação, todos os departamentos",
    icon: <Users className="h-4 w-4" />,
    requiresDepartments: false,
  },
  {
    value: "atendente",
    label: "Atendente",
    description: "Acesso apenas aos departamentos selecionados",
    icon: <Headphones className="h-4 w-4" />,
    requiresDepartments: true,
  },
];

export function InviteMemberDialog({ open, onOpenChange, onInvite, isLoading }: InviteMemberDialogProps) {
  const { departments } = useDepartments();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("atendente");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [error, setError] = useState("");

  const selectedRole = roles.find(r => r.value === role);
  const requiresDepartments = selectedRole?.requiresDepartments ?? false;

  const handleDepartmentToggle = (deptId: string) => {
    setSelectedDepartments(prev =>
      prev.includes(deptId)
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !fullName) {
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    if (requiresDepartments && selectedDepartments.length === 0) {
      setError("Selecione pelo menos um departamento para o Atendente");
      return;
    }

    try {
      await onInvite({
        email,
        fullName,
        role,
        departmentIds: requiresDepartments ? selectedDepartments : [],
      });
      
      // Reset form
      setEmail("");
      setFullName("");
      setRole("atendente");
      setSelectedDepartments([]);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Erro ao convidar membro");
    }
  };

  const handleClose = () => {
    setEmail("");
    setFullName("");
    setRole("atendente");
    setSelectedDepartments([]);
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Convidar Membro</DialogTitle>
          <DialogDescription>
            Adicione um novo membro à sua equipe. Um email será enviado com as credenciais de acesso.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome Completo *</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="João Silva"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Perfil de Acesso *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <div className="flex items-center gap-2">
                      {r.icon}
                      <div className="flex flex-col">
                        <span>{r.label}</span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedRole.description}
              </p>
            )}
          </div>

          {requiresDepartments && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Departamentos *
                <Badge variant="secondary" className="text-xs">
                  {selectedDepartments.length} selecionado{selectedDepartments.length !== 1 ? "s" : ""}
                </Badge>
              </Label>
              <ScrollArea className="h-[150px] border rounded-md p-3">
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum departamento cadastrado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {departments.filter(d => d.is_active).map((dept) => (
                      <div
                        key={dept.id}
                        className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleDepartmentToggle(dept.id)}
                      >
                        <Checkbox
                          checked={selectedDepartments.includes(dept.id)}
                          onCheckedChange={() => handleDepartmentToggle(dept.id)}
                        />
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: dept.color }}
                        />
                        <span className="text-sm">{dept.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                O Atendente só terá acesso às conversas dos departamentos selecionados
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Enviando..." : "Enviar Convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
