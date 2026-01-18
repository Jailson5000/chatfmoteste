import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCorsResponse, handleCorsPreflightRequest } from "../_shared/cors.ts";

/**
 * widget-messages
 * Endpoint público (com validação via widgetKey) para o widget buscar mensagens
 * sem depender de RLS no endpoint REST.
 *
 * GET ?widgetKey=...&conversationId=...&after=ISO_DATE(optional)
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "GET") {
      return createCorsResponse({ error: "Method not allowed" }, 405, req);
    }

    const url = new URL(req.url);
    const widgetKey = url.searchParams.get("widgetKey") || "";
    const conversationId = url.searchParams.get("conversationId") || "";
    const after = url.searchParams.get("after");

    if (!widgetKey || !conversationId) {
      return createCorsResponse({ error: "Missing widgetKey or conversationId" }, 400, req);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate widgetKey and get tenant
    const { data: integration } = await supabase
      .from("tray_chat_integrations")
      .select("law_firm_id, is_active")
      .eq("widget_key", widgetKey)
      .eq("is_active", true)
      .maybeSingle();

    if (!integration?.law_firm_id) {
      return createCorsResponse({ error: "Widget not found or inactive" }, 404, req);
    }

    // Validate conversation belongs to this tenant and is a widget conversation
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, law_firm_id, origin")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conv || conv.law_firm_id !== integration.law_firm_id || conv.origin !== "WIDGET") {
      return createCorsResponse({ error: "Conversation not found" }, 404, req);
    }

    let query = supabase
      .from("messages")
      .select("id, content, sender_type, is_from_me, created_at, message_type")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (after) {
      const d = new Date(after);
      if (!isNaN(d.getTime())) {
        query = query.gt("created_at", d.toISOString());
      }
    }

    const { data: messages, error } = await query;
    if (error) {
      console.error("[widget-messages] Query error:", error);
      return createCorsResponse({ error: "Failed to fetch messages" }, 500, req);
    }

    return createCorsResponse({ messages: messages || [] }, 200, req);
  } catch (err) {
    console.error("[widget-messages] Error:", err);
    return createCorsResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
      req
    );
  }
});
