import { useState, useEffect, useRef } from "react";
import { MessageSquare, Plus, Loader2, Copy, Settings2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppInstances, WhatsAppInstance } from "@/hooks/useWhatsAppInstances";
import { useUserRole } from "@/hooks/useUserRole";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";
import { IntegrationCard } from "@/components/connections/IntegrationCard";
import { EvolutionAdminConfig } from "@/components/connections/EvolutionAdminConfig";
import { WhatsAppInstanceList } from "@/components/connections/WhatsAppInstanceList";
import { QRCodeDialog } from "@/components/connections/QRCodeDialog";
import { NewInstanceDialog } from "@/components/connections/NewInstanceDialog";

export default function Connections() {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const {
    settings,
    isLoading: isLoadingSettings,
    evolutionApiUrl,
    evolutionApiKey,
    isConfigured: isApiConfigured,
    updateSettings,
  } = useLawFirmSettings();
  
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

  // Local form state for editing
  const [localApiUrl, setLocalApiUrl] = useState("");
  const [localApiKey, setLocalApiKey] = useState("");

  // Instance settings (UI state)
  const [rejectCalls, setRejectCalls] = useState<Record<string, boolean>>({});
  const [rejectBusyId, setRejectBusyId] = useState<string | null>(null);

  // Dialog states
  const [isNewInstanceOpen, setIsNewInstanceOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);

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

  const MAX_POLLS = 60;

  // Check if API is configured
  const hasConnectedInstance = instances.some((i) => i.status === "connected");

  useEffect(() => {
    currentQRCodeRef.current = currentQRCode;
  }, [currentQRCode]);

  // Sync local form state with settings from DB
  useEffect(() => {
    if (evolutionApiUrl) setLocalApiUrl(evolutionApiUrl);
    if (evolutionApiKey) setLocalApiKey(evolutionApiKey);
  }, [evolutionApiUrl, evolutionApiKey]);

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

  const handleSaveConfig = async () => {
    if (!localApiUrl.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Por favor, informe a URL da Evolution API",
        variant: "destructive",
      });
      return;
    }

    try {
      new URL(localApiUrl);
    } catch {
      toast({
        title: "URL inválida",
        description: "Por favor, informe uma URL válida",
        variant: "destructive",
      });
      return;
    }

    await updateSettings.mutateAsync({
      evolution_api_url: localApiUrl.trim(),
      evolution_api_key: localApiKey.trim(),
    });
  };

  const handleTestConnection = async () => {
    await testConnection.mutateAsync({ apiUrl: localApiUrl, apiKey: localApiKey });
  };

  const handleCreateInstance = async (instanceName: string) => {
    if (!isApiConfigured) {
      toast({
        title: "API não configurada",
        description: "Por favor, configure a Evolution API primeiro",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createInstance.mutateAsync({
        instanceName,
        apiUrl: evolutionApiUrl,
        apiKey: evolutionApiKey,
      });

      setIsNewInstanceOpen(false);
      await refetch();

      if (result.qrCode && result.instance) {
        setCurrentQRCode(result.qrCode);
        setCurrentInstanceId(result.instance.id);
        setIsQRDialogOpen(true);
        startPolling(result.instance.id);
      } else if (result.instance) {
        handleConnectInstance(result.instance);
      }
    } catch (error) {
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
    } catch {
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

  const handleRetryQR = () => {
    if (currentInstanceId) {
      const instance = instances.find((i) => i.id === currentInstanceId);
      if (instance) handleConnectInstance(instance);
    }
  };

  const copyWebhookUrl = () => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;
    navigator.clipboard.writeText(url);
    toast({
      title: "URL copiada",
      description: "Cole na configuração do webhook da Evolution API",
    });
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Conexões</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas integrações com WhatsApp e outros serviços
          </p>
        </div>
      </div>

      {/* Evolution WhatsApp Integration */}
      <IntegrationCard
        icon={<MessageSquare className="h-6 w-6" />}
        title="WhatsApp (Evolution API)"
        description="Integre o WhatsApp para comunicação com clientes"
        isConnected={hasConnectedInstance}
      >
        <div className="space-y-6">
          {/* Admin Configuration Section */}
          {isAdmin && (
            <>
              <EvolutionAdminConfig
                apiUrl={localApiUrl}
                apiKey={localApiKey}
                onApiUrlChange={setLocalApiUrl}
                onApiKeyChange={setLocalApiKey}
                onSave={handleSaveConfig}
                onTest={handleTestConnection}
                isTesting={testConnection.isPending}
                isSaving={updateSettings.isPending}
                isConfigured={isApiConfigured}
              />

              {isApiConfigured && (
                <Card className="bg-muted/30 border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Configuração do Webhook
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Configure o webhook na sua Evolution API para receber mensagens:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-background rounded-md text-xs font-mono border overflow-x-auto">
                        {import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook
                      </code>
                      <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <strong>Fluxo:</strong> Evolution API → Backend → Sistema de Atendimento
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              )}

              <Separator />
            </>
          )}

          {/* Instances Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">Conexões WhatsApp</h3>
                <p className="text-sm text-muted-foreground">
                  {instances.length === 0
                    ? "Nenhuma conexão configurada"
                    : `${instances.length} conexão(ões) configurada(s)`}
                </p>
              </div>
              <Button
                onClick={() => setIsNewInstanceOpen(true)}
                disabled={!isApiConfigured}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Conexão WhatsApp
              </Button>
            </div>

            {!isApiConfigured && !isAdmin && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  A Evolution API ainda não foi configurada. 
                  Entre em contato com o administrador do sistema.
                </AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <WhatsAppInstanceList
                instances={instances}
                rejectCalls={rejectCalls}
                rejectBusyId={rejectBusyId}
                onConnect={handleConnectInstance}
                onDelete={handleDeleteInstance}
                onRefreshStatus={(id) => refreshStatus.mutate(id)}
                onRefreshPhone={(id) => refreshPhone.mutate(id)}
                onConfigureWebhook={(id) => configureWebhook.mutate(id)}
                onToggleRejectCalls={handleToggleRejectCalls}
                isRefreshingStatus={refreshStatus.isPending}
                isRefreshingPhone={refreshPhone.isPending}
                isDeleting={deleteInstance.isPending}
                isGettingQR={getQRCode.isPending}
                isConfiguringWebhook={configureWebhook.isPending}
              />
            )}
          </div>
        </div>
      </IntegrationCard>

      {/* Future Integrations Placeholder */}
      <Card className="border-dashed bg-muted/20">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Novas integrações em breve...
          </p>
        </CardContent>
      </Card>

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
        onRetry={handleRetryQR}
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
