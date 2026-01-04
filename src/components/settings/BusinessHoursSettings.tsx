import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Save, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsHelpCollapsible } from "./SettingsHelpCollapsible";

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

interface BusinessHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

interface BusinessHoursSettingsProps {
  businessHours: BusinessHours | null;
  onSave: (hours: BusinessHours) => Promise<void>;
  saving: boolean;
}

const dayLabels: Record<keyof BusinessHours, string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
};

const defaultHours: BusinessHours = {
  monday: { enabled: true, start: "08:00", end: "18:00" },
  tuesday: { enabled: true, start: "08:00", end: "18:00" },
  wednesday: { enabled: true, start: "08:00", end: "18:00" },
  thursday: { enabled: true, start: "08:00", end: "18:00" },
  friday: { enabled: true, start: "08:00", end: "18:00" },
  saturday: { enabled: false, start: "08:00", end: "12:00" },
  sunday: { enabled: false, start: "08:00", end: "12:00" },
};

const timeOptions = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
];

export function BusinessHoursSettings({
  businessHours,
  onSave,
  saving,
}: BusinessHoursSettingsProps) {
  const [hours, setHours] = useState<BusinessHours>(businessHours || defaultHours);

  useEffect(() => {
    if (businessHours) {
      setHours(businessHours);
    }
  }, [businessHours]);

  const handleToggleDay = (day: keyof BusinessHours) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }));
  };

  const handleTimeChange = (
    day: keyof BusinessHours,
    field: "start" | "end",
    value: string
  ) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleSave = async () => {
    await onSave(hours);
  };

  return (
    <div className="space-y-6">
      <SettingsHelpCollapsible
        title="Como funciona o Horário Comercial?"
        items={[
          { text: "Configure os dias e horários em que seu workspace opera para garantir que as mensagens automáticas sejam enviadas apenas durante o expediente." },
          { text: "Os follow-ups agendados fora do horário comercial serão automaticamente reagendados para o próximo horário disponível." },
          { text: "Isso evita o envio de mensagens em horários inapropriados, melhorando a experiência do cliente e prevenindo possíveis bloqueios." },
          { text: "Para funcionamento 24h em um dia, configure o horário de 00:00 até 00:00." },
        ]}
        tip="Mantenha seu horário comercial sempre atualizado para garantir que seus clientes recebam mensagens apenas nos horários adequados."
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>Horário de Funcionamento</CardTitle>
          </div>
          <CardDescription>
            Defina os dias e horários de atendimento do seu escritório
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(dayLabels) as Array<keyof BusinessHours>).map((day) => (
            <div
              key={day}
              className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border"
            >
              <div className="w-32 font-medium">{dayLabels[day]}</div>
              
              <div className="flex items-center gap-2">
                <Switch
                  checked={hours[day].enabled}
                  onCheckedChange={() => handleToggleDay(day)}
                />
                <span className="text-sm text-muted-foreground w-14">
                  {hours[day].enabled ? "Ativo" : "Inativo"}
                </span>
              </div>
              
              <div className="flex items-center gap-2 flex-1">
                <Select
                  value={hours[day].start}
                  onValueChange={(value) => handleTimeChange(day, "start", value)}
                  disabled={!hours[day].enabled}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <span className="text-muted-foreground">até</span>
                
                <Select
                  value={hours[day].end}
                  onValueChange={(value) => handleTimeChange(day, "end", value)}
                  disabled={!hours[day].enabled}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar Horários"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
