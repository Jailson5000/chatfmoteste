import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Task, TaskStatus, useTasks } from "@/hooks/useTasks";
import { TaskKanbanColumn } from "./TaskKanbanColumn";
import { TaskKanbanCard } from "./TaskKanbanCard";

interface TaskKanbanViewProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

const columns: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "A Fazer" },
  { id: "in_progress", title: "Em Progresso" },
  { id: "done", title: "Concluído" },
];

export function TaskKanbanView({ tasks, onTaskClick }: TaskKanbanViewProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const { updateTaskStatus } = useTasks();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const getTasksByStatus = (status: TaskStatus) =>
    tasks
      .filter((task) => task.status === status)
      .sort((a, b) => a.position - b.position);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Check if dropped on a column
    const targetColumn = columns.find((col) => col.id === over.id);
    if (targetColumn && task.status !== targetColumn.id) {
      updateTaskStatus.mutate({
        taskId,
        status: targetColumn.id,
      });
      return;
    }

    // Check if dropped on another task
    const overTask = tasks.find((t) => t.id === over.id);
    if (overTask && task.status !== overTask.status) {
      updateTaskStatus.mutate({
        taskId,
        status: overTask.status,
        position: overTask.position,
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          return (
            <TaskKanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              count={columnTasks.length}
            >
              <SortableContext
                items={columnTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <TaskKanbanCard
                      key={task.id}
                      task={task}
                      onClick={() => onTaskClick(task.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </TaskKanbanColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskKanbanCard task={activeTask} onClick={() => {}} isDragging />
        )}
      </DragOverlay>
    </DndContext>
  );
}
