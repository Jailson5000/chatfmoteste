import { useState, useEffect } from "react";
import { Info, Phone, Upload, AlertTriangle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { formatPhone, unmask } from "@/lib/inputMasks";

interface NewContactDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (phone: string, connectionId?: string) => void;
  onOpenImport: () => void;
  isCreating?: boolean;
}

export function NewContactDialog({
  open,
  onClose,
  onCreate,
  onOpenImport,
  isCreating = false,
}: NewContactDialogProps) {
  const [phone, setPhone] = useState("");
  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const { instances, isLoading: isLoadingInstances } = useWhatsAppInstances();

  const connectedInstances = instances.filter(i => i.status === "connected");
  const selectedInstance = connectedInstances.find(i => i.id === selectedConnection);

  // Auto-select first connection only when dialog opens
  useEffect(() => {
    if (open && connectedInstances.length > 0 && !selectedConnection) {
      setSelectedConnection(connectedInstances[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const phoneDigits = unmask(phone);
  const isPhoneValid = phoneDigits.length >= 8;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Remove non-digits for storage
    const digits = value.replace(/\D/g, "");
    setPhone(digits);
  };

  const handleCreate = () => {
    if (!isPhoneValid) return;
    
    // Build full phone with country code
    const fullPhone = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;
    onCreate(fullPhone, selectedConnection || undefined);
  };

  const handleClose = () => {
    setPhone("");
    setSelectedConnection("");
    onClose();
  };

  const handleOpenImport = () => {
    handleClose();
    onOpenImport();
  };

  // Format display phone
  const displayPhone = phone ? formatPhone(phone) : "";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Novo contato</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Digite o número de telefone do cliente e selecione a conexão para iniciar uma nova conversa.
          </p>
        </DialogHeader>

        <div className="px-6 space-y-4">
          {/* Info Alert */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Após criar o contato, ele ficará visível na{" "}
              <span className="text-primary underline underline-offset-2">tela de contatos</span>{" "}
              mesmo que o cliente ou você não envie mensagem.
            </p>
          </div>

          {/* Phone Input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Select defaultValue="BR">
                <SelectTrigger className="w-[100px] bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BR">BR +55</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Input
                  placeholder="Digite o número do contato"
                  value={displayPhone}
                  onChange={handlePhoneChange}
                  className="bg-muted/30 pr-10"
                />
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Connection Selector */}
            <Select
              value={selectedConnection}
              onValueChange={setSelectedConnection}
              disabled={connectedInstances.length === 0}
            >
              <SelectTrigger className="w-full bg-muted/30">
                {isLoadingInstances ? (
                  <span className="text-muted-foreground">Carregando...</span>
                ) : connectedInstances.length === 0 ? (
                  <span className="text-muted-foreground">Nenhuma conexão</span>
                ) : (
                  <SelectValue placeholder="Selecione uma conexão" />
                )}
              </SelectTrigger>
              <SelectContent position="popper" className="z-[9999]">
                {connectedInstances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-emerald-500" />
                      <span>{instance.display_name || instance.instance_name}</span>
                      {instance.phone_number && (
                        <span className="text-muted-foreground text-xs">
                          {formatPhone(instance.phone_number)}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Validation Warning */}
          {phone && !isPhoneValid && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">
                Telefone deve ter pelo menos 8 dígitos
              </span>
            </div>
          )}
        </div>

        <div className="p-6 pt-6 space-y-3">
          {/* Create Button */}
          <Button
            onClick={handleCreate}
            disabled={!isPhoneValid || isCreating}
            className="w-full"
          >
            {isCreating ? "Criando..." : "Iniciar conversa"}
            <span className="ml-2">+</span>
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-muted-foreground uppercase">ou</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Import Button */}
          <Button
            variant="outline"
            onClick={handleOpenImport}
            className="w-full gap-2"
          >
            <Upload className="h-4 w-4" />
            Importar Contatos em Massa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
