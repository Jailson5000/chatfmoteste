import { useState } from "react";
import { WhatsAppInstance } from "@/hooks/useWhatsAppInstances";
import { useDepartments } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  Check,
  Calendar,
  Server,
  Hash,
  Copy,
  Power,
  RotateCcw,
  Trash2,
  PhoneOff,
  Circle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building2,
  User,
} from "lucide-react";
import { formatDistanceToNow, format, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ConnectionDetailPanelProps {
  instance: WhatsAppInstance & { default_department_id?: string | null };
  onClose: () => void;
  onConnect: (instance: WhatsAppInstance) => void;
  onDelete: (id: string) => void;
  onRefreshStatus: () => void;
  onRefreshPhone: () => void;
  onConfigureWebhook: () => void;
  rejectCalls: boolean;
  onToggleRejectCalls: (enabled: boolean) => void;
  onUpdateDefaultDepartment: (departmentId: string | null) => void;
  isLoading: {
    status: boolean;
    phone: boolean;
    delete: boolean;
    webhook: boolean;
    settings: boolean;
  };
}

export function ConnectionDetailPanel({
  instance,
  onClose,
  onConnect,
  onDelete,
  onRefreshStatus,
  onRefreshPhone,
  onConfigureWebhook,
  rejectCalls,
  onToggleRejectCalls,
  onUpdateDefaultDepartment,
  isLoading,
}: ConnectionDetailPanelProps) {
  const { toast } = useToast();
  const { departments } = useDepartments();
  const { members: teamMembers } = useTeamMembers();
  const { statuses } = useCustomStatuses();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const isConnected = instance.status === "connected";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: `${label} copiado para a área de transferência.` });
  };

  // Generate uptime data for last 30 days (mock)
  const uptimeData = eachDayOfInterval({
    start: subDays(new Date(), 29),
    end: new Date(),
  }).map((date) => ({
    date,
    status: Math.random() > 0.1 ? "connected" : "disconnected",
  }));

  const uptimePercentage = (uptimeData.filter((d) => d.status === "connected").length / uptimeData.length) * 100;

  // Mock logs data
  const logs = [
    {
      status: "Conectado",
      event: "WhatsApp conectado",
      duration: "3d 11h 24min",
      date: "24/12 13:47",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b">
        <h2 className="text-lg font-semibold">Detalhes da Instância</h2>
      </div>

      <ScrollArea className="flex-1">
        <Tabs defaultValue="geral" className="w-full">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="config">Configurações</TabsTrigger>
              <TabsTrigger value="acoes">Ações</TabsTrigger>
            </TabsList>
          </div>

          {/* Geral Tab */}
          <TabsContent value="geral" className="p-6 space-y-6">
            {/* Instance Info */}
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {instance.instance_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isConnected && (
                  <div className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-lg mt-4">{instance.instance_name}</h3>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <span>{instance.phone_number || "Sem número"}</span>
                {instance.instance_id && (
                  <Badge variant="secondary" className="text-xs">
                    {instance.instance_id.slice(0, 4).toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>

            {/* Status Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  isConnected ? "bg-emerald-400" : "bg-muted-foreground"
                )} />
                <span className="font-medium">{isConnected ? "Conectado" : "Desconectado"}</span>
              </div>
              <Button variant="link" size="sm" className="text-primary gap-1" onClick={onClose}>
                Ver eventos <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Sync Info */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4" />
                <span>Última sincronização há {instance.last_webhook_at 
                  ? formatDistanceToNow(new Date(instance.last_webhook_at), { locale: ptBR })
                  : "—"}.
                </span>
                <Button variant="link" size="sm" className="text-primary h-auto p-0" onClick={onRefreshStatus}>
                  Ver mais
                </Button>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4" />
                <span>Verificado há {instance.updated_at 
                  ? formatDistanceToNow(new Date(instance.updated_at), { locale: ptBR })
                  : "—"}.
                </span>
              </div>
            </div>

            <Separator />

            {/* Default Classes */}
            <div className="space-y-3">
              <h4 className="font-medium">Classes Padrão</h4>
              
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Status</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>Departamento Padrão</span>
                </div>
                <Select
                  value={instance.default_department_id || "none"}
                  onValueChange={(value) => onUpdateDefaultDepartment(value === "none" ? null : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: dept.color }}
                          />
                          {dept.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Novos clientes desta instância serão vinculados automaticamente a este departamento.
                </p>
              </div>
            </div>

            <Separator />

            {/* Default Responsible */}
            <div className="space-y-3">
              <h4 className="font-medium">Responsável Padrão</h4>
              
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                {teamMembers.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={teamMembers[0].avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {teamMembers[0].full_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{teamMembers[0].full_name}</span>
                    <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1">
                      IA
                    </Badge>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum responsável</span>
                )}
                
                <p className="text-xs text-primary mt-3">
                  Sempre que uma nova conversa for iniciada com este contato, o responsável abaixo será associado automaticamente. Se você não selecionar nenhum responsável padrão, você ainda pode utilizar keywords.{" "}
                  <Button variant="link" size="sm" className="text-primary h-auto p-0 text-xs">
                    Ver mais
                  </Button>
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="p-6 space-y-6">
            {/* Uptime Chart */}
            <div className="space-y-3">
              <div className="flex gap-1">
                {uptimeData.map((day, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 h-8 rounded-sm",
                      day.status === "connected" ? "bg-emerald-500" : "bg-muted"
                    )}
                    title={format(day.date, "dd/MM/yyyy")}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{format(subDays(new Date(), 29), "dd/MM/yyyy")}</span>
                <span>{format(new Date(), "dd/MM/yyyy")}</span>
              </div>
            </div>

            {/* Uptime Badge */}
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                {uptimePercentage.toFixed(1)}% uptime (30 dias)
              </Badge>
              <span className="text-sm text-muted-foreground">
                Últimas {logs.length} movimentações entre estados
              </span>
            </div>

            {/* Logs Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Evento</th>
                    <th className="px-4 py-2 text-right font-medium">Duração</th>
                    <th className="px-4 py-2 text-right font-medium">Data</th>
                    <th className="px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-3">
                        <span className="text-emerald-400">{log.status}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{log.event}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="outline" className="font-mono">
                          • {log.duration}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{log.date}</td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="p-6 space-y-6">
            {/* Reject Calls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PhoneOff className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Recusar Chamadas</p>
                  <p className="text-sm text-muted-foreground">Rejeitar chamadas automaticamente</p>
                </div>
              </div>
              <Switch
                checked={rejectCalls}
                onCheckedChange={onToggleRejectCalls}
                disabled={!isConnected || isLoading.settings}
              />
            </div>

            <Separator />

            {/* Technical Details */}
            <div className="space-y-3">
              <button
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="flex items-center justify-between w-full text-left p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <div>
                  <p className="font-medium">Detalhes técnicos</p>
                  <p className="text-sm text-muted-foreground">Informações técnicas da conexão</p>
                </div>
                <span className="text-primary">
                  {showTechnicalDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="ml-1 text-sm">Ver {showTechnicalDetails ? "menos" : "mais"}</span>
                </span>
              </button>

              {showTechnicalDetails && (
                <div className="space-y-4 p-4 rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Última Sincronização</p>
                      <p className="text-sm text-muted-foreground">
                        {instance.updated_at 
                          ? format(new Date(instance.updated_at), "dd/MM/yyyy, HH:mm:ss 'BRT'", { locale: ptBR })
                          : "—"
                        }
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Server className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Servidor</p>
                      <p className="text-sm text-muted-foreground">
                        {instance.api_url ? new URL(instance.api_url).hostname : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">ID da Instância</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground font-mono truncate">
                          {instance.id}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => copyToClipboard(instance.id, "ID")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="acoes" className="p-6 space-y-4">
            <h4 className="font-medium">Ações da Instância</h4>

            {/* Disconnect */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Power className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Desconectar Instância</p>
                  <p className="text-sm text-muted-foreground">Parar desconectar o WhatsApp</p>
                </div>
              </div>
              <Button variant="outline" disabled={!isConnected}>
                Desconectar
              </Button>
            </div>

            {/* Restart */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Reiniciar Instância</p>
                  <p className="text-sm text-muted-foreground">
                    Reiniciar conexão não desconecta e não causa perda de mensagens.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={onConfigureWebhook} disabled={isLoading.webhook}>
                {isLoading.webhook && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reiniciar
              </Button>
            </div>

            {/* Delete */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/50 bg-destructive/5">
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Excluir Instância</p>
                  <p className="text-sm text-destructive/80">
                    Para excluir esta instância, primeiro é necessário desconectá-la.
                    <br />
                    Clique em "Desconectar" acima e depois volte aqui para excluir.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => onDelete(instance.id)}
                disabled={isConnected || isLoading.delete}
              >
                {isLoading.delete && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Excluir
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
}
