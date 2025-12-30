import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClassifyRequest {
  conversationId?: string;
  text: string;
}

interface ClassificationResult {
  legalArea: string;
  legalAreaConfidence: number;
  priority: "baixa" | "média" | "alta" | "urgente";
  priorityReason: string;
  suggestedStatus: string;
  keyTopics: string[];
  needsHumanReview: boolean;
  summary: string;
}

// Legal areas defined in the database
const LEGAL_AREAS = [
  "civil",
  "trabalhista", 
  "penal",
  "familia",
  "consumidor",
  "empresarial",
  "tributario",
  "ambiental",
  "outros"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, text }: ClassifyRequest = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "text is required" }),
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

    console.log(`[AI Classify] Processing text for classification, length: ${text.length}`);

    // Use tool calling for structured output
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em classificação de casos jurídicos no Brasil.
Analise o texto fornecido e classifique:
1. Área jurídica (escolha UMA das opções: ${LEGAL_AREAS.join(", ")})
2. Prioridade (baixa, média, alta, urgente)
3. Se precisa de revisão humana imediata
4. Principais tópicos identificados
5. Breve resumo do caso

Critérios de prioridade:
- URGENTE: Prazos em menos de 48h, risco de prisão, medidas protetivas, violência
- ALTA: Prazos em menos de 1 semana, processos em andamento críticos
- MÉDIA: Casos novos sem urgência imediata, consultas iniciais
- BAIXA: Informações gerais, dúvidas simples`
          },
          {
            role: "user",
            content: `Classifique o seguinte texto:\n\n${text}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_case",
              description: "Classifica um caso jurídico com área, prioridade e detalhes",
              parameters: {
                type: "object",
                properties: {
                  legalArea: {
                    type: "string",
                    enum: LEGAL_AREAS,
                    description: "Área jurídica do caso"
                  },
                  legalAreaConfidence: {
                    type: "number",
                    description: "Confiança na classificação (0-1)"
                  },
                  priority: {
                    type: "string",
                    enum: ["baixa", "média", "alta", "urgente"],
                    description: "Nível de prioridade"
                  },
                  priorityReason: {
                    type: "string",
                    description: "Justificativa da prioridade"
                  },
                  suggestedStatus: {
                    type: "string",
                    description: "Status sugerido (novo_contato, triagem_ia, aguardando_documentos, em_analise)"
                  },
                  keyTopics: {
                    type: "array",
                    items: { type: "string" },
                    description: "Principais tópicos identificados"
                  },
                  needsHumanReview: {
                    type: "boolean",
                    description: "Se precisa revisão humana imediata"
                  },
                  summary: {
                    type: "string",
                    description: "Resumo breve do caso (máx 100 palavras)"
                  }
                },
                required: ["legalArea", "legalAreaConfidence", "priority", "priorityReason", "suggestedStatus", "keyTopics", "needsHumanReview", "summary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_case" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Classify] Lovable AI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Falha ao classificar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let classification: ClassificationResult;

    if (toolCall?.function?.arguments) {
      classification = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback if tool calling didn't work
      classification = {
        legalArea: "outros",
        legalAreaConfidence: 0.5,
        priority: "média",
        priorityReason: "Classificação padrão",
        suggestedStatus: "triagem_ia",
        keyTopics: [],
        needsHumanReview: true,
        summary: "Classificação automática não disponível"
      };
    }

    console.log(`[AI Classify] Result: area=${classification.legalArea}, priority=${classification.priority}`);

    // If conversationId provided, optionally update the conversation
    if (conversationId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Map priority to number (1-4)
      const priorityMap: Record<string, number> = {
        "baixa": 1,
        "média": 2,
        "alta": 3,
        "urgente": 4
      };

      await supabase
        .from("conversations")
        .update({
          priority: priorityMap[classification.priority] || 2,
          ai_summary: classification.summary,
          needs_human_handoff: classification.needsHumanReview
        })
        .eq("id", conversationId);

      console.log(`[AI Classify] Updated conversation ${conversationId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        classification,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[AI Classify] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
