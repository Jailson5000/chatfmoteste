import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();
    
    if (!conversationId) {
      throw new Error("conversationId is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch conversation messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("content, is_from_me, sender_type, created_at, message_type")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      throw new Error("Failed to fetch messages");
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ summary: "Não há mensagens para resumir nesta conversa." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("contact_name, contact_phone")
      .eq("id", conversationId)
      .single();

    if (convError) {
      console.error("Error fetching conversation:", convError);
    }

    // Format messages for the AI
    const formattedMessages = messages
      .filter(m => m.message_type === "text" && m.content)
      .map(m => {
        const sender = m.is_from_me 
          ? (m.sender_type === "ai" ? "IA" : "Atendente") 
          : "Cliente";
        return `${sender}: ${m.content}`;
      })
      .join("\n");

    const contactInfo = conversation?.contact_name || conversation?.contact_phone || "Cliente";

    const systemPrompt = `Você é um assistente especializado em resumir conversas de atendimento jurídico.
Gere um resumo conciso e estruturado da conversa, incluindo:
- Assunto principal da conversa
- Principais pontos discutidos
- Decisões ou acordos feitos
- Próximos passos (se houver)
- Status atual do atendimento

Seja objetivo e use bullet points quando apropriado. O resumo deve ter no máximo 200 palavras.`;

    const userPrompt = `Resuma a seguinte conversa com ${contactInfo}:

${formattedMessages}`;

    console.log(`Generating summary for conversation ${conversationId} with ${messages.length} messages`);

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("Failed to generate summary");
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;

    if (!summary) {
      throw new Error("No summary generated");
    }

    console.log("Summary generated successfully");

    // Optionally save the summary to the conversation
    await supabase
      .from("conversations")
      .update({ ai_summary: summary })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-summary:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
