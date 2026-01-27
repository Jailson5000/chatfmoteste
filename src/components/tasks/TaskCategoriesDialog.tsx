import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/ui/color-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTaskCategories, TaskCategory } from "@/hooks/useTaskCategories";

interface TaskCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskCategoriesDialog({
  open,
  onOpenChange,
}: TaskCategoriesDialogProps) {
  const { categories, createCategory, updateCategory, deleteCategory } =
    useTaskCategories();

  const [isEditing, setIsEditing] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [deleteTarget, setDeleteTarget] = useState<TaskCategory | null>(null);

  const handleStartCreate = () => {
    setEditingCategory(null);
    setName("");
    setColor("#3B82F6");
    setIsEditing(true);
  };

  const handleStartEdit = (category: TaskCategory) => {
    setEditingCategory(category);
    setName(category.name);
    setColor(category.color);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editingCategory) {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        name: name.trim(),
        color,
      });
    } else {
      await createCategory.mutateAsync({
        name: name.trim(),
        color,
      });
    }

    setIsEditing(false);
    setEditingCategory(null);
    setName("");
    setColor("#3B82F6");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCategory.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingCategory(null);
    setName("");
    setColor("#3B82F6");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias</DialogTitle>
            <DialogDescription>
              Crie, edite ou exclua categorias para organizar suas tarefas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add/Edit Form */}
            {isEditing ? (
              <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="category-name">Nome da Categoria</Label>
                  <Input
                    id="category-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Administrativo"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <div className="flex items-center gap-3">
                    <ColorPicker value={color} onChange={setColor} />
                    <span className="text-sm text-muted-foreground font-mono">
                      {color}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={handleCancel}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={
                      !name.trim() ||
                      createCategory.isPending ||
                      updateCategory.isPending
                    }
                  >
                    {editingCategory ? "Salvar" : "Criar"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleStartCreate}
              >
                <Plus className="h-4 w-4" />
                Nova Categoria
              </Button>
            )}

            {/* Categories List */}
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 p-3 border rounded-lg group hover:bg-muted/30 transition-colors"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-50 cursor-grab" />
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="flex-1 font-medium">{category.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(category)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && !isEditing && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma categoria criada ainda.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria "{deleteTarget?.name}" será excluída. Tarefas que usam
              esta categoria ficarão sem categoria atribuída.
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
