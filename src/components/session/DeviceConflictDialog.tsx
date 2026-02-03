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
import { Laptop, LogOut } from "lucide-react";

interface DeviceConflictDialogProps {
  open: boolean;
  conflictingDevice: string | null;
  onContinueHere: () => void;
  onLogout: () => void;
}

export function DeviceConflictDialog({
  open,
  conflictingDevice,
  onContinueHere,
  onLogout,
}: DeviceConflictDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/20">
              <Laptop className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-lg">
              Conta em uso em outro dispositivo
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-muted-foreground space-y-2">
            <p>
              Sua conta está conectada em:{" "}
              <strong className="text-foreground">
                {conflictingDevice || "outro dispositivo"}
              </strong>
            </p>
            <p>
              Por segurança, apenas um dispositivo pode estar conectado por vez.
              Se você continuar aqui, o outro dispositivo será desconectado.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={onLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinueHere}>
            Continuar aqui
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
