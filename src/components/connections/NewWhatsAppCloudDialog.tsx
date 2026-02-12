import { useState, useCallback } from "react";
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

interface NewWhatsAppCloudDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewWhatsAppCloudDialog({ open, onClose, onCreated }: NewWhatsAppCloudDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const handleConnect = useCallback(() => {
    const META_APP_ID = import.meta.env.VITE_META_APP_ID;
    if (!META_APP_ID) {
      toast({ title: "META_APP_ID não configurado", description: "Configure nas variáveis de ambiente.", variant: "destructive" });
      return;
    }

    setIsConnecting(true);

    const redirectUri = `${window.location.origin}/auth/meta-callback`;
    const scope = "whatsapp_business_management,whatsapp_business_messaging,business_management";
    const state = JSON.stringify({ type: "whatsapp_cloud" });

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;

    window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");

    // Close dialog - MetaAuthCallback will handle the rest
    setTimeout(() => {
      setIsConnecting(false);
      onClose();
    }, 1000);
  }, [toast, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Conectar WhatsApp Cloud (API Oficial)
          </DialogTitle>
          <DialogDescription>
            Conecte sua conta do WhatsApp Business diretamente pelo Facebook. Basta fazer login e autorizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <h4 className="text-sm font-medium">Como funciona:</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Clique em "Conectar com Facebook"</li>
              <li>Faça login na sua conta do Facebook</li>
              <li>Autorize o acesso ao WhatsApp Business</li>
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
                Abrindo Facebook...
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
