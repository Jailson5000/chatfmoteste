import { useState, useMemo } from "react";
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
  onCreate: (displayName: string, instanceName: string) => Promise<void>;
  isCreating: boolean;
}

// Generate a short random string for instance name
function generateInstanceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function NewInstanceDialog({
  open,
  onClose,
  onCreate,
  isCreating,
}: NewInstanceDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const { toast } = useToast();

  // Generate a unique instance name when dialog opens
  const instanceName = useMemo(() => {
    return `inst_${generateInstanceId()}`;
  }, [open]);

  const handleCreate = async () => {
    const name = displayName.trim();
    
    if (!name) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe um nome para a conexão",
        variant: "destructive",
      });
      return;
    }

    await onCreate(name, instanceName);
    setDisplayName("");
  };

  const handleClose = () => {
    setDisplayName("");
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
            <Label htmlFor="display-name">Nome da Conexão</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: WhatsApp Principal"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Este nome será exibido para identificar a conexão
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !displayName.trim()}>
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