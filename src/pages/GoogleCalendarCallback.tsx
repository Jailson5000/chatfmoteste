import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando ao Google Calendar...");
  const [returnOrigin, setReturnOrigin] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state"); // Base64 encoded JSON with law_firm_id and return_origin
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("Conexão cancelada ou negada pelo Google.");
      redirectBack(3000);
      return;
    }

    if (code && stateParam) {
      try {
        // Decode state parameter
        const stateData = JSON.parse(atob(stateParam));
        const lawFirmId = stateData.law_firm_id;
        const origin = stateData.return_origin;
        
        if (origin) {
          setReturnOrigin(origin);
        }

        if (lawFirmId) {
          handleOAuthCallback(code, lawFirmId, origin);
        } else {
          throw new Error("law_firm_id missing from state");
        }
      } catch (e) {
        console.error("[GoogleCalendarCallback] Error parsing state:", e);
        setStatus("error");
        setMessage("Parâmetros de autenticação inválidos. Tente novamente.");
        redirectBack(3000);
      }
    } else if (code && !stateParam) {
      setStatus("error");
      setMessage("Parâmetros de autenticação inválidos. Tente novamente.");
      redirectBack(3000);
    }
  }, [searchParams]);

  const redirectBack = (delay: number, origin?: string | null) => {
    const isPopup = window.name === "google_calendar_oauth";
    const targetOrigin = origin || returnOrigin;

    setTimeout(() => {
      if (isPopup) {
        // Popup flow: close window after signaling result via localStorage
        try {
          window.close();
          return;
        } catch {
          // ignore
        }
      }

      // If we have a return origin (tenant subdomain), redirect there
      if (targetOrigin && targetOrigin !== window.location.origin) {
        window.location.href = `${targetOrigin}/settings?tab=integrations`;
      } else {
        navigate("/settings?tab=integrations");
      }
    }, delay);
  };

  const handleOAuthCallback = async (code: string, lawFirmId: string, origin?: string | null) => {
    try {
      console.log("[GoogleCalendarCallback] Exchanging code for law_firm:", lawFirmId);

      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: {
          action: "exchange_code",
          code,
          law_firm_id: lawFirmId,
          // redirect_url not needed anymore - edge function uses centralized URL
        },
      });

      if (error) throw error;

      if (data?.success) {
        setStatus("success");
        setMessage(`Google Calendar conectado com sucesso! (${data.email})`);

        // Signal result to opener (works even with noopener via storage event)
        try {
          localStorage.setItem(
            "google_calendar_oauth_result",
            JSON.stringify({ status: "success", email: data.email, ts: Date.now() })
          );
        } catch {
          // ignore
        }

        redirectBack(1200, origin);
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("[GoogleCalendarCallback] Error:", error);
      setStatus("error");
      setMessage(error.message || "Erro ao conectar com o Google Calendar.");

      try {
        localStorage.setItem(
          "google_calendar_oauth_result",
          JSON.stringify({ status: "error", message: error.message, ts: Date.now() })
        );
      } catch {
        // ignore
      }

      redirectBack(1500, origin);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg text-muted-foreground">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg text-green-600 dark:text-green-400">{message}</p>
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
