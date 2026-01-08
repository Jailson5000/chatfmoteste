import { useState, useEffect } from "react";
import { Save, Clock, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLawFirm, BusinessHours } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";

const DAYS = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

const DEFAULT_HOURS: BusinessHours = {
  monday: { enabled: true, start: "08:00", end: "18:00" },
  tuesday: { enabled: true, start: "08:00", end: "18:00" },
  wednesday: { enabled: true, start: "08:00", end: "18:00" },
  thursday: { enabled: true, start: "08:00", end: "18:00" },
  friday: { enabled: true, start: "08:00", end: "18:00" },
  saturday: { enabled: false, start: "08:00", end: "12:00" },
  sunday: { enabled: false, start: "08:00", end: "12:00" },
};

export function AgendaSettings() {
  const { lawFirm, updateLawFirm } = useLawFirm();
  const { toast } = useToast();
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [reminderHours, setReminderHours] = useState<number>(24);
  const [confirmationHours, setConfirmationHours] = useState<number>(2);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (lawFirm?.business_hours) {
      setHours(lawFirm.business_hours);
    }
    if (lawFirm?.reminder_hours_before !== null && lawFirm?.reminder_hours_before !== undefined) {
      setReminderHours(lawFirm.reminder_hours_before);
    }
    if (lawFirm?.confirmation_hours_before !== null && lawFirm?.confirmation_hours_before !== undefined) {
      setConfirmationHours(lawFirm.confirmation_hours_before);
    }
  }, [lawFirm]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateLawFirm.mutateAsync({ 
        business_hours: hours,
        reminder_hours_before: reminderHours,
        confirmation_hours_before: confirmationHours,
      });
      toast({ title: "Configurações salvas com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateDay = (
    day: keyof BusinessHours,
    field: "enabled" | "start" | "end",
    value: boolean | string
  ) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configurações</h2>
          <p className="text-sm text-muted-foreground">
            Configure horários de funcionamento e lembretes
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horário de Funcionamento
          </CardTitle>
          <CardDescription>
            Defina os dias e horários disponíveis para agendamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DAYS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center gap-4 py-3 border-b last:border-0"
            >
              <div className="w-36 flex items-center gap-3">
                <Switch
                  checked={hours[key].enabled}
                  onCheckedChange={(checked) => updateDay(key, "enabled", checked)}
                />
                <Label className="font-medium">{label}</Label>
              </div>

              {hours[key].enabled ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={hours[key].start}
                    onChange={(e) => updateDay(key, "start", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={hours[key].end}
                    onChange={(e) => updateDay(key, "end", e.target.value)}
                    className="w-28"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurações de Lembretes
          </CardTitle>
          <CardDescription>
            Configure quando os lembretes automáticos serão enviados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="reminderHours">Lembrete (horas antes)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="reminderHours"
                  type="number"
                  min={1}
                  max={72}
                  value={reminderHours}
                  onChange={(e) => setReminderHours(Math.max(1, parseInt(e.target.value) || 24))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">horas antes do agendamento</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Padrão: 24 horas. O cliente receberá um lembrete automático.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmationHours">Confirmação (horas antes)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="confirmationHours"
                  type="number"
                  min={1}
                  max={24}
                  value={confirmationHours}
                  onChange={(e) => setConfirmationHours(Math.max(1, parseInt(e.target.value) || 2))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">horas antes do agendamento</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Padrão: 2 horas. Pedido de confirmação de presença.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dicas de Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            • Os <strong>horários de funcionamento</strong> definem quando seus clientes podem agendar
          </p>
          <p>
            • A <strong>duração do serviço</strong> determina automaticamente os slots disponíveis
          </p>
          <p>
            • O <strong>lembrete</strong> é enviado automaticamente no horário configurado
          </p>
          <p>
            • A <strong>confirmação</strong> pede que o cliente confirme sua presença
          </p>
          <p>
            • Os agendamentos são sincronizados automaticamente com o Google Calendar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
