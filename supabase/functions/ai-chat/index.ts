import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatRequest {
  conversationId: string;
  message: string;
  automationId?: string; // Optional: use specific agent prompt
  context?: {
    clientName?: string;
    clientPhone?: string;
    currentStatus?: string;
    previousMessages?: Array<{ role: string; content: string }>;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message, automationId, context }: ChatRequest = await req.json();

    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: "conversationId and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Default system prompt
    let systemPrompt = `Você é um assistente virtual de atendimento jurídico chamado MiauChat.
    
Suas responsabilidades:
- Receber clientes de forma cordial e profissional
- Coletar informações iniciais sobre o caso
- Identificar a área jurídica relevante
- Avaliar a urgência do caso
- Encaminhar para um advogado humano quando necessário

Regras importantes:
- Nunca forneça aconselhamento jurídico específico
- Sempre informe que um advogado revisará o caso
- Seja empático e profissional
- Colete informações como: nome completo, documento, descrição do problema
- Pergunte sobre prazos e urgências
- Mantenha respostas concisas (máximo 3 parágrafos)

Se o cliente demonstrar urgência extrema ou risco iminente, informe que um advogado será acionado imediatamente.`;

    let temperature = 0.7;

    // If automationId provided, fetch custom prompt
    if (automationId) {
      const { data: automation, error: automationError } = await supabase
        .from("automations")
        .select("ai_prompt, ai_temperature, name")
        .eq("id", automationId)
        .eq("is_active", true)
        .single();

      if (automation && !automationError) {
        if (automation.ai_prompt) {
          systemPrompt = automation.ai_prompt;
        }
        if (automation.ai_temperature !== null) {
          temperature = automation.ai_temperature;
        }
        console.log(`Using custom prompt from automation: ${automation.name}`);
      }
    }

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    // Add context about the client
    if (context?.clientName || context?.clientPhone) {
      const clientInfo = `Informações do cliente:
- Nome: ${context.clientName || "Não informado"}
- Telefone: ${context.clientPhone || "Não informado"}
- Status atual: ${context.currentStatus || "Novo contato"}`;
      
      messages.push({ role: "system", content: clientInfo });
    }

    // Add previous messages for context (last 10)
    if (context?.previousMessages && context.previousMessages.length > 0) {
      const recentMessages = context.previousMessages.slice(-10);
      messages.push(...recentMessages);
    }

    // Add the current message
    messages.push({ role: "user", content: message });

    console.log(`[AI Chat] Processing message for conversation ${conversationId}`);
    console.log(`[AI Chat] Message count: ${messages.length}, Temperature: ${temperature}`);

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Chat] Lovable AI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Falha ao gerar resposta da IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      throw new Error("No response generated");
    }

    console.log(`[AI Chat] Response generated, length: ${aiResponse.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        response: aiResponse,
        conversationId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[AI Chat] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
