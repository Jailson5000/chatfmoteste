import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { lawFirm } = useLawFirm();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando ao Google Calendar...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("Conexão cancelada ou negada pelo Google.");
      setTimeout(() => navigate("/settings?tab=integrations"), 3000);
      return;
    }

    if (code && lawFirm?.id) {
      handleOAuthCallback(code);
    } else if (!lawFirm?.id) {
      // Wait for lawFirm to load
      const timeout = setTimeout(() => {
        if (!lawFirm?.id) {
          setStatus("error");
          setMessage("Empresa não identificada. Tente novamente.");
          setTimeout(() => navigate("/settings?tab=integrations"), 3000);
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [searchParams, lawFirm?.id]);

  const handleOAuthCallback = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: {
          action: "exchange_code",
          code,
          law_firm_id: lawFirm?.id,
          redirect_url: `${window.location.origin}/integrations/google-calendar/callback`,
        },
      });

      if (error) throw error;

      setStatus("success");
      setMessage("Google Calendar conectado com sucesso!");
      setTimeout(() => navigate("/settings?tab=integrations"), 2000);
    } catch (error: any) {
      console.error("Error in OAuth callback:", error);
      setStatus("error");
      setMessage(error.message || "Erro ao conectar com o Google Calendar.");
      setTimeout(() => navigate("/settings?tab=integrations"), 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg text-muted-foreground">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg text-green-600">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-lg text-destructive">{message}</p>
          </>
        )}
        <p className="text-sm text-muted-foreground">Redirecionando...</p>
      </div>
    </div>
  );
}
