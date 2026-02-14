import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Meta OAuth Callback Handler
 * 
 * When opened as a popup (which is the normal flow), this page simply
 * extracts the authorization code and sends it back to the opener window
 * via postMessage. The opener (which has an active Supabase session) then
 * calls the edge function. This avoids the cross-origin localStorage issue
 * where the popup domain differs from the app domain.
 *
 * When opened as a full-page navigation (fallback), it shows an error
 * asking the user to retry from the settings page.
 */
export default function MetaAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = () => {
      const isPopup = !!window.opener;

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

      const fallbackRoute = connectionType === "whatsapp_cloud" ? "/connections" : "/settings?tab=integrations";

      // Handle errors from Meta
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

      // SUCCESS: We have a code
      if (isPopup) {
        // Send the code back to the parent window which has the active session.
        // The parent will call meta-oauth-callback with proper auth.
        window.opener.postMessage(
          { type: "meta-oauth-code", code, connectionType },
          "*"
        );
        window.close();
        return;
      }

      // Not a popup – can't process without a session on this origin.
      toast({
        title: "Erro",
        description: "Não foi possível processar. Por favor, tente novamente pela página de configurações.",
        variant: "destructive",
      });
      navigate(fallbackRoute);
      setIsProcessing(false);
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
