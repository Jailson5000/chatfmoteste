import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Save, Clock } from "lucide-react";
import { SettingsHelpCollapsible } from "./SettingsHelpCollapsible";

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

export interface BusinessHours {
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

// Validate time format HH:MM
const isValidTime = (time: string): boolean => {
  const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(time);
};

// Format time input to ensure HH:MM format
const formatTimeInput = (value: string): string => {
  // Remove non-numeric characters except :
  let cleaned = value.replace(/[^\d:]/g, '');
  
  // Auto-add colon after 2 digits if not present
  if (cleaned.length === 2 && !cleaned.includes(':')) {
    cleaned = cleaned + ':';
  }
  
  // Limit to 5 characters (HH:MM)
  return cleaned.slice(0, 5);
};

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
    const formattedValue = formatTimeInput(value);
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: formattedValue },
    }));
  };

  const handleSave = async () => {
    // Validate all times before saving
    for (const day of Object.keys(hours) as Array<keyof BusinessHours>) {
      if (hours[day].enabled) {
        if (!isValidTime(hours[day].start) || !isValidTime(hours[day].end)) {
          return;
        }
      }
    }
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
            Defina os dias e horários de atendimento. Digite o horário manualmente (ex: 08:30, 18:45).
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
                <Input
                  type="text"
                  value={hours[day].start}
                  onChange={(e) => handleTimeChange(day, "start", e.target.value)}
                  disabled={!hours[day].enabled}
                  placeholder="08:00"
                  className={`w-20 text-center font-mono ${
                    hours[day].enabled && !isValidTime(hours[day].start) 
                      ? "border-destructive" 
                      : ""
                  }`}
                  maxLength={5}
                />
                
                <span className="text-muted-foreground">até</span>
                
                <Input
                  type="text"
                  value={hours[day].end}
                  onChange={(e) => handleTimeChange(day, "end", e.target.value)}
                  disabled={!hours[day].enabled}
                  placeholder="18:00"
                  className={`w-20 text-center font-mono ${
                    hours[day].enabled && !isValidTime(hours[day].end) 
                      ? "border-destructive" 
                      : ""
                  }`}
                  maxLength={5}
                />
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
