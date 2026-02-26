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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // ========================================
    // SECURITY: Validate authentication
    // ========================================
    const authHeader = req.headers.get("authorization");
    
    if (!authHeader) {
      console.error("[get-agent-knowledge] Missing authorization header");
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
      console.error("[get-agent-knowledge] Invalid token:", userError?.message);
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
      console.error("[get-agent-knowledge] User has no associated law_firm:", profileError?.message);
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userLawFirmId = profile.law_firm_id;

    // Parse request parameters (GET or POST)
    let automationId: string | null = null;
    let query: string | null = null;
    let bustCache = false;

    if (req.method === "GET") {
      const url = new URL(req.url);
      automationId = url.searchParams.get("automation_id");
      query = url.searchParams.get("query");
      bustCache = url.searchParams.get("bust_cache") === "true";
    } else if (req.method === "POST") {
      const body = await req.json();
      automationId = body.automation_id || body.automationId;
      query = body.query || body.texto || body.message;
      bustCache = body.bust_cache === true;
    }

    if (!automationId) {
      return new Response(
        JSON.stringify({ error: "automation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(automationId)) {
      return new Response(
        JSON.stringify({ error: "Invalid automation_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // SECURITY: Validate automation belongs to user's tenant
    // ========================================
    const { data: automation, error: automationError } = await supabase
      .from("automations")
      .select("id, law_firm_id")
      .eq("id", automationId)
      .single();

    if (automationError || !automation) {
      // Generic error - don't reveal if automation exists in another tenant
      console.warn(`[get-agent-knowledge] Automation ${automationId} not found or access denied for user ${userId}`);
      return new Response(
        JSON.stringify({ error: "Automation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (automation.law_firm_id !== userLawFirmId) {
      // IDOR attempt detected - log and deny
      console.warn(`[get-agent-knowledge] IDOR ATTEMPT: User ${userId} (tenant ${userLawFirmId}) tried to access automation ${automationId} (tenant ${automation.law_firm_id})`);
      return new Response(
        JSON.stringify({ error: "Automation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // SECURE QUERY: Fetch knowledge with tenant validation
    // ========================================
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
      .eq("automation_id", automationId)
      .eq("law_firm_id", userLawFirmId); // Double protection

    if (agentError) {
      const errorRef = crypto.randomUUID().slice(0, 8);
      console.error(`[${errorRef}] Error fetching agent knowledge:`, agentError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch knowledge items", ref: errorRef }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response (unchanged from original)
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

    // Build context for AI (unchanged from original)
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

    console.log(`[get-agent-knowledge] User ${userId} fetched ${knowledgeItems?.length || 0} items for automation ${automationId}`);

    // Response format unchanged
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
    const errorRef = crypto.randomUUID().slice(0, 8);
    console.error(`[${errorRef}] Error in get-agent-knowledge:`, error);
    return new Response(
      JSON.stringify({ error: "An error occurred", ref: errorRef }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
