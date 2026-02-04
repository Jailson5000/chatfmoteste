import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIP, rateLimitResponse } from "../_shared/rate-limit.ts";

/**
 * widget-messages
 * Endpoint público (com validação via widgetKey) para o widget buscar mensagens
 * sem depender de RLS no endpoint REST.
 *
 * GET ?widgetKey=...&conversationId=...&after=ISO_DATE(optional)
 */

// CORS headers - allow any origin since widget can be embedded anywhere
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Rate limit: 100 req/min per IP
  const clientIP = getClientIP(req);
  const { allowed, retryAfter } = checkRateLimit(clientIP, { maxRequests: 100, windowMs: 60000 });
  if (!allowed) {
    console.warn(`[widget-messages] Rate limit exceeded: ${clientIP}`);
    return rateLimitResponse(retryAfter, corsHeaders);
  }

  try {
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const widgetKey = url.searchParams.get("widgetKey") || "";
    const conversationId = url.searchParams.get("conversationId") || "";
    const after = url.searchParams.get("after");

    console.log("[widget-messages] Request:", { widgetKey: widgetKey.slice(0, 8) + "...", conversationId, after });

    if (!widgetKey || !conversationId) {
      return new Response(
        JSON.stringify({ error: "Missing widgetKey or conversationId" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate widgetKey and get tenant
    const { data: integration, error: integrationError } = await supabase
      .from("tray_chat_integrations")
      .select("law_firm_id, is_active")
      .eq("widget_key", widgetKey)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError) {
      console.error("[widget-messages] Integration query error:", integrationError);
    }

    if (!integration?.law_firm_id) {
      console.warn("[widget-messages] Widget not found or inactive:", widgetKey.slice(0, 8));
      return new Response(
        JSON.stringify({ error: "Widget not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate conversation belongs to this tenant and is a widget conversation
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, law_firm_id, origin")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) {
      console.error("[widget-messages] Conversation query error:", convError);
    }

    if (!conv) {
      console.warn("[widget-messages] Conversation not found:", conversationId);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (conv.law_firm_id !== integration.law_firm_id) {
      console.warn("[widget-messages] Tenant mismatch - conversation belongs to different tenant");
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (conv.origin !== "WIDGET") {
      console.warn("[widget-messages] Conversation is not a widget conversation:", conv.origin);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query for messages - include media fields for audio/image/video/document
    let query = supabase
      .from("messages")
      .select("id, content, sender_type, is_from_me, created_at, message_type, media_url, media_mime_type")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (after) {
      const d = new Date(after);
      if (!isNaN(d.getTime())) {
        query = query.gt("created_at", d.toISOString());
      }
    }

    const { data: messages, error: msgError } = await query;
    if (msgError) {
      console.error("[widget-messages] Messages query error:", msgError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch messages" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("[widget-messages] Returning", messages?.length || 0, "messages");

    return new Response(
      JSON.stringify({ messages: messages || [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error("[widget-messages] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
