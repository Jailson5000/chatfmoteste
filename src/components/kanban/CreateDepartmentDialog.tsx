import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ColorPicker } from "@/components/ui/color-picker";
import { useDepartments } from "@/hooks/useDepartments";

interface CreateDepartmentDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateDepartmentDialog({ 
  trigger, 
  open: controlledOpen, 
  onOpenChange 
}: CreateDepartmentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  
  const { createDepartment } = useDepartments();
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createDepartment.mutateAsync({ name, color });
    setName("");
    setColor("#6366f1");
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setName("");
      setColor("#6366f1");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Departamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Nome do Departamento</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Vendas"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleCreate();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createDepartment.isPending || !name.trim()}>
              {createDepartment.isPending ? "Criando..." : "Criar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
