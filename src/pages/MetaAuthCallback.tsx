import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Meta OAuth Callback Handler
 * 
 * This page handles the redirect from Meta's OAuth flow for Instagram/Facebook integrations.
 * It exchanges the authorization code for a long-lived token and saves it to the database.
 */
export default function MetaAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
          toast({
            title: "Erro na autenticação",
            description: errorDescription || error,
            variant: "destructive",
          });
          navigate("/settings");
          return;
        }

        if (!code) {
          toast({
            title: "Erro",
            description: "Código de autorização não encontrado",
            variant: "destructive",
          });
          navigate("/settings");
          return;
        }

        // Call the meta-oauth-callback edge function to exchange code for token
        const response = await supabase.functions.invoke("meta-oauth-callback", {
          body: {
            code,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || "Falha ao processar autenticação");
        }

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Falha ao salvar conexão");
        }

        toast({
          title: "Sucesso!",
          description: `${response.data.type === 'instagram' ? 'Instagram' : response.data.type === 'facebook' ? 'Facebook' : 'WhatsApp'} conectado com sucesso.`,
        });

        // Redirect back to settings with success
        navigate("/settings?tab=integrations");
      } catch (error) {
        console.error("Meta callback error:", error);
        toast({
          title: "Erro ao conectar",
          description: error instanceof Error ? error.message : "Falha ao conectar com Meta",
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
