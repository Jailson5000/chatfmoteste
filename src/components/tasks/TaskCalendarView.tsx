import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Task, TaskPriority } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { parseDateLocal } from "@/lib/dateUtils";

interface TaskCalendarViewProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

const priorityColors: Record<TaskPriority, string> = {
  low: "bg-muted-foreground",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

export function TaskCalendarView({ tasks, onTaskClick }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getTasksForDay = (date: Date) =>
    tasks.filter((task) => {
      const taskDate = parseDateLocal(task.due_date);
      return taskDate && isSameDay(taskDate, date);
    });

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
          >
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayTasks = getTasksForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-24 p-1 border rounded-md",
                !isCurrentMonth && "bg-muted/30",
                isToday && "border-primary"
              )}
            >
              <div
                className={cn(
                  "text-xs font-medium mb-1",
                  !isCurrentMonth && "text-muted-foreground",
                  isToday && "text-primary"
                )}
              >
                {format(day, "d")}
              </div>

              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task.id)}
                    className={cn(
                      "text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                      task.status === "done"
                        ? "bg-muted text-muted-foreground line-through"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          priorityColors[task.priority]
                        )}
                      />
                      <span className="truncate">{task.title}</span>
                    </div>
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayTasks.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
