import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  MessageSquare,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import { Task, TaskPriority } from "@/hooks/useTasks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TaskKanbanCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
}

const priorityStyles: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-muted", text: "text-muted-foreground", label: "Baixa" },
  medium: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Média" },
  high: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "Alta" },
  urgent: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Urgente" },
};

export function TaskKanbanCard({
  task,
  onClick,
  isDragging,
}: TaskKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityStyle = priorityStyles[task.priority];
  const isOverdue =
    task.due_date &&
    isPast(new Date(task.due_date)) &&
    task.status !== "done";
  const isDueToday = task.due_date && isToday(new Date(task.due_date));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow group",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg",
        isOverdue && "border-red-300 dark:border-red-700"
      )}
      onClick={onClick}
    >
      {/* Header with drag handle and priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <h4 className="font-medium text-sm line-clamp-2 flex-1">
            {task.title}
          </h4>
        </div>
        <Badge
          variant="secondary"
          className={cn("text-[10px] shrink-0", priorityStyle.bg, priorityStyle.text)}
        >
          {priorityStyle.label}
        </Badge>
      </div>

      {/* Category */}
      {task.category && (
        <div className="flex items-center gap-1.5 mb-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: task.category.color }}
          />
          <span className="text-xs text-muted-foreground truncate">
            {task.category.name}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t">
        {/* Due date */}
        <div className="flex items-center gap-1">
          {task.due_date && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs",
                isOverdue
                  ? "text-red-600 dark:text-red-400"
                  : isDueToday
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-muted-foreground"
              )}
            >
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <Calendar className="h-3 w-3" />
              <span>
                {format(new Date(task.due_date), "dd/MM", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>

        {/* Right side: comments + assignees */}
        <div className="flex items-center gap-2">
          {task.comments_count > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              <span>{task.comments_count}</span>
            </div>
          )}

          {/* Assignees avatars */}
          {task.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {task.assignees.slice(0, 3).map((assignee) => (
                <Avatar
                  key={assignee.id}
                  className="h-5 w-5 border-2 border-card"
                >
                  <AvatarImage src={assignee.profile.avatar_url || undefined} />
                  <AvatarFallback className="text-[8px]">
                    {assignee.profile.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </AvatarFallback>
                </Avatar>
              ))}
              {task.assignees.length > 3 && (
                <div className="h-5 w-5 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground">
                    +{task.assignees.length - 3}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
