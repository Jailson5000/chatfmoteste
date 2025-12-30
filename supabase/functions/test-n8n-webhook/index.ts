import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { webhookUrl, secret } = await req.json();

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "URL do webhook é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    try {
      new URL(webhookUrl);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "URL inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[test-n8n-webhook] Testing connection to:", webhookUrl);

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secret) {
      headers["Authorization"] = `Bearer ${secret}`;
    }

    // Send test payload to webhook
    const testPayload = {
      event: "connection_test",
      timestamp: new Date().toISOString(),
      source: "miauchat",
      message: "Teste de conexão do MiauChat",
    };

    const startTime = Date.now();
    
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(testPayload),
    });

    const responseTime = Date.now() - startTime;
    const responseText = await response.text();

    console.log("[test-n8n-webhook] Response status:", response.status, "Time:", responseTime, "ms");

    if (response.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Conexão bem-sucedida (${responseTime}ms)`,
          status: response.status,
          responseTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.log("[test-n8n-webhook] Error response:", responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
          responseTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[test-n8n-webhook] Error:", error);
    
    let errorMessage = "Erro ao testar conexão";
    if (error instanceof Error) {
      if (error.message.includes("fetch")) {
        errorMessage = "Não foi possível conectar ao webhook. Verifique a URL.";
      } else {
        errorMessage = error.message;
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
