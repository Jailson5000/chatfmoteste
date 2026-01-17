import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Loader2 } from "lucide-react";

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalMessageContent: string;
  onSave: (noteContent: string) => Promise<void>;
}

export function AddNoteDialog({
  open,
  onOpenChange,
  originalMessageContent,
  onSave,
}: AddNoteDialogProps) {
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset note text when dialog opens
  useEffect(() => {
    if (open) {
      setNoteText("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!noteText.trim()) return;
    
    setIsSaving(true);
    try {
      await onSave(noteText.trim());
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const truncatedOriginal = originalMessageContent.length > 150
    ? `${originalMessageContent.slice(0, 150)}...`
    : originalMessageContent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-yellow-500" />
            Adicionar Nota Interna
          </DialogTitle>
          <DialogDescription>
            Crie uma nota privada sobre esta mensagem. Notas são visíveis apenas para a equipe.
          </DialogDescription>
        </DialogHeader>

        {/* Original message preview */}
        <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Mensagem original:</p>
          <p className="text-sm italic text-foreground/80 line-clamp-3">
            "{truncatedOriginal}"
          </p>
        </div>

        {/* Note input */}
        <Textarea
          placeholder="Digite sua nota aqui..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="min-h-[100px] resize-none"
          autoFocus
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!noteText.trim() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Nota"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
