import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvolutionHealthResult {
  status: "online" | "unstable" | "offline";
  latency_ms: number | null;
  message: string;
  checked_at: string;
  instances_summary?: {
    total: number;
    connected: number;
    disconnected: number;
    connecting: number;
    error: number;
  };
}

const EVOLUTION_TIMEOUT_MS = 10000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = EVOLUTION_TIMEOUT_MS
): Promise<{ response: Response | null; latency: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const startTime = Date.now();

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const latency = Date.now() - startTime;
    return { response, latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    if (error === "timeout" || error?.name === "AbortError") {
      return { response: null, latency, error: "timeout" };
    }
    return { response: null, latency, error: error.message || "unknown error" };
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the authorization header to identify the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Get user from token
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw new Error("Invalid authorization token");
    }

    // Check if user is admin
    const { data: adminRole } = await supabaseClient.rpc("is_admin", {
      _user_id: user.id,
    });

    if (!adminRole) {
      throw new Error("Access denied. Admin role required.");
    }

    // Get Evolution API URL from system settings or env
    const evolutionBaseUrl = Deno.env.get("EVOLUTION_BASE_URL");
    const evolutionApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");

    if (!evolutionBaseUrl) {
      return new Response(
        JSON.stringify({
          success: true,
          health: {
            status: "offline",
            latency_ms: null,
            message: "Evolution API URL não configurada",
            checked_at: new Date().toISOString(),
          } as EvolutionHealthResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test Evolution API health
    const healthUrl = `${evolutionBaseUrl.replace(/\/+$/, "")}/instance/fetchInstances`;
    const { response, latency, error } = await fetchWithTimeout(healthUrl, {
      method: "GET",
      headers: {
        apikey: evolutionApiKey || "",
        "Content-Type": "application/json",
      },
    });

    let healthStatus: EvolutionHealthResult["status"] = "offline";
    let message = "";

    if (error === "timeout") {
      healthStatus = "offline";
      message = "Evolution API não respondeu (timeout)";
    } else if (error) {
      healthStatus = "offline";
      message = `Erro de conexão: ${error}`;
    } else if (response) {
      if (response.ok) {
        if (latency > 3000) {
          healthStatus = "unstable";
          message = `API respondendo com latência elevada (${latency}ms)`;
        } else {
          healthStatus = "online";
          message = "API respondendo normalmente";
        }
      } else if (response.status === 401 || response.status === 403) {
        healthStatus = "unstable";
        message = "API respondendo, mas com erro de autenticação";
      } else if (response.status >= 500) {
        healthStatus = "offline";
        message = `Erro interno da API (${response.status})`;
      } else {
        healthStatus = "unstable";
        message = `API retornou status ${response.status}`;
      }
    }

    // Get instances summary from database
    const { data: instances } = await supabaseClient
      .from("whatsapp_instances")
      .select("status");

    const instancesSummary = {
      total: instances?.length || 0,
      connected: instances?.filter((i) => i.status === "connected").length || 0,
      disconnected:
        instances?.filter((i) => i.status === "disconnected").length || 0,
      connecting:
        instances?.filter(
          (i) => i.status === "connecting" || i.status === "awaiting_qr"
        ).length || 0,
      error: instances?.filter((i) => i.status === "error").length || 0,
    };

    const healthResult: EvolutionHealthResult = {
      status: healthStatus,
      latency_ms: latency,
      message,
      checked_at: new Date().toISOString(),
      instances_summary: instancesSummary,
    };

    console.log("[Evolution Health] Check result:", healthResult);

    return new Response(
      JSON.stringify({
        success: true,
        health: healthResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Evolution Health] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
