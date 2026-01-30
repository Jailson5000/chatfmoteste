import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, 
  Shield, 
  UserCog, 
  UserCheck, 
  User,
  Mail,
  Phone,
  Calendar,
  Building2,
  RefreshCw,
  AlertCircle,
  Wifi
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUserPresence } from "@/hooks/useUserPresence";
import { UserPresenceIndicator } from "@/components/ui/UserPresenceIndicator";

interface CompanyUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: {
    id: string;
    name: string;
    law_firm_id: string | null;
  } | null;
}

interface CompanyUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  job_title: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  last_seen_at: string | null;
  role: string | null;
}

const roleLabels: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: "Administrador", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: Shield },
  gerente: { label: "Gerente", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: UserCog },
  advogado: { label: "Supervisor", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: UserCheck },
  estagiario: { label: "Supervisor", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: UserCheck },
  atendente: { label: "Atendente", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: User },
};

export function CompanyUsersDialog({ open, onOpenChange, company }: CompanyUsersDialogProps) {
  const { onlineUsers, isUserOnline, onlineCount } = useUserPresence(company?.law_firm_id ?? null);

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["company-users", company?.law_firm_id],
    queryFn: async () => {
      if (!company?.law_firm_id) return [];

      // Get profiles for this law firm
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, phone, job_title, is_active, must_change_password, created_at, last_seen_at")
        .eq("law_firm_id", company.law_firm_id)
        .order("last_seen_at", { ascending: false, nullsFirst: false });

      if (profilesError) throw profilesError;

      // Get roles for these users
      const userIds = profiles?.map(p => p.id) || [];
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      return profiles?.map(profile => ({
        ...profile,
        role: rolesMap.get(profile.id) || null,
      })) as CompanyUser[];
    },
    enabled: open && !!company?.law_firm_id,
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatLastSeen = (lastSeenAt: string | null) => {
    if (!lastSeenAt) return "Nunca acessou";
    
    try {
      const date = new Date(lastSeenAt);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
      
      if (diffMinutes < 1) return "Agora";
      if (diffMinutes < 60) return `Há ${diffMinutes} min`;
      
      return formatDistanceToNow(date, { locale: ptBR, addSuffix: true });
    } catch {
      return "Data inválida";
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    online: onlineCount,
    admins: users.filter(u => u.role === "admin").length,
    pendingPassword: users.filter(u => u.must_change_password).length,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Usuários da Empresa
          </DialogTitle>
          <DialogDescription>
            {company?.name} - Visualize todos os usuários vinculados a esta empresa
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 py-4">
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="p-3 rounded-lg border bg-green-500/10">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-xs text-green-400">Online</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-400">{stats.online}</p>
          </div>
          <div className="p-3 rounded-lg border bg-blue-500/10">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-blue-400">Ativos</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-400">{stats.active}</p>
          </div>
          <div className="p-3 rounded-lg border bg-red-500/10">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-500" />
              <span className="text-xs text-red-400">Admins</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-400">{stats.admins}</p>
          </div>
          <div className="p-3 rounded-lg border bg-amber-500/10">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-amber-400">Senha</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-400">{stats.pendingPassword}</p>
          </div>
        </div>

        {/* Users Table */}
        <ScrollArea className="h-[400px] border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum usuário encontrado</p>
              <p className="text-sm">Esta empresa ainda não possui usuários cadastrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Status</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const roleConfig = user.role ? roleLabels[user.role] : null;
                  const RoleIcon = roleConfig?.icon || User;
                  const userIsOnline = isUserOnline(user.id);

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <UserPresenceIndicator
                          isOnline={userIsOnline}
                          lastSeenAt={user.last_seen_at}
                          size="md"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback className="bg-muted text-xs">
                                {getInitials(user.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            {userIsOnline && (
                              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </div>
                            {user.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {user.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {roleConfig ? (
                          <Badge 
                            variant="outline" 
                            className={`flex items-center gap-1 w-fit ${roleConfig.color}`}
                          >
                            <RoleIcon className="h-3 w-3" />
                            {roleConfig.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sem cargo
                          </Badge>
                        )}
                        {user.job_title && (
                          <p className="text-xs text-muted-foreground mt-1">{user.job_title}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge 
                            variant="outline" 
                            className={user.is_active 
                              ? "bg-green-500/20 text-green-400 border-green-500/30 w-fit" 
                              : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30 w-fit"
                            }
                          >
                            {user.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                          {user.must_change_password && (
                            <Badge 
                              variant="outline" 
                              className="bg-amber-500/20 text-amber-400 border-amber-500/30 w-fit text-xs"
                            >
                              Trocar senha
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserPresenceIndicator
                            isOnline={userIsOnline}
                            lastSeenAt={user.last_seen_at}
                            size="sm"
                          />
                          <span className={userIsOnline ? "text-green-400 font-medium" : "text-muted-foreground"}>
                            {userIsOnline ? "Online agora" : formatLastSeen(user.last_seen_at)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(user.created_at), "HH:mm", { locale: ptBR })}
                        </p>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <p className="text-xs text-muted-foreground">
            Os usuários são gerenciados pelo administrador da empresa no painel do cliente
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
