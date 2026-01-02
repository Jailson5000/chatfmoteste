import { useState } from "react";
import { Calendar, Settings2, RefreshCw, LogOut, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

export function GoogleCalendarCard() {
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

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-muted-foreground/30" />
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-muted">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Google Calendar</CardTitle>
              <CardDescription>Carregando...</CardDescription>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      <div 
        className={`absolute top-0 left-0 w-1 h-full ${
          isConnected && integration?.is_active 
            ? "bg-green-500" 
            : "bg-muted-foreground/30"
        }`} 
      />
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Google Calendar Icon */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 p-0.5">
              <div className="w-full h-full rounded-[10px] bg-background flex items-center justify-center">
                <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-blue-600 font-bold text-sm">
                  31
                </div>
              </div>
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Google Calendar</CardTitle>
                <Badge 
                  variant="outline" 
                  className={
                    isConnected && integration?.is_active
                      ? "bg-green-500/10 text-green-500 border-green-500/30"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {isConnected ? (integration?.is_active ? "Conectado" : "Pausado") : "Desconectado"}
                </Badge>
              </div>
              <CardDescription className="text-sm mt-0.5">
                O Google Calendar permite consultar e agendar eventos de forma automatizada por meio dos agentes de IA na plataforma.
              </CardDescription>
            </div>
          </div>

          {isConnected && (
            <Switch
              checked={integration?.is_active ?? false}
              onCheckedChange={(checked) => toggleActive.mutate(checked)}
              disabled={toggleActive.isPending}
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            {/* Connected info */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {integration?.google_email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">{integration?.google_email}</p>
                  {integration?.last_sync_at && (
                    <p className="text-xs text-muted-foreground">
                      Última sincronização: {formatDistanceToNow(new Date(integration.last_sync_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
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
                  <span className="ml-2 hidden sm:inline">Sincronizar</span>
                </Button>
              </div>
            </div>

            {/* Settings collapsible */}
            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-2 h-auto py-2">
                  <Settings2 className="h-4 w-4" />
                  Configurações
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="space-y-4 pt-4">
                <Separator />
                
                {/* Permissions */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Permissões da IA</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Leitura de eventos</Label>
                        <p className="text-xs text-muted-foreground">
                          Permite consultar e visualizar eventos
                        </p>
                      </div>
                      <Switch
                        checked={integration?.allow_read_events ?? true}
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
                          Permite agendar e modificar compromissos
                        </p>
                      </div>
                      <Switch
                        checked={integration?.allow_create_events ?? true}
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
                          Permite cancelar ou excluir compromissos
                        </p>
                      </div>
                      <Switch
                        checked={integration?.allow_delete_events ?? false}
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
                          Você pode reconectar a qualquer momento.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => disconnect.mutate()}
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
              </CollapsibleContent>
            </Collapsible>
          </>
        ) : (
          <>
            {/* Not connected state */}
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Conecte sua conta Google para que os agentes de IA possam gerenciar sua agenda.
                </p>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Autenticando...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Conectar com Google
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
