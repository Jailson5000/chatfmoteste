import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";

interface SuspendCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export function SuspendCompanyDialog({
  open,
  onOpenChange,
  companyName,
  onConfirm,
  isLoading = false,
}: SuspendCompanyDialogProps) {
  const [reason, setReason] = useState(() => {
    const today = new Date().toLocaleDateString("pt-BR");
    return `Inadimplência - Verificado em: ${today}`;
  });

  const handleConfirm = () => {
    onConfirm(reason);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Suspender Empresa
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              Tem certeza que deseja suspender a empresa <strong>"{companyName}"</strong>?
            </p>
            <p>
              A empresa não terá acesso ao sistema até que o pagamento seja regularizado 
              e você libere manualmente.
            </p>
            
            <div className="space-y-2 pt-2">
              <Label htmlFor="suspension-reason">Motivo da suspensão:</Label>
              <Textarea
                id="suspension-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Inadimplência desde 01/02/2026"
                className="min-h-[80px]"
              />
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3 mt-4">
              <p className="text-sm text-orange-700 dark:text-orange-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                O cliente verá apenas a tela de pagamento quando tentar acessar o sistema.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? "Suspendendo..." : "Suspender"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
