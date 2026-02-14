import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getFixedRedirectUri } from "@/lib/meta-config";
import { Loader2 } from "lucide-react";

/**
 * Meta OAuth Callback Handler
 * 
 * This page handles the redirect from Meta's OAuth flow for Instagram/Facebook integrations.
 * It exchanges the authorization code for a long-lived token and saves it to the database.
 * 
 * When opened as a popup, it communicates back to the opener via postMessage and closes itself.
 */
export default function MetaAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      const isPopup = !!window.opener;

      try {
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");
        const stateParam = searchParams.get("state");

        // Parse state to get the connection type
        let connectionType = "instagram"; // default
        if (stateParam) {
          try {
            const parsed = JSON.parse(stateParam);
            connectionType = parsed.type || "instagram";
          } catch { /* ignore parse errors */ }
        }

        const fallbackRoute = connectionType === "whatsapp_cloud" ? "/connections" : "/settings";

        if (error) {
          const errorMsg = errorDescription || error;
          if (isPopup) {
            window.opener.postMessage({ type: "meta-oauth-error", message: errorMsg }, "*");
            window.close();
            return;
          }
          toast({
            title: "Erro na autenticação",
            description: errorMsg,
            variant: "destructive",
          });
          navigate(fallbackRoute);
          return;
        }

        if (!code) {
          const errorMsg = "Código de autorização não encontrado";
          if (isPopup) {
            window.opener.postMessage({ type: "meta-oauth-error", message: errorMsg }, "*");
            window.close();
            return;
          }
          toast({
            title: "Erro",
            description: errorMsg,
            variant: "destructive",
          });
          navigate(fallbackRoute);
          return;
        }

        // Use the same fixed redirect URI that was used in the OAuth URL
        const redirectUri = getFixedRedirectUri();

        // Call the meta-oauth-callback edge function to exchange code for token
        const response = await supabase.functions.invoke("meta-oauth-callback", {
          body: {
            code,
            redirectUri,
            type: connectionType,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || "Falha ao processar autenticação");
        }

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Falha ao salvar conexão");
        }

        // Success!
        if (isPopup) {
          window.opener.postMessage({ type: "meta-oauth-success", data: response.data }, "*");
          window.close();
          return;
        }

        const typeLabel = response.data.type === 'instagram' ? 'Instagram' 
          : response.data.type === 'facebook' ? 'Facebook' 
          : 'WhatsApp Cloud';

        toast({
          title: "Sucesso!",
          description: `${typeLabel} conectado com sucesso.`,
        });

        navigate(connectionType === "whatsapp_cloud" ? "/connections" : "/settings?tab=integrations");
      } catch (error) {
        console.error("Meta callback error:", error);
        const errorMsg = error instanceof Error ? error.message : "Falha ao conectar com Meta";

        if (isPopup) {
          window.opener.postMessage({ type: "meta-oauth-error", message: errorMsg }, "*");
          window.close();
          return;
        }

        toast({
          title: "Erro ao conectar",
          description: errorMsg,
          variant: "destructive",
        });
        navigate("/settings");
      } finally {
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate, toast]);

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <h1 className="text-lg font-semibold">Conectando com Meta...</h1>
          <p className="text-sm text-muted-foreground mt-2">Aguarde enquanto processamos sua autenticação</p>
        </div>
      </div>
    );
  }

  return null;
}
