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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Aceita tanto GET com query params quanto POST com body
    let automationId: string | null = null;
    let query: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      automationId = url.searchParams.get("automation_id");
      query = url.searchParams.get("query");
    } else if (req.method === "POST") {
      const body = await req.json();
      automationId = body.automation_id || body.automationId;
      query = body.query || body.texto || body.message;
    }

    if (!automationId) {
      return new Response(
        JSON.stringify({ error: "automation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Busca os itens de conhecimento vinculados ao agente
    const { data: agentKnowledge, error: agentError } = await supabase
      .from("agent_knowledge")
      .select(`
        knowledge_item_id,
        knowledge_items (
          id,
          title,
          content,
          category,
          item_type,
          file_url,
          file_name,
          file_type
        )
      `)
      .eq("automation_id", automationId);

    if (agentError) {
      console.error("Error fetching agent knowledge:", agentError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch knowledge items" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Formata os itens de conhecimento
    const knowledgeItems = agentKnowledge
      ?.map((ak: any) => ak.knowledge_items)
      .filter(Boolean)
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        category: item.category,
        type: item.item_type,
        file_url: item.file_url,
        file_name: item.file_name,
      }));

    // Monta o contexto para a IA
    let context = "";
    if (knowledgeItems && knowledgeItems.length > 0) {
      context = knowledgeItems
        .map((item: any) => {
          let itemContext = `### ${item.title} (${item.category})\n`;
          if (item.content) {
            itemContext += item.content;
          }
          if (item.file_url) {
            itemContext += `\n[Documento: ${item.file_name}](${item.file_url})`;
          }
          return itemContext;
        })
        .join("\n\n---\n\n");
    }

    return new Response(
      JSON.stringify({
        success: true,
        automation_id: automationId,
        query: query,
        items_count: knowledgeItems?.length || 0,
        items: knowledgeItems || [],
        context: context,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-agent-knowledge:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
