import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  MessageSquare,
  Trash2,
  History,
  Send,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { Task, TaskPriority, TaskStatus, useTasks } from "@/hooks/useTasks";
import { useTaskComments } from "@/hooks/useTaskComments";
import { useTaskActivityLog } from "@/hooks/useTaskActivityLog";
import { TaskCategory } from "@/hooks/useTaskCategories";
import { EditableAssigneesPopover } from "./EditableAssigneesPopover";
import { cn } from "@/lib/utils";
import { parseDateLocal, formatDateForDatabase } from "@/lib/dateUtils";

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TaskCategory[];
  teamMembers: TeamMember[];
}

const priorityLabels: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "A Fazer",
  in_progress: "Em Progresso",
  done: "Concluído",
};

const actionLabels: Record<string, string> = {
  created: "Criou a tarefa",
  updated: "Atualizou a tarefa",
  status_changed: "Alterou o status",
  comment_added: "Adicionou comentário",
};


export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  categories,
  teamMembers,
}: TaskDetailSheetProps) {
  const [newComment, setNewComment] = useState("");
  const { updateTask, updateTaskStatus, deleteTask } = useTasks();
  const { comments, addComment } = useTaskComments(task?.id || null);
  const { activities } = useTaskActivityLog(task?.id || null);

  // Inline editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [dueDateOpen, setDueDateOpen] = useState(false);

  // Reset editing states when task changes
  useEffect(() => {
    if (task) {
      setEditedTitle(task.title);
      setEditedDescription(task.description || "");
      setIsEditingTitle(false);
      setIsEditingDescription(false);
    }
  }, [task?.id]);

  if (!task) return null;

  const handleStatusChange = (status: TaskStatus) => {
    updateTaskStatus.mutate({ taskId: task.id, status });
  };

  const handlePriorityChange = (priority: TaskPriority) => {
    updateTask.mutate({ id: task.id, priority });
  };

  const handleCategoryChange = (categoryId: string) => {
    updateTask.mutate({
      id: task.id,
      category_id: categoryId === "none" ? null : categoryId,
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync(newComment);
    setNewComment("");
  };

  const handleDelete = async () => {
    await deleteTask.mutateAsync(task.id);
    onOpenChange(false);
  };

  // Title editing
  const handleSaveTitle = () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      updateTask.mutate({ id: task.id, title: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  // Description editing
  const handleSaveDescription = () => {
    if (editedDescription !== (task.description || "")) {
      updateTask.mutate({ id: task.id, description: editedDescription || null });
    }
    setIsEditingDescription(false);
  };

  // Due date editing
  const handleDueDateChange = (date: Date | undefined) => {
    updateTask.mutate({
      id: task.id,
      due_date: date ? formatDateForDatabase(date) : null,
    });
    setDueDateOpen(false);
  };

  // Assignees editing
  const handleAssigneesChange = (selectedIds: string[]) => {
    updateTask.mutate({ id: task.id, assignee_ids: selectedIds });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="pr-8">
          {/* Editable Title */}
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") {
                    setEditedTitle(task.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="text-lg font-semibold"
              />
              <Button size="icon" variant="ghost" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditedTitle(task.title);
                  setIsEditingTitle(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <SheetTitle
              className="pr-8 cursor-pointer group flex items-center gap-2 hover:text-primary transition-colors"
              onClick={() => setIsEditingTitle(true)}
            >
              {task.title}
              <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
            </SheetTitle>
          )}
          <SheetDescription>
            Criado em{" "}
            {format(new Date(task.created_at), "dd/MM/yyyy 'às' HH:mm", {
              locale: ptBR,
            })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] mt-4">
          <div className="space-y-4 px-3">
            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select
                  value={task.status}
                  onValueChange={(v) => handleStatusChange(v as TaskStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">A Fazer</SelectItem>
                    <SelectItem value="in_progress">Em Progresso</SelectItem>
                    <SelectItem value="done">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Prioridade
                </label>
                <Select
                  value={task.priority}
                  onValueChange={(v) => handlePriorityChange(v as TaskPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-sm font-medium mb-2 block">Categoria</label>
              <Select
                value={task.category_id || "none"}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date - Editable */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Data de Vencimento
              </label>
              <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !task.due_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {task.due_date && parseDateLocal(task.due_date)
                      ? format(parseDateLocal(task.due_date)!, "dd/MM/yyyy", {
                          locale: ptBR,
                        })
                      : "Adicionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={task.due_date ? parseDateLocal(task.due_date) ?? undefined : undefined}
                    onSelect={handleDueDateChange}
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                  {task.due_date && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => handleDueDateChange(undefined)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remover data
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Completed info */}
            {task.completed_at && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Concluído em{" "}
                  {format(new Date(task.completed_at), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </span>
              </div>
            )}

            {/* Description - Editable */}
            <div>
              <label className="text-sm font-medium mb-2 block">Descrição</label>
              {isEditingDescription ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Adicione uma descrição..."
                    rows={4}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditedDescription(task.description || "");
                        setIsEditingDescription(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSaveDescription}>
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 group min-h-[60px]",
                    !task.description && "text-muted-foreground"
                  )}
                  onClick={() => setIsEditingDescription(true)}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm whitespace-pre-wrap flex-1">
                      {task.description || "Clique para adicionar descrição..."}
                    </p>
                    <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity shrink-0 ml-2" />
                  </div>
                </div>
              )}
            </div>

            {/* Assignees - Editable */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Responsáveis</label>
                <EditableAssigneesPopover
                  selectedIds={task.assignees.map((a) => a.user_id)}
                  teamMembers={teamMembers}
                  onSave={handleAssigneesChange}
                  isPending={updateTask.isPending}
                />
              </div>
              {task.assignees.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {task.assignees.map((assignee) => (
                    <div
                      key={assignee.id}
                      className="flex items-center gap-2 bg-muted rounded-full px-3 py-1"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage
                          src={assignee.profile.avatar_url || undefined}
                        />
                        <AvatarFallback className="text-[8px]">
                          {assignee.profile.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{assignee.profile.full_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum responsável atribuído
                </p>
              )}
            </div>

            <Separator />

            {/* Tabs: Comments & Activity */}
            <Tabs defaultValue="comments">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="comments" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Comentários ({comments.length})
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-2">
                  <History className="h-4 w-4" />
                  Histórico
                </TabsTrigger>
              </TabsList>

              <TabsContent value="comments" className="mt-4 space-y-4">
                {/* Add comment */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Adicione um comentário..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || addComment.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {/* Comments list */}
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {comment.user.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {comment.user.full_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "dd/MM HH:mm")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum comentário ainda
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 text-sm">
                      <div className="w-8 flex justify-center">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {activity.user?.full_name || "Sistema"}
                          </span>
                          <span className="text-muted-foreground">
                            {actionLabels[activity.action] || activity.action}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(activity.created_at), "dd/MM/yyyy HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma atividade registrada
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Separator />

            {/* Delete */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full gap-2">
                  <Trash2 className="h-4 w-4" />
                  Excluir Tarefa
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A tarefa e todos os seus
                    comentários serão permanentemente removidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
