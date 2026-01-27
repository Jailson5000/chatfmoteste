import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Repeat } from "lucide-react";
import { format, addWeeks, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";

export interface RecurrenceConfig {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  count: number;
  endDate?: Date;
}

interface RecurrenceSelectorProps {
  value: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
  startDate: Date;
}

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

export function RecurrenceSelector({ value, onChange, startDate }: RecurrenceSelectorProps) {
  const handleToggle = (enabled: boolean) => {
    onChange({ ...value, enabled });
  };

  const handleFrequencyChange = (frequency: RecurrenceFrequency) => {
    // Calculate end date based on frequency and count
    const endDate = calculateEndDate(startDate, frequency, value.count);
    onChange({ ...value, frequency, endDate });
  };

  const handleCountChange = (count: number) => {
    const validCount = Math.max(2, Math.min(52, count));
    const endDate = calculateEndDate(startDate, value.frequency, validCount);
    onChange({ ...value, count: validCount, endDate });
  };

  const calculateEndDate = (start: Date, freq: RecurrenceFrequency, count: number): Date => {
    switch (freq) {
      case "weekly":
        return addWeeks(start, count - 1);
      case "biweekly":
        return addWeeks(start, (count - 1) * 2);
      case "monthly":
        return addMonths(start, count - 1);
      default:
        return addWeeks(start, count - 1);
    }
  };

  // Generate preview dates
  const getPreviewDates = (): Date[] => {
    const dates: Date[] = [startDate];
    for (let i = 1; i < Math.min(value.count, 5); i++) {
      switch (value.frequency) {
        case "weekly":
          dates.push(addWeeks(startDate, i));
          break;
        case "biweekly":
          dates.push(addWeeks(startDate, i * 2));
          break;
        case "monthly":
          dates.push(addMonths(startDate, i));
          break;
      }
    }
    return dates;
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <Label htmlFor="recurrence-toggle" className="font-medium">
            Agendamento Recorrente
          </Label>
        </div>
        <Switch
          id="recurrence-toggle"
          checked={value.enabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {value.enabled && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Frequência</Label>
              <Select
                value={value.frequency}
                onValueChange={(v) => handleFrequencyChange(v as RecurrenceFrequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Quantidade</Label>
              <Input
                type="number"
                min={2}
                max={52}
                value={value.count}
                onChange={(e) => handleCountChange(parseInt(e.target.value) || 2)}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Serão criados {value.count} agendamentos:
            </Label>
            <div className="flex flex-wrap gap-2">
              {getPreviewDates().map((date, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "text-xs px-2 py-1 rounded-md",
                    idx === 0 ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  {format(date, "dd/MM", { locale: ptBR })}
                </span>
              ))}
              {value.count > 5 && (
                <span className="text-xs px-2 py-1 text-muted-foreground">
                  +{value.count - 5} mais
                </span>
              )}
            </div>
            {value.endDate && (
              <p className="text-xs text-muted-foreground">
                Último agendamento em: {format(value.endDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Utility to generate recurrence rule string (RFC-5545 simplified)
export function generateRecurrenceRule(config: RecurrenceConfig): string | null {
  if (!config.enabled) return null;

  let freq = "";
  let interval = 1;

  switch (config.frequency) {
    case "weekly":
      freq = "WEEKLY";
      break;
    case "biweekly":
      freq = "WEEKLY";
      interval = 2;
      break;
    case "monthly":
      freq = "MONTHLY";
      break;
  }

  return `FREQ=${freq};INTERVAL=${interval};COUNT=${config.count}`;
}

// Utility to generate all appointment dates from a recurrence config
export function generateRecurringDates(startDate: Date, config: RecurrenceConfig): Date[] {
  const dates: Date[] = [];
  
  for (let i = 0; i < config.count; i++) {
    switch (config.frequency) {
      case "weekly":
        dates.push(addWeeks(startDate, i));
        break;
      case "biweekly":
        dates.push(addWeeks(startDate, i * 2));
        break;
      case "monthly":
        dates.push(addMonths(startDate, i));
        break;
    }
  }

  return dates;
}
