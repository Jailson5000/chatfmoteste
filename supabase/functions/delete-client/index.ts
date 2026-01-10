import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCorsResponse, handleCorsPreflightRequest } from "../_shared/cors.ts";
import {
  validateRequestTenant,
  validateResourceBelongsToTenant,
} from "../_shared/tenant-validation.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return createCorsResponse({ error: "Missing authorization" }, 401, req);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return createCorsResponse({ error: "Invalid authorization token" }, 401, req);
    }

    const validation = await validateRequestTenant(supabase, req, user.id);
    if (!validation.allowed || !validation.userTenant) {
      return createCorsResponse({ error: validation.reason }, validation.statusCode, req);
    }

    const lawFirmId = validation.userTenant.lawFirmId;

    const body = await req.json().catch(() => ({}));
    const clientId = body?.clientId as string | undefined;

    if (!clientId) {
      return createCorsResponse({ error: "clientId is required" }, 400, req);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, law_firm_id")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      // Avoid enumeration
      return createCorsResponse({ error: "Not found" }, 404, req);
    }

    if (!validateResourceBelongsToTenant(client.law_firm_id, lawFirmId)) {
      return createCorsResponse({ error: "Not found" }, 404, req);
    }

    // Clean RESTRICT/NO ACTION FKs first
    const { error: googleLogsError } = await supabase
      .from("google_calendar_ai_logs")
      .update({ client_id: null })
      .eq("client_id", clientId);
    if (googleLogsError) throw googleLogsError;

    const { error: trayMapError } = await supabase
      .from("tray_customer_map")
      .delete()
      .eq("local_client_id", clientId);
    if (trayMapError) throw trayMapError;

    const { error: deleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("law_firm_id", lawFirmId);

    if (deleteError) throw deleteError;

    return createCorsResponse({ success: true }, 200, req);
  } catch (err) {
    console.error("[delete-client] Error:", err);
    return createCorsResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
      req
    );
  }
});
