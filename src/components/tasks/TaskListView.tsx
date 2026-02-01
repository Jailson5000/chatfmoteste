import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Task, TaskPriority, TaskStatus, useTasks } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { parseDateLocal } from "@/lib/dateUtils";

interface TaskListViewProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

const priorityLabels: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "A Fazer",
  in_progress: "Em Progresso",
  done: "Concluído",
};

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export function TaskListView({ tasks, onTaskClick }: TaskListViewProps) {
  const { updateTaskStatus } = useTasks();

  const handleCheckboxChange = (taskId: string, checked: boolean) => {
    updateTaskStatus.mutate({
      taskId,
      status: checked ? "done" : "todo",
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma tarefa encontrada
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Título</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-28">Prioridade</TableHead>
            <TableHead className="w-32">Categoria</TableHead>
            <TableHead className="w-28">Data</TableHead>
            <TableHead className="w-32">Responsáveis</TableHead>
            <TableHead className="w-16 text-center">
              <MessageSquare className="h-4 w-4 mx-auto" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
        {tasks.map((task) => {
            const dueDateParsed = parseDateLocal(task.due_date);
            const isOverdue = dueDateParsed && isPast(dueDateParsed) && task.status !== "done";
            const isDueToday = dueDateParsed && isToday(dueDateParsed);

            return (
              <TableRow
                key={task.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onTaskClick(task.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={task.status === "done"}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(task.id, checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell>
                  <div
                    className={cn(
                      "font-medium",
                      task.status === "done" && "line-through text-muted-foreground"
                    )}
                  >
                    {task.title}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={statusStyles[task.status]}
                  >
                    {statusLabels[task.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={priorityStyles[task.priority]}
                  >
                    {priorityLabels[task.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {task.category && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: task.category.color }}
                      />
                      <span className="text-sm">{task.category.name}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {task.due_date && (
                    <div
                      className={cn(
                        "flex items-center gap-1 text-sm",
                        isOverdue
                          ? "text-red-600 dark:text-red-400"
                          : isDueToday
                          ? "text-orange-600 dark:text-orange-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {isOverdue && <AlertTriangle className="h-3 w-3" />}
                      {dueDateParsed && format(dueDateParsed, "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {task.assignees.length > 0 && (
                    <div className="flex -space-x-1.5">
                      {task.assignees.slice(0, 3).map((assignee) => (
                        <Avatar
                          key={assignee.id}
                          className="h-6 w-6 border-2 border-card"
                        >
                          <AvatarImage
                            src={assignee.profile.avatar_url || undefined}
                          />
                          <AvatarFallback className="text-[10px]">
                            {assignee.profile.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {task.assignees.length > 3 && (
                        <div className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                          <span className="text-[10px] text-muted-foreground">
                            +{task.assignees.length - 3}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center text-muted-foreground text-sm">
                  {task.comments_count > 0 ? task.comments_count : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
