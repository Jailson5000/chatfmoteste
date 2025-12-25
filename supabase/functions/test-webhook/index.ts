import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { webhookUrl, testPayload } = await req.json();

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "URL do webhook não informada" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Test Webhook] Testing URL: ${webhookUrl}`);

    const payload = testPayload || {
      test: true,
      timestamp: new Date().toISOString(),
      source: "lovable-juridico",
      message: "Teste de conexão do sistema jurídico",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": "Lovable-Juridico/1.0"
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      console.log(`[Test Webhook] Response status: ${response.status}`);
      console.log(`[Test Webhook] Response body: ${responseText.substring(0, 500)}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `HTTP ${response.status}: ${response.statusText}`,
            response: responseData
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: response.status,
          response: responseData 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        return new Response(
          JSON.stringify({ success: false, error: "Timeout: O webhook não respondeu em 10 segundos" }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw fetchError;
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[Test Webhook] Error:", err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message || "Erro desconhecido ao testar webhook" 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
