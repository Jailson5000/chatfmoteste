import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Mail, MessageSquare, Clock } from "lucide-react";
import { useTaskAlertSettings } from "@/hooks/useTaskAlertSettings";

interface TaskAlertsSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskAlertsSettingsDialog({
  open,
  onOpenChange,
}: TaskAlertsSettingsDialogProps) {
  const { settings, isLoading, updateSettings } = useTaskAlertSettings();
  
  const [enabled, setEnabled] = useState(false);
  const [hoursBefore, setHoursBefore] = useState(24);
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.task_alert_enabled);
      setHoursBefore(settings.task_alert_hours_before);
      setChannels(settings.task_alert_channels || ["email"]);
      setBusinessHoursOnly(settings.task_alert_business_hours_only);
    }
  }, [settings]);

  const handleChannelToggle = (channel: string) => {
    if (channels.includes(channel)) {
      setChannels(channels.filter((c) => c !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      task_alert_enabled: enabled,
      task_alert_hours_before: hoursBefore,
      task_alert_channels: channels,
      task_alert_business_hours_only: businessHoursOnly,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurações de Alertas
          </DialogTitle>
          <DialogDescription>
            Configure alertas automáticos para tarefas próximas ao vencimento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Alertas ativos</Label>
              <p className="text-sm text-muted-foreground">
                Enviar alertas para tarefas próximas ao vencimento
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isLoading}
            />
          </div>

          {enabled && (
            <>
              {/* Hours before */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Antecipar alerta em
                </Label>
                <Select
                  value={String(hoursBefore)}
                  onValueChange={(v) => setHoursBefore(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 horas antes</SelectItem>
                    <SelectItem value="24">24 horas antes</SelectItem>
                    <SelectItem value="48">48 horas antes</SelectItem>
                    <SelectItem value="72">72 horas antes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Channels */}
              <div className="space-y-3">
                <Label>Canais de notificação</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email"
                      checked={channels.includes("email")}
                      onCheckedChange={() => handleChannelToggle("email")}
                    />
                    <label
                      htmlFor="email"
                      className="text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="whatsapp"
                      checked={channels.includes("whatsapp")}
                      onCheckedChange={() => handleChannelToggle("whatsapp")}
                    />
                    <label
                      htmlFor="whatsapp"
                      className="text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      WhatsApp
                    </label>
                  </div>
                </div>
                {channels.length === 0 && (
                  <p className="text-sm text-destructive">
                    Selecione pelo menos um canal
                  </p>
                )}
              </div>

              {/* Business hours */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Somente horário comercial</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar apenas entre 8h e 18h
                  </p>
                </div>
                <Switch
                  checked={businessHoursOnly}
                  onCheckedChange={setBusinessHoursOnly}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending || (enabled && channels.length === 0)}
          >
            {updateSettings.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
