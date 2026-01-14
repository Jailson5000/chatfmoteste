import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  extractSubdomainFromOrigin, 
  validateTenantAccess, 
  logTenantSecurityEvent 
} from "../_shared/tenant-validation.ts";
import { humanDelay, DELAY_CONFIG } from "../_shared/human-delay.ts";

// Production CORS configuration
const ALLOWED_ORIGINS = [
  'https://miauchat.com.br',
  'https://www.miauchat.com.br',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.includes('.lovableproject.com') ||
    origin.includes('.lovable.app') ||
    origin.endsWith('.miauchat.com.br')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// Legacy corsHeaders for backwards compatibility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EvolutionAction =
  | "create_instance"
  | "get_qrcode"
  | "get_status"
  | "delete_instance"
  | "test_connection"
  | "configure_webhook"
  | "get_settings"
  | "set_settings"
  | "refresh_status"
  | "refresh_phone"
  | "fetch_phone"
  | "send_message"
  | "send_message_async"
  | "send_media"
  | "get_media"
  | "delete_message" // Delete message for everyone on WhatsApp
  // New centralized management endpoints
  | "global_create_instance"
  | "global_delete_instance"
  | "global_get_qrcode"
  | "global_get_status"
  | "global_configure_webhook"
  | "global_restart_instance"
  | "global_logout_instance"
  // N8N integration endpoints
  | "n8n_forward_message"
  | "n8n_get_conversation"
  | "n8n_send_reply";

interface EvolutionRequest {
  action: EvolutionAction;
  instanceName?: string;
  displayName?: string;
  apiUrl?: string;
  apiKey?: string;
  instanceId?: string;
  rejectCall?: boolean;
  msgCall?: string;
  // For send_message
  conversationId?: string;
  message?: string;
  remoteJid?: string;
  replyToMessageId?: string; // For DB linking (message.id)
  replyToWhatsAppMessageId?: string; // For WhatsApp quoted reply (whatsapp_message_id)
  // For send_media
  mediaType?: "image" | "audio" | "video" | "document";
  mediaBase64?: string;
  mediaUrl?: string;
  fileName?: string;
  caption?: string;
  mimeType?: string; // Real MIME type of the file (e.g., "image/png", "application/pdf")
  // For get_media
  whatsappMessageId?: string;
}

// Helper to normalize URL (remove trailing slashes and /manager suffix)
function normalizeUrl(url: string): string {
  let normalized = url.replace(/\/+$/, "");
  normalized = normalized.replace(/\/manager$/i, "");
  return normalized;
}

const DEFAULT_TIMEOUT_MS = 15000;
const SEND_MESSAGE_TIMEOUT_MS = 30000; // Longer timeout for sending messages

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error === "timeout" || error?.name === "AbortError") {
      throw new Error("timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeReadResponseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function simplifyEvolutionError(status: number, bodyText: string): string {
  const trimmed = (bodyText || "").trim();
  const looksHtml = /^<!DOCTYPE html>|^<html/i.test(trimmed);

  if (looksHtml && (status === 522 || status === 524)) {
    return `Evolution API não respondeu (erro ${status}). Verifique se o servidor está online e acessível externamente.`;
  }

  if (looksHtml) {
    return `Evolution API retornou erro ${status}.`;
  }

  if (!trimmed) {
    return `Evolution API retornou erro ${status}.`;
  }

  return `Evolution API retornou erro ${status}: ${trimmed.slice(0, 300)}`;
}

function buildWebhookConfig(webhookUrl: string) {
  // Evolution API v2 expects snake_case keys
  return {
    enabled: true,
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: true,
    events: [
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
    ],
  };
}

function extractPhoneFromJid(jid?: string | null): string | null {
  if (!jid) return null;
  const number = jid.split("@")[0];
  return number || null;
}

function extractRejectCallFlag(payload: any): boolean {
  const rejectCall =
    payload?.settings?.settings?.reject_call ??
    payload?.settings?.settings?.rejectCall ??
    payload?.settings?.reject_call ??
    payload?.settings?.rejectCall ??
    payload?.reject_call ??
    payload?.rejectCall;

  return Boolean(rejectCall);
}

// Get the webhook URL for this project
const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;

async function getInstanceById(supabaseClient: any, lawFirmId: string | null, instanceDbId: string, isGlobalAdmin: boolean = false) {
  // Global admins can access any instance (for audit/support purposes)
  let query = supabaseClient
    .from("whatsapp_instances")
    .select("*")
    .eq("id", instanceDbId);
  
  // Only filter by law_firm_id if not a global admin
  if (!isGlobalAdmin && lawFirmId) {
    query = query.eq("law_firm_id", lawFirmId);
  }
  
  const { data: instance, error } = await query.single();

  if (error || !instance) {
    console.error("[Evolution API] Instance not found:", error);
    throw new Error("Instance not found");
  }

  return instance;
}

// Extract phone from any payload (deep scan)
function extractPhoneFromPayload(payload: any): string | null {
  if (!payload) return null;

  // Evolution endpoints sometimes return arrays (e.g. fetchInstances)
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const phone = extractPhoneFromPayload(item);
      if (phone) return phone;
    }
    return null;
  }

  // Some responses wrap instances in an `instances` array
  if (Array.isArray(payload?.instances)) {
    return extractPhoneFromPayload(payload.instances);
  }

  const directCandidates = [
    // Common direct fields (Evolution v2.3.7 uses "ownerJid")
    payload?.ownerJid,
    payload?.owner,
    payload?.wuid,
    payload?.wid,
    payload?.jid,

    // Common nested wrappers (Evolution v2 often nests under `instance`)
    payload?.instance?.ownerJid,
    payload?.instance?.owner,
    payload?.instance?.wuid,
    payload?.instance?.wid,
    payload?.instance?.jid,

    // Sometimes there is a double nesting: { instance: { instance: {...} } }
    payload?.instance?.instance?.ownerJid,
    payload?.instance?.instance?.owner,
    payload?.instance?.instance?.wuid,
    payload?.instance?.instance?.jid,

    // Other previously supported candidates
    payload?.profile?.ownerJid,
    payload?.profile?.owner,
    payload?.profile?.id,
    payload?.me?.id,
    payload?.me?.jid,
    payload?.instance?.me?.id,
    payload?.instance?.me?.jid,
    payload?.data?.me?.id,
    payload?.state?.me?.id,
  ];

  for (const c of directCandidates) {
    if (typeof c === "string") {
      const phone = extractPhoneFromJid(c);
      if (phone && phone.length >= 10 && phone.length <= 15) return phone;
    }
  }

  return null;
}

async function fetchConnectedPhoneNumber(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<string | null> {
  const url = `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await safeReadResponseText(res);
    console.error("[Evolution API] fetchInstances failed:", res.status, text);
    return null;
  }

  const data = await res.json().catch(() => null);
  const candidates = Array.isArray(data) ? data : data?.instances ? data.instances : [data];

  const found =
    candidates?.find?.((i: any) => i?.instanceName === instanceName || i?.name === instanceName) ??
    candidates?.[0];

  const ownerJid = found?.owner || found?.instance?.owner || found?.profile?.owner || found?.profile?.id || null;
  return extractPhoneFromJid(ownerJid);
}

// Enhanced phone fetching that tries multiple endpoints
async function fetchPhoneNumberEnhanced(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{ phone: string | null; reason: string }> {
  const endpoints = [
    {
      name: "connectionState",
      url: `${apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    },
    {
      name: "fetchInstances",
      url: `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
    },
    {
      name: "connect",
      url: `${apiUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
    },
  ];

  const reasons: string[] = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`[Evolution API] Trying ${endpoint.name} for phone number...`);
      
      const res = await fetchWithTimeout(endpoint.url, {
        method: "GET",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
      }, 10000);

      if (!res.ok) {
        reasons.push(`${endpoint.name}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json().catch(() => null);
      
      // Enhanced logging to debug Evolution API response structure
      console.log(`[Evolution API] ${endpoint.name} response:`, JSON.stringify(data, null, 2).slice(0, 1000));
      
      const phone = extractPhoneFromPayload(data);
      
      if (phone) {
        console.log(`[Evolution API] Phone found via ${endpoint.name}: ${phone.slice(0,4)}***`);
        return { phone, reason: "success" };
      }
      
      reasons.push(`${endpoint.name}: sem número no payload`);
    } catch (error: any) {
      const reason = error?.message === "timeout" 
        ? `${endpoint.name}: timeout` 
        : `${endpoint.name}: ${error?.message || "erro"}`;
      reasons.push(reason);
    }
  }

  return { phone: null, reason: reasons.join("; ") };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get the authorization header to identify the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Get user from token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (authError || !user) {
      throw new Error("Invalid authorization token");
    }

    // Get user's law firm
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("law_firm_id, email")
      .eq("id", user.id)
      .single();

    // Check if user is a global admin (super_admin or admin)
    const { data: adminRole } = await supabaseClient
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    
    const isGlobalAdmin = !!adminRole;

    if (profileError || (!profile?.law_firm_id && !isGlobalAdmin)) {
      throw new Error("User not associated with a law firm");
    }

    // Get user's subdomain for tenant validation (skip for global admins)
    let userSubdomain: string | null = null;
    if (profile?.law_firm_id) {
      const { data: lawFirm } = await supabaseClient
        .from("law_firms")
        .select("subdomain")
        .eq("id", profile.law_firm_id)
        .single();
      userSubdomain = lawFirm?.subdomain || null;
    }

    const requestSubdomain = extractSubdomainFromOrigin(
      req.headers.get("origin"),
      req.headers.get("referer")
    );

    // Validate tenant access (subdomain matching) - SKIP for global admins
    if (!isGlobalAdmin) {
      const userTenant = {
        userId: user.id,
        email: profile?.email || "",
        lawFirmId: profile?.law_firm_id || null,
        subdomain: userSubdomain,
      };

      if (!validateTenantAccess(userTenant, requestSubdomain)) {
        await logTenantSecurityEvent(supabaseClient, {
          userId: user.id,
          email: profile?.email || "",
          action: "evolution_api_access_denied",
          expectedSubdomain: userSubdomain,
          requestSubdomain,
          ipAddress: req.headers.get("x-forwarded-for") || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
          blocked: true,
        });
        throw new Error("Tenant access denied");
      }
    }

    const lawFirmId = profile?.law_firm_id as string | null;
    const body: EvolutionRequest = await req.json();


    console.log(`[Evolution API] Action: ${body.action}, Instance: ${body.instanceName || body.instanceId}`);

    switch (body.action) {
      case "test_connection": {
        if (!body.apiUrl || !body.apiKey) {
          throw new Error("apiUrl and apiKey are required for test_connection");
        }

        const apiUrl = normalizeUrl(body.apiUrl);
        console.log(`[Evolution API] Testing connection to: ${apiUrl}`);

        const response = await fetchWithTimeout(`${apiUrl}/instance/fetchInstances`, {
          method: "GET",
          headers: {
            apikey: body.apiKey,
            "Content-Type": "application/json",
          },
        });

        console.log(`[Evolution API] Test connection response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await safeReadResponseText(response);
          console.error(`[Evolution API] Test connection failed:`, errorText);
          throw new Error(simplifyEvolutionError(response.status, errorText));
        }

        return new Response(JSON.stringify({ success: true, message: "Connection successful" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_instance": {
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        // If apiUrl/apiKey not provided, fetch from default Evolution API connection
        let apiUrl = body.apiUrl ? normalizeUrl(body.apiUrl) : "";
        let apiKey = body.apiKey || "";

        if (!apiUrl || !apiKey) {
          console.log("[Evolution API] No API credentials provided, fetching default connection");
          const { data: defaultConnection, error: connError } = await supabaseClient
            .from("evolution_api_connections")
            .select("api_url, api_key")
            .eq("is_active", true)
            .eq("is_default", true)
            .single();

          if (connError || !defaultConnection) {
            // Try to get any active connection if no default
            const { data: anyConnection, error: anyConnError } = await supabaseClient
              .from("evolution_api_connections")
              .select("api_url, api_key")
              .eq("is_active", true)
              .limit(1)
              .single();

            if (anyConnError || !anyConnection) {
              throw new Error("Nenhuma conexão Evolution API configurada. Configure uma conexão no painel de administração global.");
            }

            apiUrl = normalizeUrl(anyConnection.api_url);
            apiKey = anyConnection.api_key;
          } else {
            apiUrl = normalizeUrl(defaultConnection.api_url);
            apiKey = defaultConnection.api_key;
          }
          console.log(`[Evolution API] Using default connection: ${apiUrl}`);
        }
        console.log(`[Evolution API] Creating instance: ${body.instanceName} at ${apiUrl}`);

        const createResponse = await fetchWithTimeout(`${apiUrl}/instance/create`, {
          method: "POST",
          headers: {
            apikey: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instanceName: body.instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: buildWebhookConfig(WEBHOOK_URL),
          }),
        });

        console.log(`[Evolution API] Create instance response status: ${createResponse.status}`);

        if (!createResponse.ok) {
          const errorText = await safeReadResponseText(createResponse);
          console.error(`[Evolution API] Create instance failed:`, errorText);
          throw new Error(simplifyEvolutionError(createResponse.status, errorText));
        }

        const createData = await createResponse.json();
        console.log(`[Evolution API] Create instance response:`, JSON.stringify(createData));

        // Extract QR code from response - handle various formats
        let qrCode: string | null = null;
        if (createData.qrcode?.base64) {
          qrCode = createData.qrcode.base64;
        } else if (createData.qrcode && typeof createData.qrcode === "string") {
          qrCode = createData.qrcode;
        } else if (createData.base64) {
          qrCode = createData.base64;
        }

        const instanceId = createData.instance?.instanceId || createData.instanceId || body.instanceName;

        console.log(`[Evolution API] Saving instance to database. QR Code available: ${!!qrCode}`);

        // Save instance to database
        const { data: instance, error: insertError } = await supabaseClient
          .from("whatsapp_instances")
          .insert({
            law_firm_id: lawFirmId,
            instance_name: body.instanceName,
            display_name: body.displayName || body.instanceName,
            instance_id: instanceId,
            api_url: apiUrl,
            api_key: apiKey,
            status: qrCode ? "awaiting_qr" : "disconnected",
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[Evolution API] Database insert error:`, insertError);
          throw new Error(`Falha ao salvar a instância no sistema: ${insertError.message}`);
        }

        console.log(`[Evolution API] Instance saved with ID: ${instance.id}`);

        return new Response(
          JSON.stringify({
            success: true,
            instance,
            qrCode,
            message: qrCode ? "Instance created, scan QR code" : "Instance created",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "get_qrcode": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Getting QR code for instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        console.log(`[Evolution API] Fetching QR from: ${apiUrl}/instance/connect/${instance.instance_name}`);

        const qrResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
          method: "GET",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
        });

        console.log(`[Evolution API] Get QR code response status: ${qrResponse.status}`);

        if (!qrResponse.ok) {
          const errorText = await safeReadResponseText(qrResponse);
          console.error(`[Evolution API] Get QR code failed:`, errorText);
          throw new Error(simplifyEvolutionError(qrResponse.status, errorText));
        }

        const qrData = await qrResponse.json();
        console.log(`[Evolution API] QR code response:`, JSON.stringify(qrData));

        // Extract QR code - handle different response formats
        let qrCode: string | null = null;
        if (qrData.base64) {
          qrCode = qrData.base64;
        } else if (qrData.qrcode?.base64) {
          qrCode = qrData.qrcode.base64;
        } else if (qrData.qrcode && typeof qrData.qrcode === "string") {
          qrCode = qrData.qrcode;
        } else if (qrData.code) {
          qrCode = qrData.code;
        }

        const status = qrData.state || qrData.status || qrData.instance?.state || "unknown";
        console.log(`[Evolution API] QR Code extracted: ${!!qrCode}, Status: ${status}`);

        // Update instance status if connected
        if (status === "open" || status === "connected") {
          await supabaseClient
            .from("whatsapp_instances")
            .update({ status: "connected", updated_at: new Date().toISOString() })
            .eq("id", body.instanceId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode,
            status,
            message: qrCode ? "QR code retrieved" : "No QR code available",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "get_status": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Getting status for instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        const statusResponse = await fetchWithTimeout(`${apiUrl}/instance/connectionState/${instance.instance_name}`, {
          method: "GET",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
        });

        console.log(`[Evolution API] Get status response: ${statusResponse.status}`);

        if (!statusResponse.ok) {
          const errorText = await safeReadResponseText(statusResponse);
          console.error(`[Evolution API] Get status failed:`, errorText);

          // If instance doesn't exist on Evolution, mark as disconnected
          await supabaseClient
            .from("whatsapp_instances")
            .update({ status: "disconnected", updated_at: new Date().toISOString() })
            .eq("id", body.instanceId);

          return new Response(JSON.stringify({ success: true, status: "disconnected", instance }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const statusData = await statusResponse.json();
        console.log(`[Evolution API] Status response:`, JSON.stringify(statusData));

        const state = statusData.state || statusData.instance?.state || "unknown";
        let dbStatus = "disconnected";

        if (state === "open" || state === "connected") {
          dbStatus = "connected";
        } else if (state === "connecting" || state === "qr") {
          dbStatus = "connecting";
        }

        // Fetch and store phone number when connected using enhanced method
        let phoneNumberToSave: string | null = null;
        if (dbStatus === "connected" && !instance.phone_number && instance.api_key) {
          try {
            const result = await fetchPhoneNumberEnhanced(apiUrl, instance.api_key, instance.instance_name);
            phoneNumberToSave = result.phone;
            console.log(`[Evolution API] Phone fetch (get_status): ${phoneNumberToSave ? `found ${phoneNumberToSave.slice(0,4)}***` : result.reason}`);
          } catch (e) {
            console.log("[Evolution API] Failed to fetch phone number (non-fatal):", e);
          }
        }

        const updatePayload: Record<string, unknown> = {
          status: dbStatus,
          updated_at: new Date().toISOString(),
        };
        if (phoneNumberToSave) updatePayload.phone_number = phoneNumberToSave;

        console.log(`[Evolution API] Updating instance ${body.instanceId} to status: ${dbStatus}`);

        const { data: updatedInstance, error: updateError } = await supabaseClient
          .from("whatsapp_instances")
          .update(updatePayload)
          .eq("id", body.instanceId)
          .select()
          .single();

        if (updateError) {
          console.error(`[Evolution API] Failed to update instance status:`, updateError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            status: dbStatus,
            evolutionState: state,
            instance: updatedInstance,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "delete_instance": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Deleting instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        // Delete from Evolution API (best effort)
        try {
          const deleteResponse = await fetchWithTimeout(`${apiUrl}/instance/delete/${instance.instance_name}`, {
            method: "DELETE",
            headers: {
              apikey: instance.api_key || "",
              "Content-Type": "application/json",
            },
          });
          console.log(`[Evolution API] Evolution delete response: ${deleteResponse.status}`);
        } catch (e) {
          console.log(`[Evolution API] Evolution delete failed (non-fatal):`, e);
        }

        // Delete from database
        const { error: deleteError } = await supabaseClient
          .from("whatsapp_instances")
          .delete()
          .eq("id", body.instanceId)
          .eq("law_firm_id", lawFirmId);

        if (deleteError) {
          throw new Error(`Failed to delete instance: ${deleteError.message}`);
        }

        console.log(`[Evolution API] Instance deleted successfully`);

        return new Response(JSON.stringify({ success: true, message: "Instance deleted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "configure_webhook": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Configuring webhook for instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        const webhookResponse = await fetchWithTimeout(`${apiUrl}/webhook/set/${instance.instance_name}`, {
          method: "POST",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
        });

        console.log(`[Evolution API] Configure webhook response: ${webhookResponse.status}`);

        if (!webhookResponse.ok) {
          const errorText = await safeReadResponseText(webhookResponse);
          console.error(`[Evolution API] Configure webhook failed:`, errorText);
          throw new Error(simplifyEvolutionError(webhookResponse.status, errorText));
        }

        const webhookData = await webhookResponse.json().catch(() => null);
        console.log(`[Evolution API] Webhook configured:`, JSON.stringify(webhookData));

        return new Response(JSON.stringify({ success: true, message: "Webhook configured successfully" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_settings": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        const settingsResponse = await fetchWithTimeout(`${apiUrl}/settings/find/${instance.instance_name}`, {
          method: "GET",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
        });

        if (!settingsResponse.ok) {
          const errorText = await safeReadResponseText(settingsResponse);
          console.error(`[Evolution API] Get settings failed:`, errorText);
          throw new Error(simplifyEvolutionError(settingsResponse.status, errorText));
        }

        const settingsData = await settingsResponse.json();
        const rejectCall = extractRejectCallFlag(settingsData);

        return new Response(JSON.stringify({ success: true, settings: { rejectCall } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "set_settings": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }
        if (typeof body.rejectCall !== "boolean") {
          throw new Error("rejectCall (boolean) is required");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        // Evolution API v2 requires all these fields
        const settingsPayload = {
          rejectCall: body.rejectCall,
          msgCall: body.msgCall || "",
          groupsIgnore: true,
          alwaysOnline: false,
          readMessages: false,
          readStatus: false,
          syncFullHistory: false,
        };

        const setResponse = await fetchWithTimeout(`${apiUrl}/settings/set/${instance.instance_name}`, {
          method: "POST",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settingsPayload),
        });

        if (!setResponse.ok) {
          const errorText = await safeReadResponseText(setResponse);
          console.error(`[Evolution API] Set settings failed:`, errorText);
          throw new Error(simplifyEvolutionError(setResponse.status, errorText));
        }

        const setData = await setResponse.json().catch(() => null);
        console.log(`[Evolution API] Settings updated:`, JSON.stringify(setData));

        return new Response(JSON.stringify({ success: true, settings: { rejectCall: body.rejectCall } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "refresh_status": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Refreshing status for instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        const statusResponse = await fetchWithTimeout(`${apiUrl}/instance/connectionState/${instance.instance_name}`, {
          method: "GET",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
        });

        let dbStatus = "disconnected";
        let evolutionState = "unknown";

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          evolutionState = statusData.state || statusData.instance?.state || "unknown";
          
          if (evolutionState === "open" || evolutionState === "connected") {
            dbStatus = "connected";
          } else if (evolutionState === "connecting" || evolutionState === "qr") {
            dbStatus = "connecting";
          }
        }

        const { data: updatedInstance } = await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: dbStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.instanceId)
          .select()
          .single();

        console.log(`[Evolution API] Status refreshed: ${dbStatus}`);

        return new Response(
          JSON.stringify({
            success: true,
            status: dbStatus,
            evolutionState,
            instance: updatedInstance,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "refresh_phone": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Refreshing phone number for instance: ${body.instanceId}`);

        // Use isGlobalAdmin to allow access to any instance
        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId, isGlobalAdmin);
        const apiUrl = normalizeUrl(instance.api_url);

        // Use enhanced phone fetching that tries multiple endpoints
        const result = await fetchPhoneNumberEnhanced(apiUrl, instance.api_key || "", instance.instance_name);
        const phoneNumber = result.phone;

        console.log(`[Evolution API] Phone fetch result: ${phoneNumber ? `found ${phoneNumber.slice(0,4)}***` : result.reason}`);

        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (phoneNumber) {
          updatePayload.phone_number = phoneNumber;
        }

        const { data: updatedInstance } = await supabaseClient
          .from("whatsapp_instances")
          .update(updatePayload)
          .eq("id", body.instanceId)
          .select()
          .single();

        console.log(`[Evolution API] Phone number refreshed: ${phoneNumber || "not found"}`);

        return new Response(
          JSON.stringify({
            success: true,
            phoneNumber,
            reason: phoneNumber ? undefined : result.reason,
            instance: updatedInstance,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Enhanced fetch_phone - tries multiple endpoints and returns reason if not found
      case "fetch_phone": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Fetching phone number (enhanced) for instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId, isGlobalAdmin);
        const apiUrl = normalizeUrl(instance.api_url);

        const result = await fetchPhoneNumberEnhanced(apiUrl, instance.api_key || "", instance.instance_name);

        if (result.phone) {
          // Update database with found phone number
          await supabaseClient
            .from("whatsapp_instances")
            .update({
              phone_number: result.phone,
              updated_at: new Date().toISOString(),
            })
            .eq("id", body.instanceId);
        }

        console.log(`[Evolution API] Phone fetch result: ${result.phone || "not found"} - ${result.reason}`);

        return new Response(
          JSON.stringify({
            success: !!result.phone,
            phone: result.phone,
            reason: result.phone ? undefined : result.reason,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // =========================
      // ASYNC SEND MESSAGE (<1s response) - uses background task
      // =========================
      case "send_message_async": {
        if (!body.conversationId && !body.remoteJid) {
          throw new Error("conversationId or remoteJid is required");
        }
        if (!body.message) {
          throw new Error("message is required");
        }

        const startTime = Date.now();
        console.log(`[Evolution API] ASYNC Sending message`, { conversationId: body.conversationId });

        let targetRemoteJid = body.remoteJid;
        let conversationId = body.conversationId;
        let instanceId = body.instanceId;

        // If we have a conversationId, get the remoteJid and instanceId from it
        if (conversationId && !targetRemoteJid) {
          const { data: conversation, error: convError } = await supabaseClient
            .from("conversations")
            .select("remote_jid, whatsapp_instance_id")
            .eq("id", conversationId)
            .eq("law_firm_id", lawFirmId)
            .single();

          if (convError || !conversation) {
            console.error("[Evolution API] Conversation not found:", convError);
            throw new Error("Conversation not found");
          }

          targetRemoteJid = conversation.remote_jid;
          instanceId = conversation.whatsapp_instance_id;
        }

        // Fallback: old conversations may not have whatsapp_instance_id set.
        // If there's a connected instance for the law firm, use it and persist back to the conversation.
        if (!instanceId && conversationId) {
          const { data: fallbackInstance } = await supabaseClient
            .from("whatsapp_instances")
            .select("id")
            .eq("law_firm_id", lawFirmId)
            .eq("status", "connected")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fallbackInstance?.id) {
            instanceId = fallbackInstance.id;
            await supabaseClient
              .from("conversations")
              .update({ whatsapp_instance_id: instanceId })
              .eq("id", conversationId)
              .eq("law_firm_id", lawFirmId);
          }
        }

        if (!instanceId) {
          throw new Error("Nenhuma instância WhatsApp conectada para enviar mensagens.");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId);
        const apiUrl = normalizeUrl(instance.api_url);
        const targetNumber = (targetRemoteJid || "").split("@")[0];
        
        if (!targetNumber) {
          throw new Error("remoteJid inválido para envio");
        }

        // Generate a temporary ID for the message
        const tempMessageId = crypto.randomUUID();

        // Get reply IDs if provided (for quoted replies)
        const replyToMessageId = body.replyToMessageId || null; // DB message ID
        const replyToWhatsAppMessageId = body.replyToWhatsAppMessageId || null; // WhatsApp message ID for quote

        // Save message to database IMMEDIATELY with pending status
        if (conversationId) {
          const { error: msgError } = await supabaseClient
            .from("messages")
            .insert({
              id: tempMessageId,
              conversation_id: conversationId,
              whatsapp_message_id: tempMessageId, // Will be updated by webhook
              content: body.message,
              message_type: "text",
              is_from_me: true,
              sender_type: "human",
              ai_generated: false,
              reply_to_message_id: replyToMessageId,
            });

          if (msgError) {
            console.error("[Evolution API] Failed to save pending message:", msgError);
          }

          // Update conversation last_message_at
          // If this conversation was archived, sending a message should also unarchive it
          await supabaseClient
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              archived_at: null,
              archived_reason: null,
              archived_next_responsible_type: null,
              archived_next_responsible_id: null,
            })
            .eq("id", conversationId);
        }

        console.log(`[Evolution API] ASYNC DB saved in ${Date.now() - startTime}ms, starting background send`);

        // Background task: send to Evolution API
        const backgroundSend = async () => {
          try {
            // Build payload with optional quoted message for reply
            const sendPayload: Record<string, unknown> = {
              number: targetNumber,
              text: body.message,
            };
            
            // Include quoted message info if replying (Evolution API v2 format)
            if (replyToWhatsAppMessageId) {
              sendPayload.quoted = {
                key: {
                  id: replyToWhatsAppMessageId,
                },
              };
              console.log(`[Evolution API] Including quoted message: ${replyToWhatsAppMessageId}`);
            }
            
            const sendResponse = await fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, {
              method: "POST",
              headers: {
                apikey: instance.api_key || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(sendPayload),
            });

            if (!sendResponse.ok) {
              const errorText = await sendResponse.text();
              console.error(`[Evolution API] Background send failed:`, JSON.stringify({ status: sendResponse.status, error: errorText }));
              
              // Parse error to detect specific failure reasons
              let errorReason = "Falha no envio";
              try {
                const errorJson = JSON.parse(errorText);
                // Check for "number not on WhatsApp" error
                if (errorJson.message && Array.isArray(errorJson.message)) {
                  const notOnWhatsApp = errorJson.message.find((m: any) => m.exists === false);
                  if (notOnWhatsApp) {
                    errorReason = "Número não registrado no WhatsApp";
                  }
                } else if (errorJson.error) {
                  errorReason = errorJson.error;
                }
              } catch {
                // Keep generic error if parsing fails
              }
              
              // Mark message as failed in DB (don't delete - show error to user)
              if (conversationId) {
                await supabaseClient
                  .from("messages")
                  .update({ 
                    status: "failed",
                    content: `❌ ${errorReason}: ${body.message}`,
                  })
                  .eq("id", tempMessageId);
                console.log(`[Evolution API] Message marked as failed: ${errorReason}`, { tempMessageId });
              }
              return;
            }

            const sendData = await sendResponse.json();
            const whatsappMessageId = sendData.key?.id || sendData.messageId || sendData.id;
            console.log(`[Evolution API] Background send completed, whatsapp_message_id: ${whatsappMessageId}`);

            // Update the message with the real whatsapp_message_id
            if (conversationId && whatsappMessageId) {
              await supabaseClient
                .from("messages")
                .update({ 
                  whatsapp_message_id: whatsappMessageId,
                  status: "sent"
                })
                .eq("id", tempMessageId);
            }
          } catch (error) {
            console.error("[Evolution API] Background send error:", error);
            // Mark message as failed (don't delete - show error to user)
            if (conversationId) {
              const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
              await supabaseClient
                .from("messages")
                .update({ 
                  status: "failed",
                  content: `❌ Erro ao enviar: ${body.message}`,
                })
                .eq("id", tempMessageId);
            }
          }
        };

        // Start background task (fire-and-forget)
        // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
        (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundSend()) || backgroundSend();

        console.log(`[Evolution API] ASYNC Response in ${Date.now() - startTime}ms`);

        // Return immediately
        return new Response(
          JSON.stringify({
            success: true,
            messageId: tempMessageId,
            async: true,
            message: "Message queued for sending",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // =========================
      // SYNC SEND MESSAGE (legacy, waits for Evolution response)
      // =========================
      case "send_message": {
        if (!body.conversationId && !body.remoteJid) {
          throw new Error("conversationId or remoteJid is required");
        }
        if (!body.message) {
          throw new Error("message is required");
        }

        console.log(`[Evolution API] Sending message`, { conversationId: body.conversationId, remoteJid: body.remoteJid });

        let targetRemoteJid = body.remoteJid;
        let conversationId = body.conversationId;
        let instanceId = body.instanceId;

        if (conversationId && !targetRemoteJid) {
          const { data: conversation, error: convError } = await supabaseClient
            .from("conversations")
            .select("remote_jid, whatsapp_instance_id")
            .eq("id", conversationId)
            .eq("law_firm_id", lawFirmId)
            .single();

          if (convError || !conversation) {
            throw new Error("Conversation not found");
          }

          targetRemoteJid = conversation.remote_jid;
          instanceId = conversation.whatsapp_instance_id;
        }

        if (!instanceId) {
          throw new Error("instanceId is required");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId);
        const apiUrl = normalizeUrl(instance.api_url);
        const targetNumber = (targetRemoteJid || "").split("@")[0];
        
        if (!targetNumber) {
          throw new Error("remoteJid inválido para envio");
        }

        const startedAt = Date.now();

        const sendResponse = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance.instance_name}`, {
          method: "POST",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: targetNumber,
            text: body.message,
          }),
        }, SEND_MESSAGE_TIMEOUT_MS);

        console.log(`[Evolution API] Send message response status: ${sendResponse.status} (${Date.now() - startedAt}ms)`);

        if (!sendResponse.ok) {
          const errorText = await safeReadResponseText(sendResponse);
          throw new Error(simplifyEvolutionError(sendResponse.status, errorText));
        }

        const sendData = await sendResponse.json();
        const whatsappMessageId = sendData.key?.id || sendData.messageId || sendData.id || crypto.randomUUID();

        if (conversationId) {
          await supabaseClient
            .from("messages")
            .insert({
              conversation_id: conversationId,
              whatsapp_message_id: whatsappMessageId,
              content: body.message,
              message_type: "text",
              is_from_me: true,
              sender_type: "human",
              ai_generated: false,
            });

          await supabaseClient
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              archived_at: null,
              archived_reason: null,
              archived_next_responsible_type: null,
              archived_next_responsible_id: null,
            })
            .eq("id", conversationId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            messageId: whatsappMessageId,
            message: "Message sent successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // =========================
      // GET MEDIA (decrypt WhatsApp .enc media)
      // =========================
      case "get_media": {
        if (!body.conversationId) {
          throw new Error("conversationId is required");
        }
        if (!body.whatsappMessageId) {
          throw new Error("whatsappMessageId is required");
        }

        console.log(`[Evolution API] Getting media for message: ${body.whatsappMessageId}, isGlobalAdmin: ${isGlobalAdmin}`);

        // Get instance from conversation - global admins can access any conversation
        let convQuery = supabaseClient
          .from("conversations")
          .select("whatsapp_instance_id, law_firm_id")
          .eq("id", body.conversationId);
        
        // Only filter by law_firm_id if not a global admin
        if (!isGlobalAdmin) {
          convQuery = convQuery.eq("law_firm_id", lawFirmId);
        }
        
        const { data: conversation, error: convError } = await convQuery.single();

        if (convError || !conversation?.whatsapp_instance_id) {
          console.error("[Evolution API] Conversation not found:", convError, { conversationId: body.conversationId, lawFirmId, isGlobalAdmin });
          throw new Error("Conversation not found");
        }

        // Use the conversation's law_firm_id to get the instance
        const targetLawFirmId = conversation.law_firm_id;
        const instance = await getInstanceById(supabaseClient, targetLawFirmId, conversation.whatsapp_instance_id, isGlobalAdmin);
        const apiUrl = normalizeUrl(instance.api_url);

        // Call Evolution API to get decrypted media
        const mediaResponse = await fetchWithTimeout(
          `${apiUrl}/chat/getBase64FromMediaMessage/${instance.instance_name}`,
          {
            method: "POST",
            headers: {
              apikey: instance.api_key || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                key: {
                  id: body.whatsappMessageId,
                },
              },
              convertToMp4: false,
            }),
          },
          DEFAULT_TIMEOUT_MS
        );

        if (!mediaResponse.ok) {
          const errorText = await safeReadResponseText(mediaResponse);
          console.error(`[Evolution API] Get media failed:`, errorText);
          throw new Error(simplifyEvolutionError(mediaResponse.status, errorText));
        }

        const mediaData = await mediaResponse.json();
        console.log(`[Evolution API] Media retrieved, base64 length: ${mediaData.base64?.length || 0}`);

        return new Response(
          JSON.stringify({
            success: true,
            base64: mediaData.base64,
            mimetype: mediaData.mimetype,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "send_media": {
        if (!body.conversationId && !body.remoteJid) {
          throw new Error("conversationId or remoteJid is required");
        }
        if (!body.mediaBase64 && !body.mediaUrl) {
          throw new Error("mediaBase64 or mediaUrl is required");
        }
        if (!body.mediaType) {
          throw new Error("mediaType is required (image, audio, video, document)");
        }

        console.log(`[Evolution API] Sending media`, { 
          conversationId: body.conversationId, 
          remoteJid: body.remoteJid,
          mediaType: body.mediaType,
          hasBase64: !!body.mediaBase64,
          hasUrl: !!body.mediaUrl
        });

        let targetRemoteJid = body.remoteJid;
        let conversationId = body.conversationId;
        let instanceId = body.instanceId;

        // If we have a conversationId, get the remoteJid and instanceId from it
        if (conversationId && !targetRemoteJid) {
          const { data: conversation, error: convError } = await supabaseClient
            .from("conversations")
            .select("remote_jid, whatsapp_instance_id")
            .eq("id", conversationId)
            .eq("law_firm_id", lawFirmId)
            .single();

          if (convError || !conversation) {
            console.error("[Evolution API] Conversation not found:", convError);
            throw new Error("Conversation not found");
          }

          targetRemoteJid = conversation.remote_jid;
          instanceId = conversation.whatsapp_instance_id;
        }

        // Fallback: old conversations may not have whatsapp_instance_id set.
        // If there's a connected instance for the law firm, use it and persist back to the conversation.
        if (!instanceId && conversationId) {
          const { data: fallbackInstance } = await supabaseClient
            .from("whatsapp_instances")
            .select("id")
            .eq("law_firm_id", lawFirmId)
            .eq("status", "connected")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fallbackInstance?.id) {
            instanceId = fallbackInstance.id;
            await supabaseClient
              .from("conversations")
              .update({ whatsapp_instance_id: instanceId })
              .eq("id", conversationId)
              .eq("law_firm_id", lawFirmId);
          }
        }

        if (!instanceId) {
          throw new Error("Nenhuma instância WhatsApp conectada para enviar arquivos.");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        console.log(`[Evolution API] Sending ${body.mediaType} to ${targetRemoteJid} via ${instance.instance_name}`);

        // Determine the endpoint based on media type
        const targetNumber = (targetRemoteJid || "").split("@")[0];
        if (!targetNumber) {
          throw new Error("remoteJid inválido para envio de mídia");
        }

        let endpoint = "";
        let payload: Record<string, unknown> = {
          number: targetNumber,
        };

        switch (body.mediaType) {
          case "image":
            endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
            payload = {
              ...payload,
              mediatype: "image",
              mimetype: body.mimeType || "image/jpeg",
              caption: body.caption || "",
              media: body.mediaBase64 || body.mediaUrl,
            };
            break;
          case "audio":
            endpoint = `${apiUrl}/message/sendWhatsAppAudio/${instance.instance_name}`;
            payload = {
              ...payload,
              audio: body.mediaBase64 || body.mediaUrl,
            };
            break;
          case "video":
            endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
            payload = {
              ...payload,
              mediatype: "video",
              mimetype: body.mimeType || "video/mp4",
              caption: body.caption || "",
              media: body.mediaBase64 || body.mediaUrl,
            };
            break;
          case "document":
            endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
            payload = {
              ...payload,
              mediatype: "document",
              mimetype: body.mimeType || "application/octet-stream",
              fileName: body.fileName || "document",
              media: body.mediaBase64 || body.mediaUrl,
            };
            break;
        }

        console.log(`[Evolution API] Sending to endpoint: ${endpoint}`);

        const sendResponse = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        console.log(`[Evolution API] Send media response status: ${sendResponse.status}`);

        if (!sendResponse.ok) {
          const errorText = await safeReadResponseText(sendResponse);
          console.error(`[Evolution API] Send media failed:`, errorText);
          throw new Error(simplifyEvolutionError(sendResponse.status, errorText));
        }

        const sendData = await sendResponse.json();
        console.log(`[Evolution API] Media sent successfully:`, JSON.stringify(sendData));

        const whatsappMessageId = sendData.key?.id || sendData.messageId || sendData.id || crypto.randomUUID();

        // Save message to database
        if (conversationId) {
          const { data: savedMessage, error: msgError } = await supabaseClient
            .from("messages")
            .insert({
              conversation_id: conversationId,
              whatsapp_message_id: whatsappMessageId,
              content: body.caption || body.fileName || `[${body.mediaType}]`,
              message_type: body.mediaType,
              media_url: body.mediaUrl || null,
              media_mime_type: body.mimeType || null,
              is_from_me: true,
              sender_type: "human",
              ai_generated: false,
            })
            .select()
            .single();

          if (msgError) {
            console.error("[Evolution API] Failed to save media message to DB:", msgError);
          } else {
            console.log(`[Evolution API] Media message saved to DB with ID: ${savedMessage.id}`);
          }

          await supabaseClient
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              archived_at: null,
              archived_reason: null,
              archived_next_responsible_type: null,
              archived_next_responsible_id: null,
            })
            .eq("id", conversationId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            messageId: whatsappMessageId,
            message: "Media sent successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // =========================
      // GLOBAL MANAGEMENT ENDPOINTS (using centralized API keys)
      // =========================
      case "global_create_instance": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Creating instance: ${body.instanceName} at ${apiUrl}`);

        const createResponse = await fetchWithTimeout(`${apiUrl}/instance/create`, {
          method: "POST",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instanceName: body.instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: buildWebhookConfig(WEBHOOK_URL),
          }),
        });

        console.log(`[Evolution API] GLOBAL Create instance response status: ${createResponse.status}`);

        if (!createResponse.ok) {
          const errorText = await safeReadResponseText(createResponse);
          console.error(`[Evolution API] GLOBAL Create instance failed:`, errorText);
          throw new Error(simplifyEvolutionError(createResponse.status, errorText));
        }

        const createData = await createResponse.json();
        console.log(`[Evolution API] GLOBAL Create instance response:`, JSON.stringify(createData));

        let qrCode: string | null = null;
        if (createData.qrcode?.base64) {
          qrCode = createData.qrcode.base64;
        } else if (createData.qrcode && typeof createData.qrcode === "string") {
          qrCode = createData.qrcode;
        } else if (createData.base64) {
          qrCode = createData.base64;
        }

        const instanceId = createData.instance?.instanceId || createData.instanceId || body.instanceName;

        // Save instance to database using global credentials
        const { data: instance, error: insertError } = await supabaseClient
          .from("whatsapp_instances")
          .insert({
            law_firm_id: lawFirmId,
            instance_name: body.instanceName,
            instance_id: instanceId,
            api_url: apiUrl,
            api_key: globalApiKey,
            status: qrCode ? "awaiting_qr" : "disconnected",
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[Evolution API] GLOBAL Database insert error:`, insertError);
          throw new Error(`Falha ao salvar a instância no sistema: ${insertError.message}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            instance,
            qrCode,
            message: qrCode ? "Instance created, scan QR code" : "Instance created",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "global_delete_instance": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceId && !body.instanceName) {
          throw new Error("instanceId or instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        let instanceName = body.instanceName;

        // If instanceId is provided, get the instance name from database
        if (body.instanceId) {
          const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
          instanceName = instance.instance_name;
        }

        console.log(`[Evolution API] GLOBAL Deleting instance: ${instanceName}`);

        // Delete from Evolution API
        try {
          const deleteResponse = await fetchWithTimeout(`${apiUrl}/instance/delete/${instanceName}`, {
            method: "DELETE",
            headers: {
              apikey: globalApiKey,
              "Content-Type": "application/json",
            },
          });
          console.log(`[Evolution API] GLOBAL Evolution delete response: ${deleteResponse.status}`);
        } catch (e) {
          console.log(`[Evolution API] GLOBAL Evolution delete failed (non-fatal):`, e);
        }

        // Delete from database if instanceId was provided
        if (body.instanceId) {
          const { error: deleteError } = await supabaseClient
            .from("whatsapp_instances")
            .delete()
            .eq("id", body.instanceId)
            .eq("law_firm_id", lawFirmId);

          if (deleteError) {
            throw new Error(`Failed to delete instance: ${deleteError.message}`);
          }
        }

        return new Response(JSON.stringify({ success: true, message: "Instance deleted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "global_get_qrcode": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceId && !body.instanceName) {
          throw new Error("instanceId or instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        let instanceName = body.instanceName;
        let dbInstanceId = body.instanceId;

        if (body.instanceId) {
          const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
          instanceName = instance.instance_name;
        }

        console.log(`[Evolution API] GLOBAL Getting QR for: ${instanceName}`);

        const qrResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${instanceName}`, {
          method: "GET",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
        });

        if (!qrResponse.ok) {
          const errorText = await safeReadResponseText(qrResponse);
          throw new Error(simplifyEvolutionError(qrResponse.status, errorText));
        }

        const qrData = await qrResponse.json();
        let qrCode: string | null = null;
        if (qrData.base64) {
          qrCode = qrData.base64;
        } else if (qrData.qrcode?.base64) {
          qrCode = qrData.qrcode.base64;
        } else if (qrData.qrcode && typeof qrData.qrcode === "string") {
          qrCode = qrData.qrcode;
        }

        const status = qrData.state || qrData.status || "unknown";

        // Update instance status if connected
        if (dbInstanceId && (status === "open" || status === "connected")) {
          await supabaseClient
            .from("whatsapp_instances")
            .update({ status: "connected", updated_at: new Date().toISOString() })
            .eq("id", dbInstanceId);
        }

        return new Response(
          JSON.stringify({ success: true, qrCode, status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "global_get_status": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Getting status for: ${body.instanceName}`);

        const statusResponse = await fetchWithTimeout(`${apiUrl}/instance/connectionState/${body.instanceName}`, {
          method: "GET",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
        });

        if (!statusResponse.ok) {
          const errorText = await safeReadResponseText(statusResponse);
          return new Response(JSON.stringify({ success: true, status: "disconnected", evolutionState: "not_found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const statusData = await statusResponse.json();
        const state = statusData.state || statusData.instance?.state || "unknown";
        let dbStatus = "disconnected";

        if (state === "open" || state === "connected") {
          dbStatus = "connected";
        } else if (state === "connecting" || state === "qr") {
          dbStatus = "connecting";
        }

        return new Response(
          JSON.stringify({ success: true, status: dbStatus, evolutionState: state }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "global_configure_webhook": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Configuring webhook for: ${body.instanceName}`);

        const webhookResponse = await fetchWithTimeout(`${apiUrl}/webhook/set/${body.instanceName}`, {
          method: "POST",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
        });

        if (!webhookResponse.ok) {
          const errorText = await safeReadResponseText(webhookResponse);
          throw new Error(simplifyEvolutionError(webhookResponse.status, errorText));
        }

        return new Response(JSON.stringify({ success: true, message: "Webhook configured successfully" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "global_restart_instance": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Restarting instance: ${body.instanceName}`);

        const restartResponse = await fetchWithTimeout(`${apiUrl}/instance/restart/${body.instanceName}`, {
          method: "PUT",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
        });

        if (!restartResponse.ok) {
          const errorText = await safeReadResponseText(restartResponse);
          throw new Error(simplifyEvolutionError(restartResponse.status, errorText));
        }

        return new Response(JSON.stringify({ success: true, message: "Instance restarted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "global_logout_instance": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Logging out instance: ${body.instanceName}`);

        const logoutResponse = await fetchWithTimeout(`${apiUrl}/instance/logout/${body.instanceName}`, {
          method: "DELETE",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
        });

        if (!logoutResponse.ok) {
          const errorText = await safeReadResponseText(logoutResponse);
          throw new Error(simplifyEvolutionError(logoutResponse.status, errorText));
        }

        // Update database status
        if (body.instanceId) {
          await supabaseClient
            .from("whatsapp_instances")
            .update({ status: "disconnected", updated_at: new Date().toISOString() })
            .eq("id", body.instanceId);
        }

        return new Response(JSON.stringify({ success: true, message: "Instance logged out" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // =========================
      // N8N INTEGRATION ENDPOINTS
      // =========================
      case "n8n_forward_message": {
        const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
        const n8nToken = Deno.env.get("N8N_INTERNAL_TOKEN");
        
        if (!n8nWebhookUrl) {
          throw new Error("N8N_WEBHOOK_URL must be configured");
        }
        
        if (!body.conversationId) {
          throw new Error("conversationId is required");
        }
        if (!body.message) {
          throw new Error("message is required");
        }

        console.log(`[Evolution API] Forwarding message to N8N for conversation: ${body.conversationId}`);

        // Get conversation details
        const { data: conversation, error: convError } = await supabaseClient
          .from("conversations")
          .select(`
            *,
            client:clients(id, name, phone, email, document),
            whatsapp_instance:whatsapp_instances(instance_name, phone_number)
          `)
          .eq("id", body.conversationId)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (convError || !conversation) {
          throw new Error("Conversation not found");
        }

        // Get recent messages for context
        const { data: recentMessages } = await supabaseClient
          .from("messages")
          .select("content, is_from_me, message_type, created_at")
          .eq("conversation_id", body.conversationId)
          .order("created_at", { ascending: false })
          .limit(10);

        const payload = {
          event: "new_message",
          timestamp: new Date().toISOString(),
          law_firm_id: lawFirmId,
          conversation: {
            id: conversation.id,
            remote_jid: conversation.remote_jid,
            contact_name: conversation.contact_name,
            contact_phone: conversation.contact_phone,
            status: conversation.status,
            current_handler: conversation.current_handler,
            ai_summary: conversation.ai_summary,
          },
          client: conversation.client,
          whatsapp_instance: conversation.whatsapp_instance,
          message: {
            content: body.message,
            type: "text",
          },
          context: {
            recent_messages: recentMessages?.reverse() || [],
          },
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (n8nToken) {
          headers["Authorization"] = `Bearer ${n8nToken}`;
        }

        const n8nResponse = await fetchWithTimeout(n8nWebhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }, 30000);

        console.log(`[Evolution API] N8N response status: ${n8nResponse.status}`);

        let n8nData = null;
        try {
          n8nData = await n8nResponse.json();
        } catch {
          n8nData = await n8nResponse.text();
        }

        // Update conversation with n8n response timestamp
        await supabaseClient
          .from("conversations")
          .update({ n8n_last_response_at: new Date().toISOString() })
          .eq("id", body.conversationId);

        return new Response(
          JSON.stringify({
            success: n8nResponse.ok,
            statusCode: n8nResponse.status,
            response: n8nData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "n8n_get_conversation": {
        if (!body.conversationId) {
          throw new Error("conversationId is required");
        }

        console.log(`[Evolution API] Getting conversation for N8N: ${body.conversationId}`);

        const { data: conversation, error: convError } = await supabaseClient
          .from("conversations")
          .select(`
            *,
            client:clients(*),
            whatsapp_instance:whatsapp_instances(instance_name, phone_number, status)
          `)
          .eq("id", body.conversationId)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (convError || !conversation) {
          throw new Error("Conversation not found");
        }

        // Get all messages
        const { data: messages } = await supabaseClient
          .from("messages")
          .select("*")
          .eq("conversation_id", body.conversationId)
          .order("created_at", { ascending: true });

        return new Response(
          JSON.stringify({
            success: true,
            conversation,
            messages: messages || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "n8n_send_reply": {
        if (!body.conversationId) {
          throw new Error("conversationId is required");
        }
        if (!body.message) {
          throw new Error("message is required");
        }

        console.log(`[Evolution API] N8N sending reply to conversation: ${body.conversationId}`);

        // Get conversation and instance
        const { data: conversation, error: convError } = await supabaseClient
          .from("conversations")
          .select("remote_jid, whatsapp_instance_id")
          .eq("id", body.conversationId)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (convError || !conversation) {
          throw new Error("Conversation not found");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, conversation.whatsapp_instance_id);
        const apiUrl = normalizeUrl(instance.api_url);
        const targetNumber = (conversation.remote_jid || "").split("@")[0];

        if (!targetNumber) {
          throw new Error("Invalid remote_jid");
        }

        // Apply human-like jitter before sending N8N/AI response (7-15s)
        await humanDelay(DELAY_CONFIG.AI_RESPONSE.min, DELAY_CONFIG.AI_RESPONSE.max, '[N8N_REPLY]');

        // Send message via Evolution API
        const sendResponse = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance.instance_name}`, {
          method: "POST",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: targetNumber,
            text: body.message,
          }),
        }, SEND_MESSAGE_TIMEOUT_MS);

        if (!sendResponse.ok) {
          const errorText = await safeReadResponseText(sendResponse);
          throw new Error(simplifyEvolutionError(sendResponse.status, errorText));
        }

        const sendData = await sendResponse.json();
        const whatsappMessageId = sendData.key?.id || sendData.messageId || crypto.randomUUID();

        // Save message to database as AI-generated
        await supabaseClient
          .from("messages")
          .insert({
            conversation_id: body.conversationId,
            whatsapp_message_id: whatsappMessageId,
            content: body.message,
            message_type: "text",
            is_from_me: true,
            sender_type: "ai",
            ai_generated: true,
          });

        // Update conversation
        await supabaseClient
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            n8n_last_response_at: new Date().toISOString(),
            archived_at: null,
            archived_reason: null,
            archived_next_responsible_type: null,
            archived_next_responsible_id: null,
          })
          .eq("id", body.conversationId);

        return new Response(
          JSON.stringify({
            success: true,
            messageId: whatsappMessageId,
            message: "Reply sent via N8N",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "delete_message": {
        // Delete message for everyone on WhatsApp
        if (!body.conversationId) {
          throw new Error("conversationId is required for delete_message");
        }
        if (!body.whatsappMessageId) {
          throw new Error("whatsappMessageId is required for delete_message");
        }
        if (!body.remoteJid) {
          throw new Error("remoteJid is required for delete_message");
        }

        // Get conversation with instance
        const { data: deleteConversation, error: deleteConvError } =
          await supabaseClient
            .from("conversations")
            .select("*, whatsapp_instances!inner(*)")
            .eq("id", body.conversationId)
            .single();

        if (deleteConvError || !deleteConversation) {
          throw new Error(
            `Conversation not found: ${deleteConvError?.message}`
          );
        }

        const deleteInstance = deleteConversation.whatsapp_instances;
        if (!deleteInstance) {
          throw new Error("No WhatsApp instance associated with conversation");
        }

        // Use instance's api_url and api_key (same pattern as other actions)
        const deleteApiUrl = normalizeUrl(deleteInstance.api_url || "");
        const deleteApiKey = deleteInstance.api_key || "";

        if (!deleteApiUrl || !deleteApiKey) {
          throw new Error("Evolution API not configured for this instance");
        }

        // Call Evolution API to delete message for everyone
        const deleteResponse = await fetchWithTimeout(
          `${deleteApiUrl}/chat/deleteMessageForEveryone/${deleteInstance.instance_name}`,
          {
            method: "DELETE",
            headers: {
              apikey: deleteApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: body.whatsappMessageId,
              remoteJid: body.remoteJid,
              fromMe: true,
            }),
          },
          DEFAULT_TIMEOUT_MS
        );

        if (!deleteResponse.ok) {
          const errorText = await safeReadResponseText(deleteResponse);
          console.error("[delete_message] Evolution API error:", errorText);
          throw new Error(
            `Failed to delete message: ${simplifyEvolutionError(deleteResponse.status, errorText)}`
          );
        }

        // Mark message as revoked in database
        const { error: revokeUpdateError } = await supabaseClient
          .from("messages")
          .update({
            is_revoked: true,
            revoked_at: new Date().toISOString(),
          })
          .eq("whatsapp_message_id", body.whatsappMessageId);

        if (revokeUpdateError) {
          console.error("[delete_message] Database update error:", revokeUpdateError);
          // Don't throw - message was deleted on WhatsApp, just log DB error
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Message deleted successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }
  } catch (error) {
    console.error("[Evolution API] Error:", error);

    // IMPORTANT: return 200 so the client can read the error message in response.data
    // (when we return 400, supabase-js collapses it into a generic "Edge function returned 400")
    const errorMessage = (() => {
      if (error instanceof Error) return error.message;
      if (typeof error === "string") return error;
      try {
        return JSON.stringify(error);
      } catch {
        return "An unexpected error occurred";
      }
    })();

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
