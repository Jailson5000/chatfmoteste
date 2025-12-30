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
    const { apiKey } = await req.json();

    if (!apiKey || typeof apiKey !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "API Key não fornecida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate API key format
    if (!apiKey.startsWith("sk-")) {
      return new Response(
        JSON.stringify({ success: false, error: "Formato de API Key inválido. Deve começar com 'sk-'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test connection by making a simple request to OpenAI models endpoint
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "API Key validada com sucesso!" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle specific error cases
    if (response.status === 401) {
      return new Response(
        JSON.stringify({ success: false, error: "API Key inválida ou expirada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ success: false, error: "Limite de requisições excedido. Aguarde um momento." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errorData = await response.text();
    console.error("OpenAI API error:", response.status, errorData);

    return new Response(
      JSON.stringify({ success: false, error: `Erro ao validar: ${response.status}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error testing OpenAI key:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno ao testar conexão" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
