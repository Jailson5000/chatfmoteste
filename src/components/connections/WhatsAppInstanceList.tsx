import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  QrCode,
  Trash2,
  Loader2,
  Phone,
  Activity,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsAppInstance } from "@/hooks/useWhatsAppInstances";

interface WhatsAppInstanceListProps {
  instances: WhatsAppInstance[];
  rejectCalls: Record<string, boolean>;
  rejectBusyId: string | null;
  onConnect: (instance: WhatsAppInstance) => void;
  onDelete: (id: string) => void;
  onRefreshStatus: (id: string) => void;
  onRefreshPhone: (id: string) => void;
  onConfigureWebhook: (id: string) => void;
  onToggleRejectCalls: (instance: WhatsAppInstance, enabled: boolean) => void;
  isRefreshingStatus: boolean;
  isRefreshingPhone: boolean;
  isDeleting: boolean;
  isGettingQR: boolean;
  isConfiguringWebhook: boolean;
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "connected":
      return (
        <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Conectado
        </Badge>
      );
    case "connecting":
    case "awaiting_qr":
      return (
        <Badge variant="outline" className="text-warning border-warning/30">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          Conectando
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <XCircle className="h-3 w-3 mr-1" />
          Desconectado
        </Badge>
      );
  }
}

export function WhatsAppInstanceList({
  instances,
  rejectCalls,
  rejectBusyId,
  onConnect,
  onDelete,
  onRefreshStatus,
  onRefreshPhone,
  onConfigureWebhook,
  onToggleRejectCalls,
  isRefreshingStatus,
  isRefreshingPhone,
  isDeleting,
  isGettingQR,
  isConfiguringWebhook,
}: WhatsAppInstanceListProps) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <QrCode className="h-16 w-16 mb-4 opacity-50" />
        <p className="font-medium mb-1">Nenhuma instância configurada</p>
        <p className="text-sm text-center max-w-md">
          Clique em "Nova Conexão WhatsApp" para adicionar um número
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Último Evento</TableHead>
            <TableHead>Rejeitar Ligações</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {instances.map((instance) => {
            const rejectCall = rejectCalls[instance.id] ?? false;
            const isBusy = rejectBusyId === instance.id;
            const canToggle = instance.status === "connected";
            const lastWebhookAt = instance.last_webhook_at;
            const lastWebhookEvent = instance.last_webhook_event;

            return (
              <TableRow key={instance.id}>
                <TableCell className="font-medium">{instance.instance_name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {instance.phone_number || "—"}
                    </span>
                    {instance.status === "connected" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onRefreshPhone(instance.id)}
                            disabled={isRefreshingPhone}
                          >
                            {isRefreshingPhone ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Phone className="h-3 w-3" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Atualizar número</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(instance.status)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onRefreshStatus(instance.id)}
                          disabled={isRefreshingStatus}
                        >
                          {isRefreshingStatus ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Atualizar status</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell>
                  {lastWebhookEvent ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-xs">
                          <Activity className="h-3 w-3 text-success" />
                          <span className="truncate max-w-[100px]">{lastWebhookEvent}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Evento: {lastWebhookEvent}</p>
                        <p>
                          {lastWebhookAt
                            ? new Date(lastWebhookAt).toLocaleString("pt-BR")
                            : "—"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-xs text-muted-foreground">Nenhum</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rejectCall}
                      onCheckedChange={(checked) => onToggleRejectCalls(instance, checked)}
                      disabled={!canToggle || isBusy}
                    />
                    <span className="text-xs text-muted-foreground">
                      {rejectCall ? "Rejeitando" : "Aceitar"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    {instance.status !== "connected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onConnect(instance)}
                        disabled={isGettingQR}
                      >
                        <QrCode className="h-4 w-4 mr-1" />
                        Conectar
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onConfigureWebhook(instance.id)}
                          disabled={isConfiguringWebhook}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reconfigurar webhook</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(instance.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
