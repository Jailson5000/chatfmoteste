import { useState, useEffect, useRef } from "react";
import {
  Settings2,
  Plus,
  CheckCircle2,
  XCircle,
  RefreshCw,
  QrCode,
  Smartphone,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Phone,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useWhatsAppInstances, WhatsAppInstance } from "@/hooks/useWhatsAppInstances";

type ApiConfig = {
  url: string;
  key: string;
};

const API_CONFIG_STORAGE_KEY = "evolution_api_config_v1";

export default function Connections() {
  const { toast } = useToast();
  const {
    instances,
    isLoading,
    testConnection,
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
  } = useWhatsAppInstances();

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isInstanceDialogOpen, setIsInstanceDialogOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form states
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [newInstanceName, setNewInstanceName] = useState("");

  // Instance settings (UI state)
  const [rejectCalls, setRejectCalls] = useState<Record<string, boolean>>({});
  const [rejectBusyId, setRejectBusyId] = useState<string | null>(null);

  // QR Code states
  const [currentQRCode, setCurrentQRCode] = useState<string | null>(null);
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Polling refs
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const pollErrorCountRef = useRef(0);
  const currentQRCodeRef = useRef<string | null>(null);

  const MAX_POLLS = 60; // Maximum 60 polls (2 minutes with 2s interval)

  useEffect(() => {
    currentQRCodeRef.current = currentQRCode;
  }, [currentQRCode]);

  // Load API config once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(API_CONFIG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ApiConfig;
      if (parsed?.url) setEvolutionUrl(parsed.url);
      if (parsed?.key) setEvolutionKey(parsed.key);
    } catch {
      // ignore
    }
  }, []);

  // Load instance settings (reject calls) for connected instances
  useEffect(() => {
    const load = async () => {
      for (const instance of instances) {
        if (instance.status !== "connected") continue;
        if (rejectCalls[instance.id] !== undefined) continue;

        try {
          const res = await getSettings.mutateAsync(instance.id);
          setRejectCalls((prev) => ({
            ...prev,
            [instance.id]: Boolean(res.settings?.rejectCall),
          }));
        } catch {
          // keep as undefined
        }
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollInFlightRef.current = false;
    pollErrorCountRef.current = 0;
    setPollCount(0);
  };

  const handleSaveConfig = () => {
    if (!evolutionUrl.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Por favor, informe a URL da Evolution API",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(evolutionUrl);
    } catch {
      toast({
        title: "URL inválida",
        description: "Por favor, informe uma URL válida",
        variant: "destructive",
      });
      return;
    }

    const config: ApiConfig = { url: evolutionUrl.trim(), key: evolutionKey.trim() };
    localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(config));

    toast({
      title: "Configuração salva",
      description: "A Evolution API foi configurada com sucesso",
    });
    setIsConfigOpen(false);
  };

  const handleTestConnection = async () => {
    if (!evolutionUrl || !evolutionKey) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha a URL e a API Key",
        variant: "destructive",
      });
      return;
    }

    await testConnection.mutateAsync({ apiUrl: evolutionUrl, apiKey: evolutionKey });
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe um nome para a instância",
        variant: "destructive",
      });
      return;
    }

    if (!evolutionUrl || !evolutionKey) {
      toast({
        title: "API não configurada",
        description: "Por favor, configure a Evolution API primeiro",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createInstance.mutateAsync({
        instanceName: newInstanceName,
        apiUrl: evolutionUrl,
        apiKey: evolutionKey,
      });

      setNewInstanceName("");
      setIsInstanceDialogOpen(false);

      // Refetch to ensure list is updated
      await refetch();

      // If QR code was returned, show it
      if (result.qrCode && result.instance) {
        setCurrentQRCode(result.qrCode);
        setCurrentInstanceId(result.instance.id);
        setIsQRDialogOpen(true);
        startPolling(result.instance.id);
      } else if (result.instance) {
        // Instance created but no QR code, try to get it
        handleConnectInstance(result.instance);
      }
    } catch (error) {
      // Error is handled by the mutation
      console.error("Create instance error:", error);
    }
  };

  const handleDeleteInstance = async (id: string) => {
    await deleteInstance.mutateAsync(id);
  };

  const handleToggleRejectCalls = async (instance: WhatsAppInstance, enabled: boolean) => {
    setRejectBusyId(instance.id);
    const previous = rejectCalls[instance.id];
    setRejectCalls((prev) => ({ ...prev, [instance.id]: enabled }));

    try {
      await setSettings.mutateAsync({ instanceId: instance.id, rejectCall: enabled });
      toast({
        title: "Configuração atualizada",
        description: enabled ? "Ligações serão rejeitadas." : "Ligações serão aceitas.",
      });
    } catch (e) {
      setRejectCalls((prev) => ({ ...prev, [instance.id]: Boolean(previous) }));
    } finally {
      setRejectBusyId(null);
    }
  };

  const handleConnectInstance = async (instance: WhatsAppInstance) => {
    setCurrentInstanceId(instance.id);
    setCurrentQRCode(null);
    setQrError(null);
    setQrLoading(true);
    setConnectionStatus("Conectando...");
    setIsQRDialogOpen(true);

    try {
      const result = await getQRCode.mutateAsync(instance.id);

      if (result.status === "open" || result.status === "connected") {
        setConnectionStatus("Conectado!");
        toast({
          title: "WhatsApp conectado",
          description: "A instância já está conectada",
        });
        await refetch();
        setTimeout(() => {
          setIsQRDialogOpen(false);
          stopPolling();
        }, 1500);
        return;
      }

      if (result.qrCode) {
        setCurrentQRCode(result.qrCode);
        setConnectionStatus("Escaneie o QR Code");
        startPolling(instance.id);
      } else {
        setQrError("QR Code não disponível. Tente novamente.");
      }
    } catch (error) {
      setQrError(error instanceof Error ? error.message : "Erro ao obter QR Code");
    } finally {
      setQrLoading(false);
    }
  };

  const startPolling = (instanceId: string) => {
    stopPolling();
    setPollCount(0);

    pollingRef.current = setInterval(async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      setPollCount((c) => c + 1);

      // Stop polling after max attempts
      if (pollCount + 1 >= MAX_POLLS) {
        stopPolling();
        setQrError("Tempo esgotado. Por favor, tente novamente.");
        setConnectionStatus(null);
        pollInFlightRef.current = false;
        return;
      }

      try {
        const result = await getStatus.mutateAsync(instanceId);
        pollErrorCountRef.current = 0;

        if (result.status === "connected") {
          stopPolling();
          setConnectionStatus("Conectado!");
          setCurrentQRCode(null);
          toast({
            title: "WhatsApp conectado",
            description: "A conexão foi estabelecida com sucesso",
          });
          await refetch();
          setTimeout(() => {
            setIsQRDialogOpen(false);
          }, 1500);
        } else if (result.evolutionState === "qr") {
          // Refresh QR code if needed
          const qrResult = await getQRCode.mutateAsync(instanceId);
          if (qrResult.qrCode && qrResult.qrCode !== currentQRCodeRef.current) {
            setCurrentQRCode(qrResult.qrCode);
          }
        }
      } catch (error) {
        pollErrorCountRef.current += 1;
        console.error("Polling error:", error);
        if (pollErrorCountRef.current >= 3) {
          stopPolling();
          setQrError(error instanceof Error ? error.message : "Erro ao verificar status");
          setConnectionStatus(null);
        }
      } finally {
        pollInFlightRef.current = false;
      }
    }, 2000);
  };

  const handleCloseQRDialog = () => {
    stopPolling();
    setIsQRDialogOpen(false);
    setCurrentQRCode(null);
    setCurrentInstanceId(null);
    setQrError(null);
    setConnectionStatus(null);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-success/20 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Conectado
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="h-3 w-3 mr-1" />
            Desconectado
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
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Conexões</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas conexões com WhatsApp e outros serviços</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsConfigOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar API
          </Button>
          <Button onClick={() => setIsInstanceDialogOpen(true)} disabled={!evolutionUrl || !evolutionKey}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Instância
          </Button>
        </div>
      </div>

      {/* API Configuration Card */}
      <Card
        className={cn(
          "border-dashed",
          evolutionUrl && evolutionKey ? "bg-success/5 border-success/30" : "bg-muted/50",
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn("p-2 rounded-lg", evolutionUrl && evolutionKey ? "bg-success/10" : "bg-muted")}>
                <Settings2
                  className={cn(
                    "h-6 w-6",
                    evolutionUrl && evolutionKey ? "text-success" : "text-muted-foreground",
                  )}
                />
              </div>
              <div>
                <h3 className="font-medium">Evolution API</h3>
                <p className="text-sm text-muted-foreground">
                  {evolutionUrl && evolutionKey ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      Configurada: {evolutionUrl}
                    </span>
                  ) : (
                    "Configure a Evolution API para conectar instâncias WhatsApp"
                  )}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsConfigOpen(true)}>
              {evolutionUrl ? "Editar" : "Configurar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instances */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Instâncias WhatsApp
          </CardTitle>
          <CardDescription>Gerencie as instâncias de WhatsApp conectadas ao seu escritório</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <QrCode className="h-16 w-16 mb-4 opacity-50" />
              <p className="font-medium mb-1">Nenhuma instância configurada</p>
              <p className="text-sm text-center max-w-md">
                {evolutionUrl && evolutionKey
                  ? "Clique em 'Nova Instância' para adicionar um número de WhatsApp"
                  : "Configure a Evolution API primeiro para adicionar instâncias"}
              </p>
            </div>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último Evento</TableHead>
                    <TableHead>Rejeitar ligações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((instance) => {
                    const rejectCall = rejectCalls[instance.id] ?? false;
                    const isBusy = rejectBusyId === instance.id;
                    const canToggle = instance.status === "connected";
                    const lastWebhookAt = (instance as any).last_webhook_at;
                    const lastWebhookEvent = (instance as any).last_webhook_event;

                    return (
                      <TableRow key={instance.id}>
                        <TableCell className="font-medium">{instance.instance_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{instance.phone_number || "—"}</span>
                            {instance.status === "connected" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => refreshPhone.mutate(instance.id)}
                                    disabled={refreshPhone.isPending}
                                  >
                                    {refreshPhone.isPending ? (
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
                                  onClick={() => refreshStatus.mutate(instance.id)}
                                  disabled={refreshStatus.isPending}
                                >
                                  {refreshStatus.isPending ? (
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
                          <div className="flex items-center justify-start gap-2">
                            <Switch
                              checked={rejectCall}
                              onCheckedChange={(checked) => handleToggleRejectCalls(instance, checked)}
                              disabled={!canToggle || isBusy}
                            />
                            <span className="text-xs text-muted-foreground">{rejectCall ? "Lig." : "Aceitar"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {instance.status !== "connected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConnectInstance(instance)}
                                disabled={getQRCode.isPending}
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
                                  onClick={() => configureWebhook.mutate(instance.id)}
                                  disabled={configureWebhook.isPending}
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
                              onClick={() => handleDeleteInstance(instance.id)}
                              disabled={deleteInstance.isPending}
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
          )}
        </CardContent>
      </Card>

      {/* API Configuration Dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Evolution API</DialogTitle>
            <DialogDescription>Configure a conexão com sua instância do Evolution API</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="evolution-url">URL da API</Label>
              <Input
                id="evolution-url"
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                placeholder="https://evolution.example.com"
              />
              <p className="text-xs text-muted-foreground">URL completa da sua instância Evolution API</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="evolution-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="evolution-key"
                  type={showApiKey ? "text" : "password"}
                  value={evolutionKey}
                  onChange={(e) => setEvolutionKey(e.target.value)}
                  placeholder="Sua chave de API"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">A chave será usada para autenticação com a API</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnection.isPending || !evolutionUrl || !evolutionKey}
            >
              {testConnection.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                "Testar Conexão"
              )}
            </Button>
            <Button onClick={handleSaveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Instance Dialog */}
      <Dialog open={isInstanceDialogOpen} onOpenChange={setIsInstanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Instância WhatsApp</DialogTitle>
            <DialogDescription>Crie uma nova instância para conectar um número de WhatsApp</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instance-name">Nome da Instância</Label>
              <Input
                id="instance-name"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                placeholder="Ex: WhatsApp Principal"
              />
              <p className="text-xs text-muted-foreground">Use apenas letras, números e underscores (sem espaços)</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInstanceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateInstance} disabled={createInstance.isPending}>
              {createInstance.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Instância"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={isQRDialogOpen} onOpenChange={handleCloseQRDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>Escaneie o QR Code com o WhatsApp do seu celular</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            {qrLoading ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="text-muted-foreground">{connectionStatus || "Carregando..."}</p>
              </div>
            ) : qrError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{qrError}</AlertDescription>
              </Alert>
            ) : connectionStatus === "Conectado!" ? (
              <div className="flex flex-col items-center gap-4">
                <CheckCircle2 className="h-16 w-16 text-success" />
                <p className="text-lg font-medium text-success">Conectado!</p>
              </div>
            ) : currentQRCode ? (
              <>
                <div className="bg-white p-4 rounded-lg">
                  <img
                    src={currentQRCode.startsWith("data:") ? currentQRCode : `data:image/png;base64,${currentQRCode}`}
                    alt="QR Code"
                    className="w-64 h-64"
                    loading="lazy"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {connectionStatus ||
                    "Abra o WhatsApp > Menu > Dispositivos conectados > Conectar dispositivo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tentativa {pollCount}/{MAX_POLLS}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <QrCode className="h-16 w-16 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">QR Code não disponível</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseQRDialog}>
              Fechar
            </Button>
            {qrError && currentInstanceId && (
              <Button
                onClick={() => {
                  const instance = instances.find((i) => i.id === currentInstanceId);
                  if (instance) handleConnectInstance(instance);
                }}
              >
                Tentar Novamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
