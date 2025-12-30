import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatRequest {
  conversationId: string;
  message: string;
  automationId?: string;
  context?: {
    clientName?: string;
    clientPhone?: string;
    currentStatus?: string;
    previousMessages?: Array<{ role: string; content: string }>;
    clientId?: string;
    lawFirmId?: string;
  };
}

// Helper to fetch agent knowledge base items
async function getAgentKnowledge(
  supabase: any,
  automationId: string
): Promise<string> {
  const { data: agentKnowledge, error } = await supabase
    .from("agent_knowledge")
    .select(`
      knowledge_item_id,
      knowledge_items (
        id,
        title,
        content,
        category,
        item_type
      )
    `)
    .eq("automation_id", automationId);

  if (error || !agentKnowledge || agentKnowledge.length === 0) {
    console.log(`[AI Chat] No knowledge items found for automation ${automationId}`);
    return "";
  }

  const knowledgeItems = agentKnowledge
    .map((ak: any) => ak.knowledge_items)
    .filter(Boolean);

  if (knowledgeItems.length === 0) {
    return "";
  }

  const knowledgeText = knowledgeItems
    .map((item: any) => `### ${item.title} (${item.category})\n${item.content || ""}`)
    .join("\n\n");

  console.log(`[AI Chat] Loaded ${knowledgeItems.length} knowledge items for automation ${automationId}`);

  return `\n\n📚 BASE DE CONHECIMENTO (use estas informações para responder):\n${knowledgeText}`;
}

// Helper to fetch client memories
async function getClientMemories(
  supabase: any,
  clientId: string
): Promise<string> {
  const { data: memories } = await supabase
    .from("client_memories")
    .select("fact_type, content, importance")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("importance", { ascending: false })
    .limit(15);

  if (!memories || memories.length === 0) {
    return "";
  }

  const memoryText = (memories as any[])
    .map((m: any) => `- [${m.fact_type}] ${m.content}`)
    .join("\n");

  return `\n\n📝 MEMÓRIA DO CLIENTE (fatos importantes já conhecidos):\n${memoryText}`;
}

// Helper to get conversation context for long conversations
async function getConversationContext(
  supabase: any,
  conversationId: string,
  maxMessages: number = 10
): Promise<{ messages: Array<{ role: string; content: string }>; needsSummary: boolean }> {
  // Get total message count
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const totalMessages = count || 0;
  const needsSummary = totalMessages > 20;

  // Get recent messages
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("content, is_from_me, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(maxMessages);

  if (!recentMessages || recentMessages.length === 0) {
    return { messages: [], needsSummary: false };
  }

  // Convert to chat format (reverse to chronological order)
  const messages = (recentMessages as any[])
    .reverse()
    .filter((m: any) => m.content)
    .map((m: any) => ({
      role: m.is_from_me ? "assistant" : "user",
      content: m.content!
    }));

  return { messages, needsSummary };
}

// Generate and save conversation summary
async function generateAndSaveSummary(
  supabase: any,
  conversationId: string,
  LOVABLE_API_KEY: string
): Promise<string | null> {
  // Check if we recently summarized
  const { data: conversation } = await supabase
    .from("conversations")
    .select("ai_summary, last_summarized_at, summary_message_count")
    .eq("id", conversationId)
    .single();

  const { count: currentCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const conv = conversation as any;

  // If we have a recent summary and not many new messages, use existing
  if (
    conv?.ai_summary &&
    conv?.summary_message_count &&
    currentCount &&
    currentCount - conv.summary_message_count < 15
  ) {
    return conv.ai_summary;
  }

  // Get all messages for summary
  const { data: allMessages } = await supabase
    .from("messages")
    .select("content, is_from_me, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!allMessages || allMessages.length < 10) {
    return null;
  }

  // Build conversation text for summarization
  const conversationText = (allMessages as any[])
    .filter((m: any) => m.content)
    .map((m: any) => `${m.is_from_me ? "Assistente" : "Cliente"}: ${m.content}`)
    .join("\n");

  const summaryPrompt = `Resuma esta conversa jurídica em 3-4 frases, destacando:
- O problema principal do cliente
- Informações importantes coletadas
- Status atual do atendimento
- Próximos passos acordados (se houver)

CONVERSA:
${conversationText}

Responda apenas com o resumo, sem formatação especial.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: summaryPrompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("[AI Chat] Failed to generate summary");
      return conv?.ai_summary || null;
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;

    if (summary) {
      // Save summary to conversation
      await supabase
        .from("conversations")
        .update({
          ai_summary: summary,
          last_summarized_at: new Date().toISOString(),
          summary_message_count: currentCount,
        })
        .eq("id", conversationId);

      console.log(`[AI Chat] Generated new summary for conversation ${conversationId}`);
      return summary;
    }

    return conv?.ai_summary || null;
  } catch (error) {
    console.error("[AI Chat] Summary generation error:", error);
    return conv?.ai_summary || null;
  }
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // CRITICAL: Agent prompt is the SINGLE SOURCE OF TRUTH
    // No default/fallback prompts - must have automationId with valid prompt
    let systemPrompt: string | null = null;
    let temperature = 0.7;
    let automationName = "";
    let knowledgeText = "";

    // automationId is REQUIRED for proper agent behavior
    if (!automationId) {
      console.error("[AI Chat] CRITICAL: automationId is required for proper AI behavior");
      return new Response(
        JSON.stringify({ error: "automationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent configuration - the ONLY source of behavior
    const { data: automation, error: automationError } = await supabase
      .from("automations")
      .select("ai_prompt, ai_temperature, name, law_firm_id")
      .eq("id", automationId)
      .eq("is_active", true)
      .single();

    if (automationError || !automation) {
      console.error("[AI Chat] Agent not found or inactive", { automationId, error: automationError });
      return new Response(
        JSON.stringify({ error: "Agent not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use ONLY the agent's configured prompt
    systemPrompt = (automation as any).ai_prompt;
    if ((automation as any).ai_temperature !== null) {
      temperature = (automation as any).ai_temperature;
    }
    automationName = (automation as any).name;

    if (!systemPrompt) {
      console.error("[AI Chat] Agent has no prompt configured", { automationId });
      return new Response(
        JSON.stringify({ error: "Agent has no prompt configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[AI Chat] Using EXCLUSIVE prompt from agent: ${automationName}`);

    // ONLY load knowledge bases that are EXPLICITLY LINKED to this agent
    // This ensures complete tenant and agent isolation
    knowledgeText = await getAgentKnowledge(supabase, automationId);
    if (knowledgeText) {
      console.log(`[AI Chat] Loaded knowledge base ONLY for agent ${automationId}`);
    } else {
      console.log(`[AI Chat] No knowledge base linked to agent ${automationId}`);
    }

    // Build messages array - agent prompt is the ONLY system instruction
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    // Add behavioral instruction for human-like responses (appended, not replacing)
    messages.push({ 
      role: "system", 
      content: `REGRA CRÍTICA DE COMUNICAÇÃO:
- Responda como uma pessoa real em atendimento
- Envie mensagens CURTAS e OBJETIVAS (máximo 2-3 frases por vez)
- Faça UMA pergunta ou informação por mensagem
- NÃO envie textos longos ou explicações extensas
- Use linguagem natural e profissional
- Aguarde a resposta do cliente antes de continuar` 
    });

    // Add knowledge base as context (if linked to this agent)
    if (knowledgeText) {
      messages.push({ role: "system", content: knowledgeText });
    }

    // Add client memories if clientId is provided
    let clientMemoriesText = "";
    if (context?.clientId) {
      clientMemoriesText = await getClientMemories(supabase, context.clientId);
    }

    // Get conversation context with potential summary
    const { messages: previousMessages, needsSummary } = await getConversationContext(
      supabase,
      conversationId
    );

    // If conversation is long, generate/use summary
    let summaryText = "";
    if (needsSummary) {
      const summary = await generateAndSaveSummary(supabase, conversationId, LOVABLE_API_KEY);
      if (summary) {
        summaryText = `\n\n📋 RESUMO DA CONVERSA ANTERIOR:\n${summary}`;
      }
    }

    // Add context about the client
    if (context?.clientName || context?.clientPhone || clientMemoriesText || summaryText) {
      const clientInfo = `Informações do cliente:
- Nome: ${context?.clientName || "Não informado"}
- Telefone: ${context?.clientPhone || "Não informado"}
- Status atual: ${context?.currentStatus || "Novo contato"}${clientMemoriesText}${summaryText}`;
      
      messages.push({ role: "system", content: clientInfo });
    }

    // Add previous messages for context
    if (previousMessages.length > 0) {
      messages.push(...previousMessages);
    } else if (context?.previousMessages && context.previousMessages.length > 0) {
      const recentMessages = context.previousMessages.slice(-10);
      messages.push(...recentMessages);
    }

    // Add the current message
    messages.push({ role: "user", content: message });

    console.log(`[AI Chat] Processing message for conversation ${conversationId}`);
    console.log(`[AI Chat] Message count: ${messages.length}, Temperature: ${temperature}, HasKnowledge: ${!!knowledgeText}, HasMemories: ${!!clientMemoriesText}, HasSummary: ${!!summaryText}`);

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

    // Trigger fact extraction in background if we have client info
    if (context?.clientId && context?.lawFirmId) {
      // Fire and forget - don't await
      fetch(`${supabaseUrl}/functions/v1/extract-client-facts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          conversationId,
          clientId: context.clientId,
          lawFirmId: context.lawFirmId,
        }),
      }).catch(err => console.error("[AI Chat] Failed to trigger fact extraction:", err));
    }

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
