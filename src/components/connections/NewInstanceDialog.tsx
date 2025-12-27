import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface NewInstanceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  isCreating: boolean;
}

export function NewInstanceDialog({
  open,
  onClose,
  onCreate,
  isCreating,
}: NewInstanceDialogProps) {
  const [instanceName, setInstanceName] = useState("");
  const { toast } = useToast();

  const handleCreate = async () => {
    const name = instanceName.trim();
    
    if (!name) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe um nome para a instância",
        variant: "destructive",
      });
      return;
    }

    // Validate name format (no spaces, only letters, numbers, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      toast({
        title: "Nome inválido",
        description: "Use apenas letras, números, underscores e hífens (sem espaços)",
        variant: "destructive",
      });
      return;
    }

    await onCreate(name);
    setInstanceName("");
  };

  const handleClose = () => {
    setInstanceName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
          <DialogDescription>
            Crie uma nova conexão para vincular um número de WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="instance-name">Nome da Conexão</Label>
            <Input
              id="instance-name"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="Ex: WhatsApp_Principal"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Use apenas letras, números, underscores e hífens (sem espaços)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !instanceName.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Conexão"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
