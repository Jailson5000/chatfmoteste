import { useMemo } from "react";
import { isPast, isToday, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Task } from "@/hooks/useTasks";
import { AlertTriangle, CheckCircle2, Clock, Users } from "lucide-react";
import { parseDateLocal } from "@/lib/dateUtils";

interface TaskDashboardProps {
  tasks: Task[];
}

export function TaskDashboard({ tasks }: TaskDashboardProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const todo = tasks.filter((t) => t.status === "todo").length;

    const overdue = tasks.filter((t) => {
      const date = parseDateLocal(t.due_date);
      return date && isPast(date) && t.status !== "done";
    }).length;

    const dueToday = tasks.filter((t) => {
      const date = parseDateLocal(t.due_date);
      return date && isToday(date) && t.status !== "done";
    }).length;

    const dueThisWeek = tasks.filter((t) => {
      const date = parseDateLocal(t.due_date);
      return date && isWithinInterval(date, { start: weekStart, end: weekEnd }) && t.status !== "done";
    }).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Tasks by assignee
    const assigneeMap = new Map<
      string,
      { name: string; avatar: string | null; pending: number; completed: number }
    >();

    tasks.forEach((task) => {
      task.assignees.forEach((assignee) => {
        const existing = assigneeMap.get(assignee.user_id) || {
          name: assignee.profile.full_name,
          avatar: assignee.profile.avatar_url,
          pending: 0,
          completed: 0,
        };

        if (task.status === "done") {
          existing.completed++;
        } else {
          existing.pending++;
        }

        assigneeMap.set(assignee.user_id, existing);
      });
    });

    // Tasks by category
    const categoryMap = new Map<
      string,
      { name: string; color: string; count: number }
    >();

    tasks.forEach((task) => {
      if (task.category) {
        const existing = categoryMap.get(task.category.id) || {
          name: task.category.name,
          color: task.category.color,
          count: 0,
        };
        existing.count++;
        categoryMap.set(task.category.id, existing);
      }
    });

    return {
      total,
      completed,
      inProgress,
      todo,
      overdue,
      dueToday,
      dueThisWeek,
      completionRate,
      byAssignee: Array.from(assigneeMap.entries()).map(([id, data]) => ({
        id,
        ...data,
      })),
      byCategory: Array.from(categoryMap.entries()).map(([id, data]) => ({
        id,
        ...data,
      })),
    };
  }, [tasks]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Overview Cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.todo} a fazer • {stats.inProgress} em progresso
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.completed}</div>
          <Progress value={stats.completionRate} className="h-1 mt-2" />
          <div className="text-xs text-muted-foreground mt-1">
            {stats.completionRate}% do total
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Atrasadas</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {stats.overdue}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.dueToday} para hoje
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Esta Semana</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.dueThisWeek}</div>
          <div className="text-xs text-muted-foreground mt-1">
            tarefas pendentes
          </div>
        </CardContent>
      </Card>

      {/* By Assignee */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Por Responsável</CardTitle>
          <CardDescription>Distribuição de tarefas por membro</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.byAssignee.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma tarefa atribuída
            </p>
          ) : (
            <div className="space-y-4">
              {stats.byAssignee.map((assignee) => (
                <div key={assignee.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={assignee.avatar || undefined} />
                    <AvatarFallback className="text-xs">
                      {assignee.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{assignee.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{assignee.pending} pendentes</span>
                      <span>•</span>
                      <span className="text-green-600 dark:text-green-400">
                        {assignee.completed} concluídas
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {assignee.pending + assignee.completed}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Category */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Por Categoria</CardTitle>
          <CardDescription>Distribuição de tarefas por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria utilizada
            </p>
          ) : (
            <div className="space-y-3">
              {stats.byCategory.map((category) => (
                <div key={category.id} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{category.name}</p>
                  </div>
                  <div className="text-sm font-medium">{category.count}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
