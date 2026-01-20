import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractFactsRequest {
  conversationId: string;
  clientId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, clientId }: ExtractFactsRequest = await req.json();

    if (!conversationId || !clientId) {
      return new Response(
        JSON.stringify({ error: "conversationId and clientId are required" }),
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ========================================
    // SECURITY: Validate authentication
    // ========================================
    const authHeader = req.headers.get("authorization");
    
    if (!authHeader) {
      console.error("[extract-client-facts] Missing authorization header");
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
      console.error("[extract-client-facts] Invalid token:", userError?.message);
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
      console.error("[extract-client-facts] User has no associated law_firm:", profileError?.message);
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userLawFirmId = profile.law_firm_id;

    // ========================================
    // SECURITY: Validate client belongs to user's tenant
    // ========================================
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, law_firm_id")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      console.warn(`[extract-client-facts] Client ${clientId} not found`);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (client.law_firm_id !== userLawFirmId) {
      // IDOR attempt detected - log and deny
      console.warn(`[extract-client-facts] IDOR ATTEMPT: User ${userId} (tenant ${userLawFirmId}) tried to access client ${clientId} (tenant ${client.law_firm_id})`);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // SECURITY: Validate conversation belongs to user's tenant
    // ========================================
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, law_firm_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.warn(`[extract-client-facts] Conversation ${conversationId} not found`);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (conversation.law_firm_id !== userLawFirmId) {
      // IDOR attempt detected - log and deny
      console.warn(`[extract-client-facts] IDOR ATTEMPT: User ${userId} (tenant ${userLawFirmId}) tried to access conversation ${conversationId} (tenant ${conversation.law_firm_id})`);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // SECURE QUERY: Fetch messages (conversation already validated)
    // ========================================
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("content, is_from_me, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (messagesError || !messages || messages.length < 3) {
      console.log("[extract-client-facts] Not enough messages to extract facts");
      return new Response(
        JSON.stringify({ success: true, factsExtracted: 0, reason: "Not enough messages" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing facts to avoid duplicates (tenant-scoped)
    const { data: existingFacts } = await supabase
      .from("client_memories")
      .select("content")
      .eq("client_id", clientId)
      .eq("law_firm_id", userLawFirmId) // Tenant isolation
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
      console.error("[extract-client-facts] AI error:", response.status, errorText);
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
      console.error("[extract-client-facts] Failed to parse AI response:", parseError);
      return new Response(
        JSON.stringify({ success: true, factsExtracted: 0, reason: "Parse error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert new facts (tenant-scoped)
    if (facts.length > 0) {
      const factsToInsert = facts.map(fact => ({
        client_id: clientId,
        law_firm_id: userLawFirmId, // Use validated tenant ID
        fact_type: fact.type || "other",
        content: fact.content,
        importance: Math.min(10, Math.max(1, fact.importance || 5)),
        source_conversation_id: conversationId,
      }));

      const { error: insertError } = await supabase
        .from("client_memories")
        .insert(factsToInsert);

      if (insertError) {
        console.error("[extract-client-facts] Insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save facts" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[extract-client-facts] User ${userId} saved ${facts.length} new facts for client ${clientId}`);
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
    console.error("[extract-client-facts] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
