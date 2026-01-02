import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

// This callback page runs on the MAIN domain (www.miauchat.com.br)
// It does NOT require user session - just exchanges the OAuth code and redirects back to tenant
export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando ao Google Calendar...");

  useEffect(() => {
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("Conexão cancelada ou negada pelo Google.");
      if (stateParam) {
        try {
          const stateData = JSON.parse(atob(stateParam));
          finishAndClose(stateData.return_origin, false);
        } catch {
          finishAndClose(null, false);
        }
      } else {
        finishAndClose(null, false);
      }
      return;
    }

    if (code && stateParam) {
      handleOAuthCallback(code, stateParam);
    } else {
      setStatus("error");
      setMessage("Parâmetros de autenticação inválidos.");
      finishAndClose(null, false);
    }
  }, [searchParams]);

  const finishAndClose = (returnOrigin: string | null, success: boolean, email?: string) => {
    // Check if we're in a popup window
    const isPopup = window.opener && !window.opener.closed;

    // Signal result to opener window via localStorage
    try {
      localStorage.setItem(
        "google_calendar_oauth_result",
        JSON.stringify({
          status: success ? "success" : "error",
          email: email || undefined,
          message: success ? undefined : message,
          ts: Date.now(),
        })
      );
    } catch {
      // ignore localStorage errors
    }

    setTimeout(() => {
      if (isPopup) {
        // We're in a popup - just close it
        // The opener window will detect the localStorage change and refresh
        try {
          window.close();
        } catch {
          // If we can't close, redirect as fallback
          redirectToTenant(returnOrigin, success, email);
        }
      } else {
        // Not a popup (user opened directly or popup blocked) - redirect
        redirectToTenant(returnOrigin, success, email);
      }
    }, 1000);
  };

  const redirectToTenant = (returnOrigin: string | null, success: boolean, email?: string) => {
    const params = new URLSearchParams();
    params.set("tab", "integrations");
    if (success && email) {
      params.set("gcal_success", "true");
      params.set("gcal_email", email);
    } else {
      params.set("gcal_error", "true");
    }

    if (returnOrigin) {
      window.location.href = `${returnOrigin}/settings?${params.toString()}`;
    } else {
      window.location.href = `/settings?${params.toString()}`;
    }
  };

  const handleOAuthCallback = async (code: string, stateParam: string) => {
    let returnOrigin: string | null = null;
    let lawFirmId: string | null = null;

    try {
      // Decode state parameter
      const stateData = JSON.parse(atob(stateParam));
      lawFirmId = stateData.law_firm_id;
      returnOrigin = stateData.return_origin;

      if (!lawFirmId) {
        throw new Error("law_firm_id missing from state");
      }

      console.log("[GoogleCalendarCallback] Exchanging code for law_firm:", lawFirmId);

      // Call edge function directly without Supabase client (no auth needed)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/google-calendar-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({
          action: "exchange_code",
          code,
          law_firm_id: lawFirmId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao trocar código OAuth");
      }

      if (data?.success) {
        setStatus("success");
        setMessage(`Google Calendar conectado com sucesso! (${data.email})`);
        finishAndClose(returnOrigin, true, data.email);
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("[GoogleCalendarCallback] Error:", error);
      setStatus("error");
      setMessage(error.message || "Erro ao conectar com o Google Calendar.");
      finishAndClose(returnOrigin, false);
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
            <p className="text-sm text-muted-foreground">Fechando janela...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-lg text-destructive">{message}</p>
            <p className="text-sm text-muted-foreground">Fechando janela...</p>
          </>
        )}
      </div>
    </div>
  );
}
