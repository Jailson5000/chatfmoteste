import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Plus,
  MoreVertical,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  
  Bot,
  Phone,
  QrCode,
  MessageCircle,
  ChevronDown,
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

import { useTenant } from "@/hooks/useTenant";
import { NewInstanceDialog } from "@/components/connections/NewInstanceDialog";
import { NewWhatsAppCloudDialog } from "@/components/connections/NewWhatsAppCloudDialog";
import { WhatsAppCloudDetailPanel } from "@/components/connections/WhatsAppCloudDetailPanel";
import { QRCodeDialog } from "@/components/connections/QRCodeDialog";
import { ConnectionDetailPanel } from "@/components/connections/ConnectionDetailPanel";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

export default function Connections() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { tenant } = useTenant();
  const { evolutionApiUrl, evolutionApiKey, isConfigured: isApiConfigured } = useLawFirmSettings();
  const { departments } = useDepartments();
  const { members: teamMembers } = useTeamMembers();
  const { statuses } = useCustomStatuses();
  const { automations } = useAutomations();
  
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
    logoutInstance,
    restartInstance,
    refetch,
    updateDefaultDepartment,
    updateDefaultStatus,
    updateDefaultAssigned,
    updateDefaultAutomation,
    updateDefaultResponsible,
  } = useWhatsAppInstances();

  // WhatsApp Cloud connections from meta_connections
  const { data: cloudConnections = [], refetch: refetchCloud } = useQuery({
    queryKey: ["meta_connections_cloud", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from("meta_connections")
        .select("*")
        .eq("law_firm_id", tenant.id)
        .eq("type", "whatsapp_cloud")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [selectedCloudConnection, setSelectedCloudConnection] = useState<any>(null);
  
  const [isNewInstanceOpen, setIsNewInstanceOpen] = useState(false);
  const [isNewCloudOpen, setIsNewCloudOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [currentQRCode, setCurrentQRCode] = useState<string | null>(null);
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [rejectCalls, setRejectCalls] = useState<Record<string, boolean>>({});

  const MAX_POLLS = 60;
  const BASE_POLL_INTERVAL = 1000; // 1 second base - more responsive
  const MAX_POLL_INTERVAL = 5000; // 5 seconds max
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  // Calculate polling interval with slower exponential backoff
  const getPollingInterval = useCallback((count: number): number => {
    // Increase interval every 10 polls, up to MAX_POLL_INTERVAL - slower backoff
    const multiplier = Math.pow(1.3, Math.floor(count / 10));
    return Math.min(BASE_POLL_INTERVAL * multiplier, MAX_POLL_INTERVAL);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Stop polling function
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      console.log("[Connections] Stopping status polling");
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  // Realtime subscription for instant connection detection
  useEffect(() => {
    if (!isQRDialogOpen || !currentInstanceId) return;

    console.log("[Connections] Setting up Realtime subscription for:", currentInstanceId);

    const channel = supabase
      .channel(`qr-connect-${currentInstanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `id=eq.${currentInstanceId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status?: string })?.status;
          console.log("[Connections] Realtime update received:", newStatus);

          if (newStatus === 'connected') {
            console.log("[Connections] Instance connected via Realtime! Stopping poll.");
            stopPolling();
            setConnectionStatus("Conectado!");
            setCurrentQRCode(null);
            refetch();

            setTimeout(() => {
              setIsQRDialogOpen(false);
              setConnectionStatus(null);
              setPollCount(0);
            }, 1000);
          } else if (newStatus === 'awaiting_qr') {
            setConnectionStatus("Escaneie o QR Code");
          }
        }
      )
      .subscribe();

    return () => {
      console.log("[Connections] Cleaning up Realtime channel");
      supabase.removeChannel(channel);
    };
  }, [isQRDialogOpen, currentInstanceId, stopPolling, refetch]);

  // Poll once and schedule next poll with backoff
  const pollOnce = useCallback(async (instanceId: string) => {
    pollCountRef.current++;
    const count = pollCountRef.current;
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
        
        // Close dialog after showing success (reduced delay)
        setTimeout(() => {
          setIsQRDialogOpen(false);
          setConnectionStatus(null);
          setPollCount(0);
        }, 1000);
        return;
      } else if (result.qrCode && result.qrCode !== currentQRCode) {
        // QR code updated (e.g., expired and regenerated)
        console.log("[Connections] QR code updated");
        setCurrentQRCode(result.qrCode);
      }
    } catch (error) {
      console.error("[Connections] Poll error:", error);
      // Continue polling despite errors
    }

    // Schedule next poll with backoff
    const nextInterval = getPollingInterval(count);
    console.log(`[Connections] Next poll in ${nextInterval}ms`);
    pollIntervalRef.current = setTimeout(() => pollOnce(instanceId), nextInterval);
  }, [stopPolling, getStatus, refetch, currentQRCode, getPollingInterval]);

  // Start polling for connection status
  const startPolling = useCallback((instanceId: string) => {
    stopPolling();
    pollCountRef.current = 0;
    
    console.log("[Connections] Starting status polling for:", instanceId);
    
    // Start first poll immediately
    pollOnce(instanceId);
  }, [stopPolling, pollOnce]);

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

  // Mantém o painel lateral sincronizado com atualizações em tempo real / refetches
  useEffect(() => {
    if (!selectedInstance) return;

    const updated = instances.find((i) => i.id === selectedInstance.id);
    if (!updated) {
      setSelectedInstance(null);
      return;
    }

    setSelectedInstance((prev) => {
      if (!prev) return prev;
      if (prev.id !== updated.id) return prev;

      const hasMeaningfulChange =
        prev.status !== updated.status ||
        prev.phone_number !== updated.phone_number ||
        prev.last_webhook_at !== updated.last_webhook_at ||
        prev.updated_at !== updated.updated_at ||
        prev.default_department_id !== updated.default_department_id ||
        prev.default_status_id !== updated.default_status_id ||
        prev.default_assigned_to !== updated.default_assigned_to ||
        prev.default_automation_id !== updated.default_automation_id;

      return hasMeaningfulChange ? updated : prev;
    });
  }, [instances, selectedInstance?.id]);

  // Load actual Evolution settings when an instance is selected
  useEffect(() => {
    if (!selectedInstance) return;
    
    // Only fetch settings for connected instances
    if (selectedInstance.status !== "connected") return;
    
    // Skip if we already have settings cached for this instance
    if (rejectCalls[selectedInstance.id] !== undefined) return;
    
    const loadSettings = async () => {
      try {
        console.log("[Connections] Loading settings from Evolution for:", selectedInstance.instance_name);
        const result = await getSettings.mutateAsync(selectedInstance.id);
        if (result.settings) {
          console.log("[Connections] Settings loaded:", result.settings);
          setRejectCalls((prev) => ({ 
            ...prev, 
            [selectedInstance.id]: result.settings.rejectCall ?? false 
          }));
        }
      } catch (error) {
        console.error("[Connections] Failed to load settings:", error);
        // Keep the default false value on error
      }
    };
    
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstance?.id, selectedInstance?.status]);

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

    if (status === "awaiting_qr") {
      return (
        <Badge variant="outline" className="text-amber-400 border-amber-400/30">
          <QrCode className="h-3 w-3 mr-1" />
          Aguardando QR
        </Badge>
      );
    }

    if (status === "connecting") {
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

  // Get responsible: can be AI automation or human attendant
  const getResponsibleForInstance = (instance: WhatsAppInstance) => {
    // Check for AI automation first
    if (instance.default_automation_id) {
      const automation = automations.find((a) => a.id === instance.default_automation_id);
      if (automation) {
        return { type: 'ai' as const, name: automation.name, id: automation.id };
      }
    }
    // Check for human attendant
    if (instance.default_assigned_to) {
      const member = teamMembers.find((m) => m.id === instance.default_assigned_to);
      if (member) {
        return { type: 'human' as const, name: member.full_name, avatar_url: member.avatar_url, id: member.id };
      }
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Conexão
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsNewInstanceOpen(true)}>
                <QrCode className="h-4 w-4 mr-2" />
                WhatsApp (QR Code)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsNewCloudOpen(true)}>
                <MessageCircle className="h-4 w-4 mr-2 text-[#25D366]" />
                WhatsApp Cloud (API Oficial)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              {/* WhatsApp Instances */}
              {filteredInstances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    {searchQuery ? "Nenhuma conexão encontrada" : "Nenhuma conexão configurada"}
                  </td>
                </tr>
              ) : (
                filteredInstances.map((instance) => {
                  const dept = instance.default_department_id
                    ? departments.find((d) => d.id === instance.default_department_id) || null
                    : null;
                  const status = instance.default_status_id
                    ? statuses.find((s) => s.id === instance.default_status_id) || null
                    : null;
                  const responsible = getResponsibleForInstance(instance);

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
                      <td className="px-4 py-3">
                        {status ? (
                          <Badge variant="outline" style={{ borderColor: status.color, color: status.color }}>
                            {status.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {dept ? (
                          <Badge variant="outline" style={{ borderColor: dept.color, color: dept.color }}>
                            {dept.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {responsible ? (
                          responsible.type === 'ai' ? (
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4 text-blue-500" />
                              <span className="text-sm">{responsible.name}</span>
                              <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1">IA</Badge>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={responsible.avatar_url || undefined} />
                                <AvatarFallback className="text-xs bg-primary/20 text-primary">
                                  {responsible.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{responsible.name}</span>
                            </div>
                          )
                        ) : (
                          <span className="text-muted-foreground text-sm">Nenhum</span>
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

              {/* WhatsApp Cloud API Connections */}
              {cloudConnections.map((conn: any) => (
                <tr
                  key={`cloud-${conn.id}`}
                  className={`hover:bg-muted/20 cursor-pointer transition-colors bg-gradient-to-r from-[#25D366]/5 to-transparent ${
                    selectedCloudConnection?.id === conn.id ? "bg-muted/30" : ""
                  }`}
                  onClick={() => setSelectedCloudConnection(conn)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                        <MessageCircle className="h-5 w-5 text-[#25D366]" />
                      </div>
                      <div>
                        <p className="font-medium text-[#25D366]">{conn.page_name || "WhatsApp Cloud"}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-mono text-xs">{conn.page_id}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20">
                            API OFICIAL
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {conn.default_status_id ? (() => {
                      const s = statuses.find((st: any) => st.id === conn.default_status_id);
                      return s ? <Badge variant="outline" style={{ borderColor: s.color, color: s.color }}>{s.name}</Badge> : <span className="text-muted-foreground">—</span>;
                    })() : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {conn.default_department_id ? (() => {
                      const d = departments.find((dp: any) => dp.id === conn.default_department_id);
                      return d ? <Badge variant="outline" style={{ borderColor: d.color, color: d.color }}>{d.name}</Badge> : <span className="text-muted-foreground">—</span>;
                    })() : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {conn.default_handler_type === 'ai' && conn.default_automation_id ? (() => {
                      const agent = automations.find((a: any) => a.id === conn.default_automation_id);
                      return agent ? (
                        <div className="flex items-center gap-2">
                          <Bot className="h-3 w-3 text-blue-500" />
                          <span className="text-sm">{agent.name}</span>
                          <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1">IA</Badge>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>;
                    })() : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {conn.created_at ? formatDistanceToNow(new Date(conn.created_at), { addSuffix: true, locale: ptBR }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {conn.is_active ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inativo
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedCloudConnection(conn)}>Ver detalhes</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await supabase.from("meta_connections").delete().eq("id", conn.id);
                            refetchCloud();
                          }}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      <Sheet open={!!selectedInstance} onOpenChange={(open) => {
        if (!open) {
          // Clear cached settings to force reload on next open
          if (selectedInstance) {
            setRejectCalls((prev) => {
              const updated = { ...prev };
              delete updated[selectedInstance.id];
              return updated;
            });
          }
          setSelectedInstance(null);
        }
      }}>
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
              onLogout={() => logoutInstance.mutate(selectedInstance.id)}
              onRestart={() => restartInstance.mutate(selectedInstance.id)}
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
              onUpdateDefaultResponsible={(value) => {
                updateDefaultResponsible.mutate({ instanceId: selectedInstance.id, value });
              }}
              automations={automations?.filter(a => a.is_active && a.ai_prompt) || []}
              isLoading={{
                status: refreshStatus.isPending,
                phone: refreshPhone.isPending,
                delete: deleteInstance.isPending,
                webhook: configureWebhook.isPending,
                settings: setSettings.isPending || getSettings.isPending,
                logout: logoutInstance.isPending,
                restart: restartInstance.isPending,
              }}
            />
          )}
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

      {/* WhatsApp Cloud Dialog */}
      <NewWhatsAppCloudDialog
        open={isNewCloudOpen}
        onClose={() => setIsNewCloudOpen(false)}
        onCreated={() => refetchCloud()}
      />

      {/* WhatsApp Cloud Detail Panel */}
      <Sheet open={!!selectedCloudConnection} onOpenChange={(open) => { if (!open) setSelectedCloudConnection(null); }}>
        <SheetContent className="w-[500px] sm:max-w-[500px] p-0 overflow-hidden">
          {selectedCloudConnection && (
            <WhatsAppCloudDetailPanel
              connection={selectedCloudConnection}
              onClose={() => setSelectedCloudConnection(null)}
              onDeleted={() => { setSelectedCloudConnection(null); refetchCloud(); }}
              departments={departments}
              statuses={statuses}
              automations={automations}
              teamMembers={teamMembers}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
