import { format, isToday, isYesterday, isSameYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { memo } from "react";

interface DateSeparatorProps {
  date: Date;
}

/**
 * Formats a date for display in chat date separators, similar to WhatsApp.
 * - Today: "Hoje"
 * - Yesterday: "Ontem"
 * - Same year: "Terça-feira, 14 de janeiro"
 * - Other years: "14 de janeiro de 2025"
 */
function formatDateLabel(date: Date): string {
  if (isToday(date)) {
    return "Hoje";
  }
  
  if (isYesterday(date)) {
    return "Ontem";
  }
  
  if (isSameYear(date, new Date())) {
    // Format: "Terça-feira, 14 de janeiro"
    return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
  }
  
  // Format: "14 de janeiro de 2025"
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

/**
 * Capitalizes the first letter of a string
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function DateSeparatorComponent({ date }: DateSeparatorProps) {
  const label = capitalizeFirst(formatDateLabel(date));
  
  return (
    <div className="flex items-center justify-center my-3 px-4">
      <div className="bg-muted/80 dark:bg-muted/50 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-border/50">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * Helper function to check if two dates are on different days.
 * Used to determine when to show a date separator.
 */
export function shouldShowDateSeparator(
  currentDate: string | Date,
  previousDate?: string | Date | null
): boolean {
  if (!previousDate) return true; // Always show for first message
  
  const current = new Date(currentDate);
  const previous = new Date(previousDate);
  
  // Compare year, month, and day
  return (
    current.getFullYear() !== previous.getFullYear() ||
    current.getMonth() !== previous.getMonth() ||
    current.getDate() !== previous.getDate()
  );
}

export const DateSeparator = memo(DateSeparatorComponent);
