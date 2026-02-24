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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface NewInstanceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (displayName: string, instanceName: string, provider?: string, uazapiUrl?: string, uazapiToken?: string) => Promise<void>;
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
  const [provider, setProvider] = useState<"evolution" | "uazapi">("evolution");
  const [uazapiSubdomain, setUazapiSubdomain] = useState("");
  const [uazapiToken, setUazapiToken] = useState("");
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

    if (provider === "uazapi") {
      if (!uazapiSubdomain.trim()) {
        toast({
          title: "Subdomínio obrigatório",
          description: "Informe o subdomínio da sua instância uazapi",
          variant: "destructive",
        });
        return;
      }
      if (!uazapiToken.trim()) {
        toast({
          title: "Token obrigatório",
          description: "Informe o token da sua instância uazapi",
          variant: "destructive",
        });
        return;
      }
      const uazapiUrl = `https://${uazapiSubdomain.trim()}.uazapi.com`;
      await onCreate(name, instanceName, "uazapi", uazapiUrl, uazapiToken.trim());
    } else {
      await onCreate(name, instanceName);
    }
    resetForm();
  };

  const resetForm = () => {
    setDisplayName("");
    setProvider("evolution");
    setUazapiSubdomain("");
    setUazapiToken("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isValid = displayName.trim() && (
    provider === "evolution" || 
    (provider === "uazapi" && uazapiSubdomain.trim() && uazapiToken.trim())
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
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

          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select 
              value={provider} 
              onValueChange={(v) => setProvider(v as "evolution" | "uazapi")}
              disabled={isCreating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evolution">
                  <div className="flex items-center gap-2">
                    Evolution API
                    <Badge variant="outline" className="text-xs">Padrão</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="uazapi">
                  <div className="flex items-center gap-2">
                    uazapi
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">SaaS</Badge>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider === "uazapi" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="uazapi-subdomain">Subdomínio uazapi</Label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">https://</span>
                  <Input
                    id="uazapi-subdomain"
                    value={uazapiSubdomain}
                    onChange={(e) => setUazapiSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                    placeholder="minha-instancia"
                    disabled={isCreating}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">.uazapi.com</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="uazapi-token">Token</Label>
                <Input
                  id="uazapi-token"
                  type="password"
                  value={uazapiToken}
                  onChange={(e) => setUazapiToken(e.target.value)}
                  placeholder="Token da instância uazapi"
                  disabled={isCreating}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre o token no painel admin da uazapi
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !isValid}>
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