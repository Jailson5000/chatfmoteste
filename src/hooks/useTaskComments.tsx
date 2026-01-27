import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export function useTaskComments(taskId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["task_comments", taskId],
    queryFn: async () => {
      if (!taskId) return [];

      const { data, error } = await supabase
        .from("task_comments")
        .select(`
          *,
          user:profiles(id, full_name, avatar_url)
        `)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as TaskComment[];
    },
    enabled: !!taskId,
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!taskId || !user?.id) throw new Error("Contexto inválido");

      const { data, error } = await supabase
        .from("task_comments")
        .insert({
          task_id: taskId,
          user_id: user.id,
          content,
        })
        .select(`
          *,
          user:profiles(id, full_name, avatar_url)
        `)
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from("task_activity_log").insert({
        task_id: taskId,
        user_id: user.id,
        action: "comment_added",
        new_values: { content },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao adicionar comentário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from("task_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;
      return commentId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
    },
  });

  return {
    comments,
    isLoading,
    addComment,
    deleteComment,
  };
}
