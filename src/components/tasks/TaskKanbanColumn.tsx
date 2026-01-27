import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { TaskStatus } from "@/hooks/useTasks";

interface TaskKanbanColumnProps {
  id: TaskStatus;
  title: string;
  count: number;
  children: React.ReactNode;
}

const columnStyles: Record<TaskStatus, string> = {
  todo: "border-t-muted-foreground/50",
  in_progress: "border-t-primary",
  done: "border-t-green-500",
};

export function TaskKanbanColumn({
  id,
  title,
  count,
  children,
}: TaskKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border border-t-4 bg-muted/30 min-h-[400px] transition-colors",
        columnStyles[id],
        isOver && "bg-muted/50"
      )}
    >
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
      </div>
      <div className="flex-1 p-2 overflow-y-auto">{children}</div>
    </div>
  );
}
