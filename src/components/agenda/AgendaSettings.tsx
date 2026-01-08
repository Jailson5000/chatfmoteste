import { useState, useEffect } from "react";
import { Save, Clock } from "lucide-react";
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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (lawFirm?.business_hours) {
      setHours(lawFirm.business_hours);
    }
  }, [lawFirm]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateLawFirm.mutateAsync({ business_hours: hours });
      toast({ title: "Horários salvos com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar os horários",
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
            Configure os horários de funcionamento para agendamentos
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
            • Use o <strong>buffer</strong> para adicionar tempo de preparo entre atendimentos
          </p>
          <p>
            • Os agendamentos são sincronizados automaticamente com o Google Calendar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
