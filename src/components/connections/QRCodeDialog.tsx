import { CheckCircle2, Loader2, QrCode, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface QRCodeDialogProps {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  qrCode: string | null;
  isLoading: boolean;
  error: string | null;
  connectionStatus: string | null;
  pollCount: number;
  maxPolls: number;
}

export function QRCodeDialog({
  open,
  onClose,
  onRetry,
  qrCode,
  isLoading,
  error,
  connectionStatus,
  pollCount,
  maxPolls,
}: QRCodeDialogProps) {
  const isConnected = connectionStatus === "Conectado!";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com o WhatsApp do seu celular
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-muted-foreground">{connectionStatus || "Carregando..."}</p>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : isConnected ? (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-16 w-16 text-success" />
              <p className="text-lg font-medium text-success">Conectado!</p>
            </div>
          ) : qrCode ? (
            <>
              <div className="bg-white p-4 rounded-xl shadow-lg">
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code para conectar WhatsApp"
                  className="w-64 h-64"
                  loading="lazy"
                />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  {connectionStatus ||
                    "Abra o WhatsApp > Menu > Dispositivos conectados > Conectar dispositivo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Verificando conexão... ({pollCount}/{maxPolls})
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <QrCode className="h-16 w-16 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">QR Code não disponível</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {error && (
            <Button onClick={onRetry}>Tentar Novamente</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
