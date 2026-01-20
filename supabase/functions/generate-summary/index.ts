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

    // Create Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // ========================================
    // SECURITY: Validate authentication
    // ========================================
    const authHeader = req.headers.get("authorization");
    
    if (!authHeader) {
      console.error("[generate-summary] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Validate the token and get the user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error("[generate-summary] Invalid token:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Use service role for database queries
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================
    // SECURITY: Get user's law_firm_id
    // ========================================
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.law_firm_id) {
      console.error("[generate-summary] User has no associated law_firm:", profileError?.message);
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userLawFirmId = profile.law_firm_id;

    // ========================================
    // SECURITY: Validate conversation belongs to user's tenant
    // ========================================
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, law_firm_id, contact_name, contact_phone")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.warn(`[generate-summary] Conversation ${conversationId} not found`);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (conversation.law_firm_id !== userLawFirmId) {
      // IDOR attempt detected - log and deny
      console.warn(`[generate-summary] IDOR ATTEMPT: User ${userId} (tenant ${userLawFirmId}) tried to access conversation ${conversationId} (tenant ${conversation.law_firm_id})`);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // SECURE QUERY: Fetch messages with tenant validation
    // ========================================
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

    console.log(`[generate-summary] User ${userId} generating summary for conversation ${conversationId} with ${messages.length} messages`);

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

    console.log(`[generate-summary] Summary generated successfully for conversation ${conversationId}`);

    // Save the summary to the conversation (already validated as belonging to user's tenant)
    await supabase
      .from("conversations")
      .update({ 
        ai_summary: summary,
        last_summarized_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("law_firm_id", userLawFirmId); // Extra protection

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
