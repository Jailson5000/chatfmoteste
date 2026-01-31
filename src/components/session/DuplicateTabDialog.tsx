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
import { MonitorSmartphone } from "lucide-react";

interface DuplicateTabDialogProps {
  open: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

export function DuplicateTabDialog({ open, onContinue, onCancel }: DuplicateTabDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
              <MonitorSmartphone className="h-5 w-5 text-warning" />
            </div>
            <AlertDialogTitle className="text-lg">
              Aba duplicada detectada
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-muted-foreground">
            O MiauChat já está aberto em outra aba do navegador.
            <br /><br />
            Se você continuar aqui, a outra aba será desconectada para economizar recursos do sistema.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={onCancel}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>
            Continuar aqui
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
