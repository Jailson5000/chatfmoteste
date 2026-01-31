import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskAssignee {
  id: string;
  user_id: string;
  assigned_at: string;
  profile: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface Task {
  id: string;
  law_firm_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category_id: string | null;
  due_date: string | null;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  category: TaskCategory | null;
  assignees: TaskAssignee[];
  comments_count: number;
  creator: {
    id: string;
    full_name: string;
  } | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category_id?: string;
  due_date?: string;
  assignee_ids?: string[];
  send_due_alert?: boolean;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category_id?: string | null;
  due_date?: string | null;
  position?: number;
  assignee_ids?: string[];
}

export function useTasks() {
  const { lawFirm } = useLawFirm();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["internal_tasks", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data: tasksData, error: tasksError } = await supabase
        .from("internal_tasks")
        .select(`
          *,
          category:task_categories(*),
          creator:profiles!internal_tasks_created_by_fkey(id, full_name)
        `)
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (tasksError) throw tasksError;

      // Fetch assignees for all tasks
      const taskIds = tasksData.map((t) => t.id);
      const { data: assigneesData } = await supabase
        .from("task_assignees")
        .select(`
          *,
          profile:profiles!task_assignees_user_id_fkey(id, full_name, avatar_url)
        `)
        .in("task_id", taskIds);

      // Fetch comments count
      const { data: commentsCount } = await supabase
        .from("task_comments")
        .select("task_id")
        .in("task_id", taskIds);

      const commentsCountMap = (commentsCount || []).reduce((acc, c) => {
        acc[c.task_id] = (acc[c.task_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const assigneesMap = (assigneesData || []).reduce((acc, a) => {
        if (!acc[a.task_id]) acc[a.task_id] = [];
        acc[a.task_id].push(a);
        return acc;
      }, {} as Record<string, TaskAssignee[]>);

      return tasksData.map((task) => ({
        ...task,
        status: task.status as TaskStatus,
        priority: task.priority as TaskPriority,
        assignees: assigneesMap[task.id] || [],
        comments_count: commentsCountMap[task.id] || 0,
      })) as Task[];
    },
    enabled: !!lawFirm?.id,
  });

  const createTask = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      if (!lawFirm?.id || !user?.id) throw new Error("Contexto inválido");

      // Get max position
      const { data: maxPosData } = await supabase
        .from("internal_tasks")
        .select("position")
        .eq("law_firm_id", lawFirm.id)
        .eq("status", input.status || "todo")
        .order("position", { ascending: false })
        .limit(1);

      const nextPosition = (maxPosData?.[0]?.position || 0) + 1;

      const { data: task, error } = await supabase
        .from("internal_tasks")
        .insert({
          law_firm_id: lawFirm.id,
          title: input.title,
          description: input.description || null,
          status: input.status || "todo",
          priority: input.priority || "medium",
          category_id: input.category_id || null,
          due_date: input.due_date || null,
          created_by: user.id,
          position: nextPosition,
          send_due_alert: input.send_due_alert ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      // Add assignees
      if (input.assignee_ids?.length) {
        await supabase.from("task_assignees").insert(
          input.assignee_ids.map((userId) => ({
            task_id: task.id,
            user_id: userId,
            assigned_by: user.id,
          }))
        );
      }

      // Log activity
      await supabase.from("task_activity_log").insert({
        task_id: task.id,
        user_id: user.id,
        action: "created",
        new_values: { title: input.title, status: input.status || "todo" },
      });

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
      toast({ title: "Tarefa criada com sucesso" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar tarefa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (input: UpdateTaskInput) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const { id, assignee_ids, ...updates } = input;

      // Get old values for activity log
      const { data: oldTask } = await supabase
        .from("internal_tasks")
        .select("*")
        .eq("id", id)
        .single();

      // Update task
      const updatePayload: Record<string, unknown> = { ...updates };
      
      // Handle status completion
      if (updates.status === "done" && oldTask?.status !== "done") {
        updatePayload.completed_at = new Date().toISOString();
        updatePayload.completed_by = user.id;
      } else if (updates.status && updates.status !== "done") {
        updatePayload.completed_at = null;
        updatePayload.completed_by = null;
      }

      const { error } = await supabase
        .from("internal_tasks")
        .update(updatePayload)
        .eq("id", id);

      if (error) throw error;

      // Update assignees if provided
      if (assignee_ids !== undefined) {
        await supabase.from("task_assignees").delete().eq("task_id", id);
        if (assignee_ids.length > 0) {
          await supabase.from("task_assignees").insert(
            assignee_ids.map((userId) => ({
              task_id: id,
              user_id: userId,
              assigned_by: user.id,
            }))
          );
        }
      }

      // Log activity
      await supabase.from("task_activity_log").insert({
        task_id: id,
        user_id: user.id,
        action: "updated",
        old_values: oldTask,
        new_values: updates,
      });

      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar tarefa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("internal_tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;
      return taskId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
      toast({ title: "Tarefa excluída" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir tarefa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({
      taskId,
      status,
      position,
    }: {
      taskId: string;
      status: TaskStatus;
      position?: number;
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const updatePayload: Record<string, unknown> = { status };
      
      if (position !== undefined) {
        updatePayload.position = position;
      }

      if (status === "done") {
        updatePayload.completed_at = new Date().toISOString();
        updatePayload.completed_by = user.id;
      } else {
        updatePayload.completed_at = null;
        updatePayload.completed_by = null;
      }

      const { error } = await supabase
        .from("internal_tasks")
        .update(updatePayload)
        .eq("id", taskId);

      if (error) throw error;

      // Log activity
      await supabase.from("task_activity_log").insert({
        task_id: taskId,
        user_id: user.id,
        action: "status_changed",
        new_values: { status },
      });

      return { taskId, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
    },
  });

  return {
    tasks,
    isLoading,
    error,
    createTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
  };
}
