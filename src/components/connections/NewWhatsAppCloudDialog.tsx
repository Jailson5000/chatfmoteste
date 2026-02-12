import { useState, useCallback, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { META_APP_ID, META_CONFIG_ID } from "@/lib/meta-config";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface NewWhatsAppCloudDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewWhatsAppCloudDialog({ open, onClose, onCreated }: NewWhatsAppCloudDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const { toast } = useToast();

  // META_APP_ID and META_CONFIG_ID imported from meta-config

  // Initialize Facebook SDK
  useEffect(() => {
    if (!META_APP_ID) return;

    const initFB = () => {
      window.FB.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      setSdkReady(true);
    };

    if (window.FB) {
      initFB();
    } else {
      window.fbAsyncInit = initFB;
    }
  }, [META_APP_ID]);

  const handleConnect = useCallback(() => {
    if (!META_APP_ID || !META_CONFIG_ID) {
      toast({
        title: "Configuração incompleta",
        description: "META_APP_ID ou META_CONFIG_ID não configurados.",
        variant: "destructive",
      });
      return;
    }

    if (!window.FB || !sdkReady) {
      toast({
        title: "SDK não carregado",
        description: "Aguarde o carregamento do Facebook SDK e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);

    // Embedded Signup session info listener
    const sessionInfoListener = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          // data.data contains { phone_number_id, waba_id }
          if (data.data) {
            console.log("[embedded-signup] Session info:", data.data);
            // Store for use in the FB.login callback
            (window as any).__waEmbeddedSignupData = data.data;
          }
          if (data.event === "FINISH") {
            console.log("[embedded-signup] User finished the signup flow");
          } else if (data.event === "CANCEL") {
            console.log("[embedded-signup] User cancelled the signup flow");
            setIsConnecting(false);
          }
        }
      } catch {
        // Not our message, ignore
      }
    };

    window.addEventListener("message", sessionInfoListener);

    window.FB.login(
      async (response: any) => {
        window.removeEventListener("message", sessionInfoListener);

        if (!response.authResponse) {
          console.log("[embedded-signup] User cancelled or failed login");
          setIsConnecting(false);
          return;
        }

        const code = response.authResponse.code;
        if (!code) {
          toast({
            title: "Erro na autenticação",
            description: "Nenhum código de autorização recebido.",
            variant: "destructive",
          });
          setIsConnecting(false);
          return;
        }

        // Get embedded signup data (phone_number_id, waba_id)
        const embeddedData = (window as any).__waEmbeddedSignupData || {};
        delete (window as any).__waEmbeddedSignupData;

        const phoneNumberId = embeddedData.phone_number_id;
        const wabaId = embeddedData.waba_id;

        if (!phoneNumberId || !wabaId) {
          toast({
            title: "Dados incompletos",
            description: "Não foi possível obter o número do WhatsApp. Tente novamente.",
            variant: "destructive",
          });
          setIsConnecting(false);
          return;
        }

        try {
          // Call edge function to exchange code for token and save
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;

          if (!accessToken) {
            toast({
              title: "Sessão expirada",
              description: "Faça login novamente.",
              variant: "destructive",
            });
            setIsConnecting(false);
            return;
          }

          const res = await supabase.functions.invoke("meta-oauth-callback", {
            body: {
              code,
              type: "whatsapp_cloud",
              phoneNumberId,
              wabaId,
            },
          });

          if (res.error || res.data?.error) {
            throw new Error(res.data?.error || res.error?.message || "Erro ao salvar conexão");
          }

          toast({
            title: "WhatsApp conectado!",
            description: `Número ${res.data?.pageName || phoneNumberId} conectado com sucesso.`,
          });

          onCreated();
          onClose();
        } catch (err: any) {
          console.error("[embedded-signup] Error saving connection:", err);
          toast({
            title: "Erro ao conectar",
            description: err.message || "Tente novamente.",
            variant: "destructive",
          });
        } finally {
          setIsConnecting(false);
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: 2,
        },
      }
    );
  }, [toast, onClose, onCreated, META_APP_ID, META_CONFIG_ID, sdkReady]);

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
            disabled={isConnecting || !sdkReady}
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
