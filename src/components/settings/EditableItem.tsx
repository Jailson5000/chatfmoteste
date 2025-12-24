import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColorPicker } from "@/components/ui/color-picker";
import { Pencil, Trash2 } from "lucide-react";

interface EditableItemProps {
  id: string;
  name: string;
  color: string;
  type: "status" | "tag" | "department" | "template";
  onUpdate: (data: { id: string; name: string; color: string }) => void;
  onDelete: (id: string) => void;
  isPending?: boolean;
}

export function EditableItem({
  id,
  name,
  color,
  type,
  onUpdate,
  onDelete,
  isPending,
}: EditableItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editColor, setEditColor] = useState(color);

  const typeLabels = {
    status: "Status",
    tag: "Etiqueta",
    department: "Departamento",
    template: "Template",
  };

  const handleSave = () => {
    onUpdate({ id, name: editName, color: editColor });
    setIsOpen(false);
  };

  const handleOpen = () => {
    setEditName(name);
    setEditColor(color);
    setIsOpen(true);
  };

  return (
    <>
      <div className="flex items-center justify-between p-3 rounded-lg border">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleOpen}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {typeLabels[type]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={`Nome do ${typeLabels[type].toLowerCase()}`}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <ColorPicker value={editColor} onChange={setEditColor} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isPending || !editName.trim()}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
