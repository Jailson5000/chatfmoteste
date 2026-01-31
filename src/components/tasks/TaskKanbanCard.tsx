import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  MessageSquare,
  GripVertical,
  AlertTriangle,
  MoreHorizontal,
  ArrowRight,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Task, TaskPriority, TaskStatus, useTasks } from "@/hooks/useTasks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "A Fazer" },
  { value: "in_progress", label: "Em Progresso" },
  { value: "done", label: "Concluído" },
];

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function TaskKanbanCard({
  task,
  onClick,
  isDragging,
}: TaskKanbanCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { updateTask, updateTaskStatus, deleteTask } = useTasks();

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
  const isDone = task.status === "done";
  const isOverdue =
    task.due_date &&
    isPast(new Date(task.due_date)) &&
    !isDone;
  const isDueToday = task.due_date && isToday(new Date(task.due_date));

  const handleStatusChange = (status: TaskStatus) => {
    updateTaskStatus.mutate({ taskId: task.id, status });
  };

  const handlePriorityChange = (priority: TaskPriority) => {
    updateTask.mutate({ id: task.id, priority });
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow group",
          (isDragging || isSortableDragging) && "opacity-50 shadow-lg",
          isOverdue && "border-red-300 dark:border-red-700",
          isDone && "opacity-70 bg-muted/40 border-green-300 dark:border-green-800"
        )}
        onClick={onClick}
      >
        {/* Header with drag handle, title, and menu */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <h4 className={cn(
              "font-medium text-sm line-clamp-2 flex-1",
              isDone && "line-through text-muted-foreground"
            )}>
              {task.title}
            </h4>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isDone && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Concluído
              </Badge>
            )}
            {!isDone && (
              <Badge
                variant="secondary"
                className={cn("text-[10px]", priorityStyle.bg, priorityStyle.text)}
              >
                {priorityStyle.label}
              </Badge>
            )}
            {/* Quick Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {/* Status submenu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Mover para
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {statusOptions
                      .filter((s) => s.value !== task.status)
                      .map((status) => (
                        <DropdownMenuItem
                          key={status.value}
                          onClick={() => handleStatusChange(status.value)}
                        >
                          {status.label}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {/* Priority submenu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Prioridade
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {priorityOptions.map((priority) => (
                      <DropdownMenuItem
                        key={priority.value}
                        onClick={() => handlePriorityChange(priority.value)}
                        className={cn(
                          task.priority === priority.value && "bg-accent"
                        )}
                      >
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full mr-2",
                            priorityStyles[priority.value].bg
                          )}
                        />
                        {priority.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa "{task.title}" e todos os
              seus comentários serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
