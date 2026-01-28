import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Users, Headphones, AlertCircle, Mail, CheckCircle2 } from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (data: { email: string; fullName: string; role: AppRole; departmentIds: string[] }) => Promise<any>;
  isLoading?: boolean;
}

const roles: { value: AppRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "admin",
    label: "Administrador",
    description: "Acesso total ao sistema e a todos os módulos",
    icon: <Shield className="h-4 w-4" />,
  },
  {
    value: "gerente",
    label: "Gerente",
    description: "Acesso completo à operação, todos os departamentos",
    icon: <Users className="h-4 w-4" />,
  },
  {
    value: "advogado",
    label: "Supervisor",
    description: "Supervisão de equipe e acompanhamento de conversas",
    icon: <Users className="h-4 w-4" />,
  },
  {
    value: "atendente",
    label: "Atendente",
    description: "Acesso restrito - configure departamentos após criação",
    icon: <Headphones className="h-4 w-4" />,
  },
];

export function InviteMemberDialog({ open, onOpenChange, onInvite, isLoading }: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("atendente");
  const [error, setError] = useState("");

  const selectedRole = roles.find(r => r.value === role);

  const resetForm = () => {
    setEmail("");
    setFullName("");
    setRole("atendente");
    setError("");
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !fullName) {
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      await onInvite({
        email,
        fullName,
        role,
        departmentIds: [], // Departamentos são configurados após criação
      });
      
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Erro ao convidar membro");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Convidar Membro
          </DialogTitle>
          <DialogDescription>
            Adicione um novo membro à sua equipe. Um email será enviado automaticamente com as credenciais de acesso.
          </DialogDescription>
        </DialogHeader>

        {/* Email notice */}
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Envio automático de credenciais</p>
            <p className="mt-0.5 text-muted-foreground">
              O novo membro receberá um email com login e senha temporária para acessar o sistema.
            </p>
          </div>
        </div>

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

          {role === "atendente" && (
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>Após criar o membro, edite-o para configurar os departamentos que ele poderá acessar.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
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
