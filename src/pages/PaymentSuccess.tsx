import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle, Mail, ExternalLink } from "lucide-react";
import miauchatLogo from "@/assets/miauchat-logo.png";

interface VerificationResult {
  success: boolean;
  alreadyProvisioned?: boolean;
  companyId?: string;
  companyName?: string;
  subdomain?: string;
  loginUrl?: string;
  message?: string;
  error?: string;
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    
    if (!sessionId) {
      setStatus("error");
      setResult({ success: false, error: "Sessão de pagamento não encontrada" });
      return;
    }

    verifyPayment(sessionId);
  }, [searchParams]);

  const verifyPayment = async (sessionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("verify-payment", {
        body: { sessionId },
      });

      if (error) {
        console.error("Verification error:", error);
        setStatus("error");
        setResult({ success: false, error: error.message });
        return;
      }

      if (data.success) {
        setStatus("success");
        setResult(data);
      } else {
        setStatus("error");
        setResult(data);
      }
    } catch (err) {
      console.error("Error verifying payment:", err);
      setStatus("error");
      setResult({ success: false, error: "Erro ao verificar pagamento" });
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center p-6">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-green-600/20 rounded-full blur-[180px]" />
      </div>

      <Card className="relative z-10 max-w-lg w-full bg-white/[0.03] border-white/10 text-white">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={miauchatLogo} alt="MiauChat" className="h-16 w-16" />
          </div>
          
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 text-red-500 animate-spin mx-auto mb-4" />
              <CardTitle className="text-2xl">Verificando pagamento...</CardTitle>
              <CardDescription className="text-white/60">
                Aguarde enquanto confirmamos seu pagamento e criamos sua conta.
              </CardDescription>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-2xl text-green-400">
                {result?.alreadyProvisioned ? "Conta já existente!" : "Pagamento confirmado!"}
              </CardTitle>
              <CardDescription className="text-white/60">
                {result?.message}
              </CardDescription>
            </>
          )}

          {status === "error" && (
            <>
              <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <CardTitle className="text-2xl text-red-400">Ops! Algo deu errado</CardTitle>
              <CardDescription className="text-white/60">
                {result?.error || "Não foi possível processar seu pagamento."}
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {status === "success" && (
            <>
              <div className="bg-white/[0.05] rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3 text-white/80">
                  <Mail className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">Verifique seu e-mail</p>
                    <p className="text-sm text-white/50">
                      Enviamos suas credenciais de acesso
                    </p>
                  </div>
                </div>

                {result?.subdomain && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-white/50 mb-2">Seu endereço exclusivo:</p>
                    <code className="block bg-black/30 px-4 py-2 rounded-lg text-red-400 font-mono text-sm">
                      {result.subdomain}.miauchat.com.br
                    </code>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {result?.loginUrl && (
                  <Button
                    asChild
                    className="w-full bg-red-600 hover:bg-red-500 h-12"
                  >
                    <a href={result.loginUrl} target="_blank" rel="noopener noreferrer">
                      Acessar minha conta
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                )}
                
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-12"
                >
                  <Link to="/">Voltar para o início</Link>
                </Button>
              </div>
            </>
          )}

          {status === "error" && (
            <div className="space-y-3">
              <Button
                asChild
                className="w-full bg-red-600 hover:bg-red-500 h-12"
              >
                <Link to="/#planos">Tentar novamente</Link>
              </Button>
              
              <Button
                asChild
                variant="outline"
                className="w-full border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white h-12"
              >
                <a href="mailto:suporte@miauchat.com.br">
                  Contatar suporte
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
