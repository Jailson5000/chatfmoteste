import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Globe,
  Bot,
  Phone,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useWhatsAppInstances, WhatsAppInstance } from "@/hooks/useWhatsAppInstances";
import { useUserRole } from "@/hooks/useUserRole";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";
import { useDepartments } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useAutomations } from "@/hooks/useAutomations";
import { useToast } from "@/hooks/use-toast";
import { useTrayIntegration } from "@/hooks/useTrayIntegration";
import { NewInstanceDialog } from "@/components/connections/NewInstanceDialog";
import { QRCodeDialog } from "@/components/connections/QRCodeDialog";
import { ConnectionDetailPanel } from "@/components/connections/ConnectionDetailPanel";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export default function Connections() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { evolutionApiUrl, evolutionApiKey, isConfigured: isApiConfigured } = useLawFirmSettings();
  const { departments } = useDepartments();
  const { members: teamMembers } = useTeamMembers();
  const { statuses } = useCustomStatuses();
  const { automations } = useAutomations();
  const { 
    integration: trayIntegration, 
    isLoading: trayLoading, 
    updateSettings: updateTraySettings,
    isUpdatingSettings: isUpdatingTraySettings 
  } = useTrayIntegration();
  
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
    updateDefaultAutomation,
  } = useWhatsAppInstances();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [isTrayDetailOpen, setIsTrayDetailOpen] = useState(false);
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
              {/* Tray Chat Integration Row */}
              {trayIntegration?.is_enabled && (
                <tr 
                  className={`hover:bg-muted/20 cursor-pointer transition-colors bg-gradient-to-r from-orange-500/5 to-transparent ${
                    isTrayDetailOpen ? "bg-muted/30" : ""
                  }`}
                  onClick={() => setIsTrayDetailOpen(true)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                        <Globe className="h-5 w-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="font-medium text-orange-500">Chat no Site (Tray)</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Widget de atendimento</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-500 border-orange-500/20">
                            WEB
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {trayIntegration.default_status_id ? (
                      (() => {
                        const status = statuses.find(s => s.id === trayIntegration.default_status_id);
                        return status ? (
                          <Badge variant="outline" style={{ borderColor: status.color, color: status.color }}>
                            {status.name}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>;
                      })()
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {trayIntegration.default_department_id ? (
                      (() => {
                        const dept = departments.find(d => d.id === trayIntegration.default_department_id);
                        return dept ? (
                          <Badge variant="outline" style={{ borderColor: dept.color, color: dept.color }}>
                            {dept.name}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>;
                      })()
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {trayIntegration.default_automation_id ? (
                      (() => {
                        const agent = automations.find(a => a.id === trayIntegration.default_automation_id);
                        return agent ? (
                          <div className="flex items-center gap-2">
                            <Bot className="h-3 w-3 text-blue-500" />
                            <span className="text-sm">{agent.name}</span>
                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1">IA</Badge>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>;
                      })()
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {trayIntegration.activated_at 
                      ? formatDistanceToNow(new Date(trayIntegration.activated_at), { addSuffix: true, locale: ptBR })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                      Ativo
                    </Badge>
                  </td>
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
                        <DropdownMenuItem onClick={() => setIsTrayDetailOpen(true)}>
                          Ver detalhes
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )}
              
              {/* WhatsApp Instances */}
              {filteredInstances.length === 0 && !trayIntegration?.is_enabled ? (
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
                              {instance.phone_number ? (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-emerald-500" />
                                  <span className="text-foreground">
                                    {(() => {
                                      const raw = instance.phone_number.replace(/\D/g, '');
                                      if (raw.length === 13) {
                                        return `+${raw.slice(0,2)} (${raw.slice(2,4)}) ${raw.slice(4,9)}-${raw.slice(9)}`;
                                      } else if (raw.length === 12) {
                                        return `+${raw.slice(0,2)} (${raw.slice(2,4)}) ${raw.slice(4,8)}-${raw.slice(8)}`;
                                      }
                                      return instance.phone_number;
                                    })()}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      refreshPhone.mutate(instance.id, {
                                        onSuccess: (data) => {
                                          if (data?.phoneNumber) {
                                            toast({ title: "Número atualizado", description: data.phoneNumber });
                                          } else {
                                            toast({ title: "Sem número", description: data?.message || "Não foi possível obter o número", variant: "destructive" });
                                          }
                                          refetch();
                                        }
                                      });
                                    }}
                                    disabled={refreshPhone.isPending}
                                  >
                                    <RefreshCw className={`h-3 w-3 ${refreshPhone.isPending ? 'animate-spin' : ''}`} />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Sem número</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      refreshPhone.mutate(instance.id, {
                                        onSuccess: (data) => {
                                          if (data?.phoneNumber) {
                                            toast({ title: "Número encontrado!", description: data.phoneNumber });
                                          } else {
                                            toast({ title: "Número não encontrado", description: data?.message || "Não foi possível obter o número", variant: "destructive" });
                                          }
                                          refetch();
                                        }
                                      });
                                    }}
                                    disabled={refreshPhone.isPending}
                                  >
                                    <RefreshCw className={`h-3 w-3 ${refreshPhone.isPending ? 'animate-spin' : ''}`} />
                                  </Button>
                                </div>
                              )}
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
              onUpdateDefaultAutomation={(automationId) => {
                updateDefaultAutomation.mutate({ instanceId: selectedInstance.id, automationId });
              }}
              automations={automations?.filter(a => a.is_active && a.ai_prompt) || []}
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

      {/* Tray Chat Detail Panel */}
      <Sheet open={isTrayDetailOpen} onOpenChange={setIsTrayDetailOpen}>
        <SheetContent className="w-[500px] sm:max-w-[500px] p-0 overflow-y-auto">
          <SheetHeader className="p-6 border-b bg-gradient-to-r from-orange-500/10 to-transparent">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Globe className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <SheetTitle className="text-orange-500">Chat no Site (Tray)</SheetTitle>
                <p className="text-sm text-muted-foreground">Widget de atendimento web</p>
              </div>
            </div>
          </SheetHeader>
          
          <div className="p-6 space-y-6">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status da Conexão</span>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                Ativo
              </Badge>
            </div>

            {/* Ativado em */}
            {trayIntegration?.activated_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ativado em</span>
                <span>{new Date(trayIntegration.activated_at).toLocaleDateString('pt-BR')}</span>
              </div>
            )}

            <div className="border-t pt-6">
              <h3 className="text-sm font-semibold mb-4">Configurações Padrão</h3>
              
              <div className="space-y-4">
                {/* Status Padrão */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Status Padrão</label>
                  <Select
                    value={trayIntegration?.default_status_id || "none"}
                    onValueChange={(value) => {
                      updateTraySettings({ 
                        default_status_id: value === "none" ? null : value 
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {statuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: status.color }} 
                            />
                            {status.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Departamento Padrão */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Departamento Padrão</label>
                  <Select
                    value={trayIntegration?.default_department_id || "none"}
                    onValueChange={(value) => {
                      updateTraySettings({ 
                        default_department_id: value === "none" ? null : value 
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um departamento..." />
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
                </div>

                {/* Agente IA Responsável */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Agente IA Responsável</label>
                  <Select
                    value={trayIntegration?.default_automation_id || "none"}
                    onValueChange={(value) => {
                      updateTraySettings({ 
                        default_automation_id: value === "none" ? null : value 
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um agente IA..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {automations.filter(a => a.is_active).map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <Bot className="h-3 w-3 text-blue-500" />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Informações adicionais */}
            <div className="border-t pt-6">
              <h3 className="text-sm font-semibold mb-4">Informações</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                    WEB
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Widget Key</span>
                  <span className="font-mono text-xs">{trayIntegration?.widget_key?.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
