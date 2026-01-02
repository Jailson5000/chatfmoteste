import { useState } from "react";
import { Settings2, RefreshCw, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IntegrationCard } from "../IntegrationCard";

function GoogleCalendarIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 p-0.5">
      <div className="w-full h-full rounded-[6px] bg-background flex items-center justify-center">
        <div className="w-7 h-7 rounded bg-white flex items-center justify-center text-blue-600 font-bold text-xs">
          31
        </div>
      </div>
    </div>
  );
}

export function GoogleCalendarIntegration() {
  const {
    integration,
    isLoading,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    updateSettings,
    toggleActive,
    syncNow,
  } = useGoogleCalendar();

  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <IntegrationCard
        icon={<GoogleCalendarIcon />}
        title="Google Calendar"
        description="O Google Calendar permite consultar e agendar eventos de forma automatizada por meio dos agentes de IA na plataforma."
        isLoading={isLoading}
        isConnected={isConnected}
        isActive={integration?.is_active ?? false}
        onToggle={(checked) => toggleActive.mutate(checked)}
        onSettings={() => setSettingsOpen(true)}
        onConnect={connect}
        toggleDisabled={toggleActive.isPending || isConnecting}
      />

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GoogleCalendarIcon />
              Google Calendar
            </DialogTitle>
            <DialogDescription>
              Configure as permissões e sincronização do Google Calendar.
            </DialogDescription>
          </DialogHeader>

          {isConnected && integration && (
            <div className="space-y-4">
              {/* Connected account */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {integration.google_email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{integration.google_email}</p>
                    {integration.last_sync_at && (
                      <p className="text-xs text-muted-foreground">
                        Última sync: {formatDistanceToNow(new Date(integration.last_sync_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </p>
                    )}
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => syncNow.mutate()}
                  disabled={syncNow.isPending}
                >
                  {syncNow.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Separator />
              
              {/* Permissions */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Permissões da IA</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Leitura de eventos</Label>
                      <p className="text-xs text-muted-foreground">
                        Consultar e visualizar eventos
                      </p>
                    </div>
                    <Switch
                      checked={integration.allow_read_events ?? true}
                      onCheckedChange={(checked) => 
                        updateSettings.mutate({ allow_read_events: checked })
                      }
                      disabled={updateSettings.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Criar e editar eventos</Label>
                      <p className="text-xs text-muted-foreground">
                        Agendar e modificar compromissos
                      </p>
                    </div>
                    <Switch
                      checked={integration.allow_create_events ?? true}
                      onCheckedChange={(checked) => 
                        updateSettings.mutate({ 
                          allow_create_events: checked,
                          allow_edit_events: checked
                        })
                      }
                      disabled={updateSettings.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Cancelar eventos</Label>
                      <p className="text-xs text-muted-foreground">
                        Cancelar ou excluir compromissos
                      </p>
                    </div>
                    <Switch
                      checked={integration.allow_delete_events ?? false}
                      onCheckedChange={(checked) => 
                        updateSettings.mutate({ allow_delete_events: checked })
                      }
                      disabled={updateSettings.isPending}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Danger zone */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-destructive">Zona de Perigo</h4>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full">
                      <LogOut className="h-4 w-4 mr-2" />
                      Desconectar Google Calendar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desconectar Google Calendar?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Essa ação irá remover a conexão com o Google Calendar. 
                        A IA não poderá mais acessar ou gerenciar sua agenda.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          disconnect.mutate();
                          setSettingsOpen(false);
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {disconnect.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Desconectar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
