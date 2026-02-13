import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { META_APP_ID, META_CONFIG_ID, META_GRAPH_API_VERSION, getFixedRedirectUri } from "@/lib/meta-config";

interface NewWhatsAppCloudDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewWhatsAppCloudDialog({ open, onClose, onCreated }: NewWhatsAppCloudDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  // Listen for postMessage from MetaAuthCallback popup
  useEffect(() => {
    if (!isConnecting) return;

    const timeout = setTimeout(() => {
      setIsConnecting(false);
      toast({
        title: "Tempo esgotado",
        description: "O fluxo de conexão não respondeu em 3 minutos. Tente novamente.",
        variant: "destructive",
      });
    }, 180_000);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "meta-oauth-success") {
        clearTimeout(timeout);
        setIsConnecting(false);
        toast({
          title: "WhatsApp conectado!",
          description: "Sua conta WhatsApp Business foi conectada com sucesso.",
        });
        onCreated();
        onClose();
      } else if (event.data?.type === "meta-oauth-error") {
        clearTimeout(timeout);
        setIsConnecting(false);
        toast({
          title: "Erro ao conectar",
          description: event.data.message || "Tente novamente.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [isConnecting, toast, onCreated, onClose]);

  const handleConnect = useCallback(() => {
    if (!META_APP_ID || !META_CONFIG_ID) {
      toast({
        title: "Configuração incompleta",
        description: "META_APP_ID ou META_CONFIG_ID não configurados.",
        variant: "destructive",
      });
      return;
    }

    const redirectUri = getFixedRedirectUri();
    const state = JSON.stringify({ type: "whatsapp_cloud" });
    const scope = "whatsapp_business_management,whatsapp_business_messaging,business_management";

    const oauthUrl = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?client_id=${META_APP_ID}&config_id=${META_CONFIG_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&override_default_response_type=true&scope=${scope}&state=${encodeURIComponent(state)}`;

    const width = 700;
    const height = 800;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      oauthUrl,
      "whatsapp_cloud_signup",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      toast({
        title: "Popup bloqueado",
        description: "Permita popups neste site e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
  }, [toast]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Conectar WhatsApp Cloud (API Oficial)
          </DialogTitle>
          <DialogDescription>
            Conecte sua conta do WhatsApp Business diretamente pelo Facebook. Basta fazer login, configurar sua empresa e verificar seu número.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <h4 className="text-sm font-medium">Como funciona:</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Clique em "Conectar com Facebook"</li>
              <li>Faça login na sua conta do Facebook</li>
              <li>Selecione ou crie seu portfólio empresarial</li>
              <li>Configure sua conta WhatsApp Business</li>
              <li>Insira e verifique o número de telefone</li>
              <li>Pronto! Sua conexão será criada automaticamente</li>
            </ol>
          </div>

          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white"
            size="lg"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                Conectar com Facebook
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Seu token é obtido de forma segura via OAuth e criptografado automaticamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
