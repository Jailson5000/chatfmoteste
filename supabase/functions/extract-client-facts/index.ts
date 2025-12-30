import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractFactsRequest {
  conversationId: string;
  clientId: string;
  lawFirmId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, clientId, lawFirmId }: ExtractFactsRequest = await req.json();

    if (!conversationId || !clientId || !lawFirmId) {
      return new Response(
        JSON.stringify({ error: "conversationId, clientId and lawFirmId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent messages from the conversation
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("content, is_from_me, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (messagesError || !messages || messages.length < 3) {
      console.log("[Extract Facts] Not enough messages to extract facts");
      return new Response(
        JSON.stringify({ success: true, factsExtracted: 0, reason: "Not enough messages" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing facts to avoid duplicates
    const { data: existingFacts } = await supabase
      .from("client_memories")
      .select("content")
      .eq("client_id", clientId)
      .eq("is_active", true);

    const existingFactsText = existingFacts?.map(f => f.content).join("\n") || "";

    // Build conversation text
    const conversationText = messages
      .filter(m => m.content)
      .map(m => `${m.is_from_me ? "Assistente" : "Cliente"}: ${m.content}`)
      .join("\n");

    // Create prompt for fact extraction
    const extractionPrompt = `Analise a seguinte conversa e extraia FATOS IMPORTANTES sobre o cliente que devem ser lembrados para futuras interações.

CONVERSA:
${conversationText}

FATOS JÁ CONHECIDOS (não repetir):
${existingFactsText || "Nenhum"}

Extraia apenas fatos novos e relevantes como:
- Preferências do cliente
- Preocupações ou problemas mencionados
- Questões jurídicas específicas
- Informações pessoais relevantes (profissão, família, etc.)
- Prazos importantes mencionados
- Expectativas do cliente

Responda APENAS com um JSON válido no seguinte formato:
{
  "facts": [
    {
      "type": "preference|concern|legal_issue|personal|deadline|other",
      "content": "descrição do fato em uma frase",
      "importance": 1-10
    }
  ]
}

Se não houver fatos novos importantes, retorne: {"facts": []}`;

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: extractionPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Extract Facts] AI error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to extract facts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let facts: Array<{ type: string; content: string; importance: number }> = [];
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        facts = parsed.facts || [];
      }
    } catch (parseError) {
      console.error("[Extract Facts] Failed to parse AI response:", parseError);
      return new Response(
        JSON.stringify({ success: true, factsExtracted: 0, reason: "Parse error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert new facts
    if (facts.length > 0) {
      const factsToInsert = facts.map(fact => ({
        client_id: clientId,
        law_firm_id: lawFirmId,
        fact_type: fact.type || "other",
        content: fact.content,
        importance: Math.min(10, Math.max(1, fact.importance || 5)),
        source_conversation_id: conversationId,
      }));

      const { error: insertError } = await supabase
        .from("client_memories")
        .insert(factsToInsert);

      if (insertError) {
        console.error("[Extract Facts] Insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save facts" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[Extract Facts] Saved ${facts.length} new facts for client ${clientId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        factsExtracted: facts.length,
        facts: facts.map(f => f.content),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Extract Facts] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
