import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useWhatsAppInstances, WhatsAppInstance } from "@/hooks/useWhatsAppInstances";
import { useUserRole } from "@/hooks/useUserRole";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";
import { useDepartments } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useToast } from "@/hooks/use-toast";
import { NewInstanceDialog } from "@/components/connections/NewInstanceDialog";
import { QRCodeDialog } from "@/components/connections/QRCodeDialog";
import { ConnectionDetailPanel } from "@/components/connections/ConnectionDetailPanel";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Connections() {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { evolutionApiUrl, evolutionApiKey, isConfigured: isApiConfigured } = useLawFirmSettings();
  const { departments } = useDepartments();
  const { members: teamMembers } = useTeamMembers();
  
  const {
    instances,
    isLoading,
    createInstance,
    getQRCode,
    getStatus,
    deleteInstance,
    configureWebhook,
    getSettings,
    setSettings,
    refreshStatus,
    refreshPhone,
    refetch,
    updateDefaultDepartment,
    updateDefaultStatus,
    updateDefaultAssigned,
  } = useWhatsAppInstances();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [isNewInstanceOpen, setIsNewInstanceOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [currentQRCode, setCurrentQRCode] = useState<string | null>(null);
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [rejectCalls, setRejectCalls] = useState<Record<string, boolean>>({});

  const MAX_POLLS = 60;
  const POLL_INTERVAL = 2000; // 2 seconds
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Stop polling function
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      console.log("[Connections] Stopping status polling");
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Start polling for connection status
  const startPolling = useCallback((instanceId: string) => {
    stopPolling();
    let count = 0;
    
    console.log("[Connections] Starting status polling for:", instanceId);
    
    pollIntervalRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      
      if (count >= MAX_POLLS) {
        console.log("[Connections] Max polls reached, stopping");
        stopPolling();
        setQrError("Tempo esgotado. Tente novamente.");
        return;
      }

      try {
        console.log(`[Connections] Polling status (${count}/${MAX_POLLS})...`);
        const result = await getStatus.mutateAsync(instanceId);
        console.log("[Connections] Poll result:", result);
        
        if (result.status === "open" || result.status === "connected" || result.evolutionState === "open") {
          console.log("[Connections] Instance connected! Stopping poll.");
          stopPolling();
          setConnectionStatus("Conectado!");
          setCurrentQRCode(null); // Hide QR code
          await refetch(); // Refresh instance list
          
          // Close dialog after showing success
          setTimeout(() => {
            setIsQRDialogOpen(false);
            setConnectionStatus(null);
            setPollCount(0);
          }, 1500);
        } else if (result.qrCode && result.qrCode !== currentQRCode) {
          // QR code updated (e.g., expired and regenerated)
          console.log("[Connections] QR code updated");
          setCurrentQRCode(result.qrCode);
        }
      } catch (error) {
        console.error("[Connections] Poll error:", error);
        // Continue polling despite errors
      }
    }, POLL_INTERVAL);
  }, [stopPolling, getStatus, refetch, currentQRCode]);

  const filteredInstances = useMemo(() => {
    if (!searchQuery.trim()) return instances;
    const q = searchQuery.toLowerCase();
    return instances.filter(
      (i) =>
        i.instance_name.toLowerCase().includes(q) ||
        i.phone_number?.toLowerCase().includes(q) ||
        i.instance_id?.toLowerCase().includes(q)
    );
  }, [instances, searchQuery]);

  const handleCreateInstance = async (displayName: string, instanceName: string) => {
    try {
      // Use the random instanceName for Evolution API, displayName for user display
      // apiUrl and apiKey are now optional - edge function will use default connection
      const result = await createInstance.mutateAsync({
        instanceName, // Technical ID for Evolution API
        displayName,  // User-friendly name
        // If tenant has configured their own API, use it; otherwise edge function uses global default
        ...(evolutionApiUrl && evolutionApiKey ? {
          apiUrl: evolutionApiUrl,
          apiKey: evolutionApiKey,
        } : {}),
      });

      setIsNewInstanceOpen(false);
      await refetch();

      if (result.qrCode && result.instance) {
        console.log("[Connections] New instance created with QR code, starting polling");
        setCurrentQRCode(result.qrCode);
        setCurrentInstanceId(result.instance.id);
        setConnectionStatus("Escaneie o QR Code");
        setPollCount(0);
        setIsQRDialogOpen(true);
        // Start polling for the new instance
        startPolling(result.instance.id);
      }
    } catch (error) {
      console.error("Create instance error:", error);
    }
  };

  const handleConnectInstance = async (instance: WhatsAppInstance) => {
    setCurrentInstanceId(instance.id);
    setCurrentQRCode(null);
    setQrError(null);
    setQrLoading(true);
    setConnectionStatus("Conectando...");
    setPollCount(0);
    setIsQRDialogOpen(true);
    stopPolling(); // Stop any existing polling

    try {
      console.log("[Connections] Getting QR code for instance:", instance.id);
      const result = await getQRCode.mutateAsync(instance.id);
      console.log("[Connections] QR code result:", result);

      if (result.status === "open" || result.status === "connected" || result.evolutionState === "open") {
        console.log("[Connections] Already connected!");
        setConnectionStatus("Conectado!");
        await refetch();
        setTimeout(() => {
          setIsQRDialogOpen(false);
          setConnectionStatus(null);
        }, 1500);
        return;
      }

      if (result.qrCode) {
        setCurrentQRCode(result.qrCode);
        setConnectionStatus("Escaneie o QR Code");
        // Start polling for status updates
        startPolling(instance.id);
      } else {
        setQrError("QR Code não disponível. Tente novamente.");
      }
    } catch (error) {
      console.error("[Connections] Error getting QR code:", error);
      setQrError(error instanceof Error ? error.message : "Erro ao obter QR Code");
    } finally {
      setQrLoading(false);
    }
  };

  const handleCloseQRDialog = () => {
    console.log("[Connections] Closing QR dialog");
    stopPolling();
    setIsQRDialogOpen(false);
    setCurrentQRCode(null);
    setCurrentInstanceId(null);
    setQrError(null);
    setConnectionStatus(null);
    setPollCount(0);
  };

  const getStatusBadge = (status: string | null) => {
    if (status === "connected") {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
          Conectado
        </Badge>
      );
    }
    if (status === "connecting" || status === "awaiting_qr") {
      return (
        <Badge variant="outline" className="text-amber-400 border-amber-400/30">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          Conectando
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <XCircle className="h-3 w-3 mr-1" />
        Desconectado
      </Badge>
    );
  };

  const getLastVerification = (instance: WhatsAppInstance) => {
    if (instance.last_webhook_at) {
      return formatDistanceToNow(new Date(instance.last_webhook_at), {
        addSuffix: true,
        locale: ptBR,
      });
    }
    return "—";
  };

  // Get a random department for display (in a real app, this would be stored per instance)
  const getDefaultDepartment = () => {
    if (departments.length > 0) {
      return departments[0];
    }
    return null;
  };

  // Get a random team member for display (in a real app, this would be stored per instance)
  const getDefaultResponsible = () => {
    if (teamMembers.length > 0) {
      return teamMembers[0];
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={`flex-1 p-6 space-y-6 transition-all ${selectedInstance ? "pr-0" : ""}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Conexões</h1>
            <p className="text-muted-foreground">
              Gerencie suas conexões com canais de comunicação.
            </p>
          </div>

          <Button onClick={() => setIsNewInstanceOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Conexão
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conexões..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Status Padrão</th>
                <th className="px-4 py-3 font-medium">Departamento padrão</th>
                <th className="px-4 py-3 font-medium">Responsável padrão</th>
                <th className="px-4 py-3 font-medium">Última Verificação</th>
                <th className="px-4 py-3 font-medium">Status da Conexão</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredInstances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    {searchQuery ? "Nenhuma conexão encontrada" : "Nenhuma conexão configurada"}
                  </td>
                </tr>
              ) : (
                filteredInstances.map((instance) => {
                  const dept = getDefaultDepartment();
                  const responsible = getDefaultResponsible();

                  return (
                    <tr
                      key={instance.id}
                      className={`hover:bg-muted/20 cursor-pointer transition-colors ${
                        selectedInstance?.id === instance.id ? "bg-muted/30" : ""
                      }`}
                      onClick={() => setSelectedInstance(instance)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {(instance.display_name || instance.instance_name).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-primary">
                              {instance.display_name || instance.instance_name}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{instance.phone_number || "Sem número"}</span>
                              {instance.instance_id && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {instance.instance_id.slice(0, 4).toUpperCase()}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">—</td>
                      <td className="px-4 py-3">
                        {dept ? (
                          <Badge variant="outline">{dept.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {responsible ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={responsible.avatar_url || undefined} />
                              <AvatarFallback className="text-xs bg-primary/20 text-primary">
                                {responsible.full_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{responsible.full_name}</span>
                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1">
                              IA
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {getLastVerification(instance)}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(instance.status)}</td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedInstance(instance)}>
                              Ver detalhes
                            </DropdownMenuItem>
                            {instance.status !== "connected" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConnectInstance(instance);
                                }}
                              >
                                Conectar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                refreshStatus.mutate(instance.id);
                              }}
                            >
                              Atualizar status
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteInstance.mutate(instance.id);
                              }}
                            >
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      <Sheet open={!!selectedInstance} onOpenChange={(open) => !open && setSelectedInstance(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] p-0 overflow-hidden">
          {selectedInstance && (
            <ConnectionDetailPanel
              instance={selectedInstance}
              onClose={() => setSelectedInstance(null)}
              onConnect={handleConnectInstance}
              onDelete={(id) => {
                deleteInstance.mutate(id);
                setSelectedInstance(null);
              }}
              onRefreshStatus={() => refreshStatus.mutate(selectedInstance.id)}
              onRefreshPhone={() => refreshPhone.mutate(selectedInstance.id)}
              onConfigureWebhook={() => configureWebhook.mutate(selectedInstance.id)}
              rejectCalls={rejectCalls[selectedInstance.id] ?? false}
              onToggleRejectCalls={async (enabled) => {
                setRejectCalls((prev) => ({ ...prev, [selectedInstance.id]: enabled }));
                try {
                  await setSettings.mutateAsync({ instanceId: selectedInstance.id, rejectCall: enabled });
                } catch {
                  setRejectCalls((prev) => ({ ...prev, [selectedInstance.id]: !enabled }));
                }
              }}
              onUpdateDefaultDepartment={(departmentId) => {
                updateDefaultDepartment.mutate({ instanceId: selectedInstance.id, departmentId });
              }}
              onUpdateDefaultStatus={(statusId) => {
                updateDefaultStatus.mutate({ instanceId: selectedInstance.id, statusId });
              }}
              onUpdateDefaultAssigned={(userId) => {
                updateDefaultAssigned.mutate({ instanceId: selectedInstance.id, userId });
              }}
              isLoading={{
                status: refreshStatus.isPending,
                phone: refreshPhone.isPending,
                delete: deleteInstance.isPending,
                webhook: configureWebhook.isPending,
                settings: setSettings.isPending,
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* New Instance Dialog */}
      <NewInstanceDialog
        open={isNewInstanceOpen}
        onClose={() => setIsNewInstanceOpen(false)}
        onCreate={handleCreateInstance}
        isCreating={createInstance.isPending}
      />

      {/* QR Code Dialog */}
      <QRCodeDialog
        open={isQRDialogOpen}
        onClose={handleCloseQRDialog}
        onRetry={() => {
          if (currentInstanceId) {
            const instance = instances.find((i) => i.id === currentInstanceId);
            if (instance) handleConnectInstance(instance);
          }
        }}
        qrCode={currentQRCode}
        isLoading={qrLoading}
        error={qrError}
        connectionStatus={connectionStatus}
        pollCount={pollCount}
        maxPolls={MAX_POLLS}
      />
    </div>
  );
}
