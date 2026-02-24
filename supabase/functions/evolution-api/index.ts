import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { 
  extractSubdomainFromOrigin, 
  validateTenantAccess, 
  logTenantSecurityEvent 
} from "../_shared/tenant-validation.ts";
import { humanDelay, DELAY_CONFIG } from "../_shared/human-delay.ts";
import {
  getProviderConfig,
  getProvider,
  isUazapi,
  isEvolution,
  sendText as providerSendText,
  sendMedia as providerSendMedia,
  sendAudio as providerSendAudio,
  fetchProfilePicture as providerFetchProfilePicture,
  deleteMessage as providerDeleteMessage,
  sendReaction as providerSendReaction,
  type ProviderConfig,
  type SendTextResult,
  type SendMediaResult,
} from "../_shared/whatsapp-provider.ts";

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
  | "send_media_async" // Async media sending with background task
  | "get_media"
  | "delete_message" // Delete message for everyone on WhatsApp
  | "send_reaction" // Send emoji reaction to a message
  | "fetch_profile_picture" // Fetch WhatsApp profile picture and update client avatar
  // Tenant-level instance management
  | "logout_instance" // Disconnect without deleting
  | "restart_instance" // Restart connection
  // New centralized management endpoints
  | "global_create_instance"
  | "global_recreate_instance"
  | "global_delete_instance"
  | "global_get_qrcode"
  | "global_get_status"
  | "global_configure_webhook"
  | "global_restart_instance"
  | "global_logout_instance"
  // N8N integration endpoints
  | "n8n_forward_message"
  | "n8n_get_conversation"
  | "n8n_send_reply"
  // Webhook reapply endpoints
  | "reapply_webhook"
  | "reapply_all_webhooks"
  | "verify_webhook_config";

interface EvolutionRequest {
  action: EvolutionAction;
  instanceName?: string;
  displayName?: string;
  apiUrl?: string;
  apiKey?: string;
  provider?: 'evolution' | 'uazapi';
  instanceId?: string;
  rejectCall?: boolean;
  msgCall?: string;
  // For send_message
  conversationId?: string;
  message?: string;
  remoteJid?: string;
  replyToMessageId?: string; // For DB linking (message.id)
  replyToWhatsAppMessageId?: string; // For WhatsApp quoted reply (whatsapp_message_id)
  isPontual?: boolean; // For pontual intervention (sent to WhatsApp but doesn't transfer from AI)
  // For send_media
  mediaType?: "image" | "audio" | "video" | "document";
  mediaBase64?: string;
  mediaUrl?: string;
  fileName?: string;
  caption?: string;
  mimeType?: string; // Real MIME type of the file (e.g., "image/png", "application/pdf")
  // For get_media
  whatsappMessageId?: string;
  // For send_reaction
  reaction?: string; // Emoji to react with (e.g., "👍", "❤️") or empty string to remove
  isFromMe?: boolean; // Whether the message being reacted to was sent by us
  // For send_media_async - client-generated message ID for ID unification
  clientMessageId?: string;
  // For fetch_profile_picture
  phoneNumber?: string;
  clientId?: string;
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

  // Handle 413 - file too large
  if (status === 413) {
    return `Arquivo muito grande para enviar. Grave um áudio menor e reenvie.`;
  }

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
  // Evolution API v2.2.3 expects camelCase keys
  return {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: true,
    events: [
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_DELETE",
      "CONTACTS_UPDATE",
    ],
  };
}

function extractPhoneFromJid(jid?: string | null): string | null {
  if (!jid) return null;
  const number = jid.split("@")[0];
  return number || null;
}

function extractRejectCallFlag(payload: any): boolean {
  // Evolution API v2.3+ returns settings in different formats depending on version/endpoint
  // Try all known patterns to extract the rejectCall flag
  const candidates = [
    // Direct on response (most common in v2.3+)
    payload?.rejectCall,
    payload?.reject_call,
    // Nested under 'settings' wrapper
    payload?.settings?.rejectCall,
    payload?.settings?.reject_call,
    // Double nested (some versions)
    payload?.settings?.settings?.rejectCall,
    payload?.settings?.settings?.reject_call,
    // Array response format (fetchSettings returns array sometimes)
    Array.isArray(payload) && payload.length > 0 ? payload[0]?.rejectCall : undefined,
    Array.isArray(payload) && payload.length > 0 ? payload[0]?.reject_call : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return candidate;
    }
    // Some APIs return string "true"/"false"
    if (candidate === "true") return true;
    if (candidate === "false") return false;
  }

  // Default to false if not found
  return false;
}

// Get the webhook URL for this project (include auth token in query string)
const EVOLUTION_WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") || "";
const WEBHOOK_URL = EVOLUTION_WEBHOOK_TOKEN
  ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook?token=${EVOLUTION_WEBHOOK_TOKEN}`
  : `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;

/**
 * Check if a phone number is already connected on another instance.
 * Returns the conflicting instance info if found, null otherwise.
 */
async function checkPhoneNumberDuplicate(
  supabaseClient: any,
  phoneNumber: string,
  excludeInstanceId: string
): Promise<{ id: string; instance_name: string; law_firm_id: string } | null> {
  const { data: existingInstances, error } = await supabaseClient
    .from("whatsapp_instances")
    .select("id, instance_name, law_firm_id, phone_number")
    .eq("phone_number", phoneNumber)
    .eq("status", "connected")
    .neq("id", excludeInstanceId);

  if (error || !existingInstances || existingInstances.length === 0) {
    return null;
  }

  return existingInstances[0];
}

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

        const requestedProvider = body.provider || 'evolution';
        console.log(`[Evolution API] Creating instance: ${body.instanceName}, provider: ${requestedProvider}`);

        // ── UAZAPI PROVIDER ──
        if (requestedProvider === 'uazapi') {
          if (!body.apiUrl || !body.apiKey) {
            throw new Error("apiUrl and apiKey are required for uazapi provider");
          }

          const uazapiConfig: ProviderConfig = {
            provider: 'uazapi',
            apiUrl: body.apiUrl,
            apiKey: body.apiKey,
            instanceName: body.instanceName,
          };

          // Connect to uazapi (instances are pre-provisioned)
          const uazapiProvider = getProvider(uazapiConfig);
          const connectResult = await uazapiProvider.connect(uazapiConfig);

          // Build uazapi webhook URL
          const UAZAPI_WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") || "";
          const uazapiWebhookUrl = UAZAPI_WEBHOOK_TOKEN
            ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook?token=${UAZAPI_WEBHOOK_TOKEN}`
            : `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook`;

          // Configure webhook
          try {
            await uazapiProvider.configureWebhook(uazapiConfig, { webhookUrl: uazapiWebhookUrl });
            console.log(`[Evolution API] uazapi webhook configured`);
          } catch (webhookErr) {
            console.warn(`[Evolution API] uazapi webhook config failed (non-fatal):`, webhookErr);
          }

          // Save instance to database with api_provider = 'uazapi'
          const { data: instance, error: insertError } = await supabaseClient
            .from("whatsapp_instances")
            .insert({
              law_firm_id: lawFirmId,
              instance_name: body.instanceName,
              display_name: body.displayName || body.instanceName,
              instance_id: body.instanceName,
              api_url: body.apiUrl,
              api_key: body.apiKey,
              api_provider: 'uazapi',
              status: connectResult.status === 'connected' ? 'connected' : (connectResult.qrCode ? 'awaiting_qr' : 'disconnected'),
            })
            .select()
            .single();

          if (insertError) {
            console.error(`[Evolution API] Database insert error (uazapi):`, insertError);
            throw new Error(`Falha ao salvar a instância: ${insertError.message}`);
          }

          console.log(`[Evolution API] uazapi instance saved with ID: ${instance.id}`);

          return new Response(
            JSON.stringify({
              success: true,
              instance,
              qrCode: connectResult.qrCode,
              message: connectResult.qrCode ? "Instance created, scan QR code" : (connectResult.status === 'connected' ? "Connected" : "Instance created"),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── EVOLUTION PROVIDER (existing logic) ──
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

        // Auto-configure settings to ignore groups by default
        try {
          const settingsPayload = {
            rejectCall: false,
            msgCall: "",
            groupsIgnore: true,
            alwaysOnline: false,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
          };
          
          const settingsResponse = await fetchWithTimeout(`${apiUrl}/settings/set/${body.instanceName}`, {
            method: "POST",
            headers: {
              apikey: apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(settingsPayload),
          });
          
          if (settingsResponse.ok) {
            console.log(`[Evolution API] Auto-configured groupsIgnore=true for instance ${body.instanceName}`);
          } else {
            console.warn(`[Evolution API] Failed to auto-configure settings for ${body.instanceName}:`, await safeReadResponseText(settingsResponse));
          }
        } catch (settingsError) {
          console.warn(`[Evolution API] Error auto-configuring settings:`, settingsError);
        }

        // Extract QR code from response
        console.log(`[Evolution API] create_instance qrcode field:`, JSON.stringify(createData?.qrcode).slice(0, 500));
        const _extractQr = (d: any): string | null => {
          if (d?.qrcode?.base64) return d.qrcode.base64;
          if (typeof d?.qrcode?.qrcode === "string" && d.qrcode.qrcode.length > 10) return d.qrcode.qrcode;
          if (typeof d?.qrcode === "string" && d.qrcode.length > 10) return d.qrcode;
          if (d?.base64) return d.base64;
          if (typeof d?.code === "string" && d.code.length > 10) return d.code;
          if (typeof d?.qrcode?.code === "string" && d.qrcode.code.length > 10) return d.qrcode.code;
          return null;
        };
        let qrCode: string | null = _extractQr(createData);

        // If no QR code from create response, retry with /instance/connect endpoint
        if (!qrCode) {
          console.log(`[Evolution API] No QR from create response, retrying with /instance/connect`);
          const maxRetries = 2;
          const retryDelayMs = 2000;

          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[Evolution API] QR retry attempt ${attempt}/${maxRetries} for ${body.instanceName}`);
              const connectResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${body.instanceName}`, {
                method: "GET",
                headers: { apikey: apiKey },
              });

              if (connectResponse.ok) {
                const connectData = await connectResponse.json();
                console.log(`[Evolution API] Connect response attempt ${attempt}:`, JSON.stringify(connectData).substring(0, 200));

                if (connectData.base64) {
                  qrCode = connectData.base64;
                  break;
                } else if (connectData.qrcode?.base64) {
                  qrCode = connectData.qrcode.base64;
                  break;
                }
              }
            } catch (retryError) {
              console.warn(`[Evolution API] QR retry attempt ${attempt} failed:`, retryError);
            }

            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            }
          }

          if (!qrCode) {
            console.log(`[Evolution API] QR code not available after ${maxRetries} retries. Frontend will handle.`);
          }
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
            api_provider: 'evolution',
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

        // ── UAZAPI PROVIDER: Simple connect flow ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          const result = await provider.connect(config);

          const uazapiStatus = result.status === 'connected' ? 'connected' : (result.qrCode ? 'awaiting_qr' : 'disconnected');
          await supabaseClient.from("whatsapp_instances")
            .update({ status: uazapiStatus, awaiting_qr: uazapiStatus === 'awaiting_qr', updated_at: new Date().toISOString() })
            .eq("id", body.instanceId);

          return new Response(
            JSON.stringify({ success: true, qrCode: result.qrCode, status: uazapiStatus }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── EVOLUTION PROVIDER (existing logic) ──
        const apiUrl = normalizeUrl(instance.api_url);

        console.log(`[Evolution API] Fetching QR from: ${apiUrl}/instance/connect/${instance.instance_name}`);

        let qrResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
          method: "GET",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
        });

        console.log(`[Evolution API] Get QR code response status: ${qrResponse.status}`);

        // If 404 - instance doesn't exist in Evolution API, recreate it
        let wasRecreatedFrom404 = false;
        if (qrResponse.status === 404) {
          console.log(`[Evolution API] Instance ${instance.instance_name} not found in Evolution, recreating...`);
          
          try {
            // Create the instance in Evolution
            const createResponse = await fetchWithTimeout(`${apiUrl}/instance/create`, {
              method: "POST",
              headers: {
                apikey: instance.api_key || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                instanceName: instance.instance_name,
                token: instance.api_key,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS",
                webhook: buildWebhookConfig(WEBHOOK_URL),
              }),
            }, 30000);
            
            if (createResponse.ok) {
              // Extract QR from create response (Evolution v2.3.x returns QR inline)
              let createQrCode: string | null = null;
              try {
                const createData = await createResponse.json();
                console.log(`[Evolution API] Instance recreated successfully. Create response keys: ${Object.keys(createData)}`);
                console.log(`[Evolution API] 404-recreate qrcode field:`, JSON.stringify(createData?.qrcode).slice(0, 500));
                const _extractQr2 = (d: any): string | null => {
                  if (d?.qrcode?.base64) return d.qrcode.base64;
                  if (typeof d?.qrcode?.qrcode === "string" && d.qrcode.qrcode.length > 10) return d.qrcode.qrcode;
                  if (typeof d?.qrcode === "string" && d.qrcode.length > 10) return d.qrcode;
                  if (d?.base64) return d.base64;
                  if (typeof d?.code === "string" && d.code.length > 10) return d.code;
                  if (typeof d?.qrcode?.code === "string" && d.qrcode.code.length > 10) return d.qrcode.code;
                  return null;
                };
                createQrCode = _extractQr2(createData);
                if (createQrCode) {
                  console.log(`[Evolution API] ✅ QR code extracted directly from /instance/create response!`);
                }
              } catch (parseErr) {
                console.warn(`[Evolution API] Could not parse create response:`, parseErr);
              }
              
              // CRITICAL: Configure groupsIgnore=true to prevent AI from responding in groups
              try {
                const settingsPayload = {
                  rejectCall: false,    // Required by Evolution API v2
                  msgCall: "",
                  groupsIgnore: true,
                  alwaysOnline: false,
                  readMessages: false,
                  readStatus: false,
                  syncFullHistory: false,
                };
                
                const settingsResponse = await fetchWithTimeout(`${apiUrl}/settings/set/${instance.instance_name}`, {
                  method: "POST",
                  headers: {
                    apikey: instance.api_key || "",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(settingsPayload),
                });
                
                if (settingsResponse.ok) {
                  console.log(`[Evolution API] Auto-configured groupsIgnore=true for recreated instance ${instance.instance_name}`);
                } else {
                  console.warn(`[Evolution API] Failed to configure settings for recreated instance:`, await safeReadResponseText(settingsResponse));
                }
              } catch (settingsError) {
                console.warn(`[Evolution API] Error configuring settings for recreated instance:`, settingsError);
              }
              
              // Configure webhook for the recreated instance
              await fetchWithTimeout(`${apiUrl}/webhook/set/${instance.instance_name}`, {
                method: "POST",
                headers: {
                  apikey: instance.api_key || "",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
              }).catch(e => console.warn("[Evolution API] Webhook config failed:", e));
              
              // If QR was already extracted from create response, return immediately
              if (createQrCode) {
                console.log(`[Evolution API] Returning QR from create response (no connect needed)`);
                return new Response(
                  JSON.stringify({ success: true, qrCode: createQrCode, status: "awaiting_qr" }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
              }
              
              // Fallback: Wait for Baileys v7 to fully initialize the session
              console.log(`[Evolution API] No QR in create response, waiting 5s for Baileys v7 to initialize...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // Try to get QR code with retries (Baileys v7 may need extra time)
              let qrObtainedAfterRecreate = false;
              for (let connectAttempt = 1; connectAttempt <= 3; connectAttempt++) {
                console.log(`[Evolution API] Post-recreate connect attempt ${connectAttempt}/3 for ${instance.instance_name}`);
                
                qrResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
                  method: "GET",
                  headers: {
                    apikey: instance.api_key || "",
                    "Content-Type": "application/json",
                  },
                });
                
                if (qrResponse.ok) {
                  const tempData = await qrResponse.json();
                  console.log(`[Evolution API] Post-recreate attempt ${connectAttempt} response: ${JSON.stringify(tempData).slice(0, 300)}`);
                  
                  // Check if we got a QR code
                  const tempQr = tempData.base64 || tempData.qrcode?.base64 || 
                    (typeof tempData.qrcode === "string" ? tempData.qrcode : null) || tempData.code;
                  
                  if (tempQr) {
                    console.log(`[Evolution API] ✅ QR code obtained on post-recreate attempt ${connectAttempt}!`);
                    qrObtainedAfterRecreate = true;
                    // Return success immediately
                    return new Response(
                      JSON.stringify({
                        success: true,
                        qrCode: tempQr,
                        status: "awaiting_qr",
                        pairingCode: tempData.pairingCode || null,
                      }),
                      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
                    );
                  }
                  
                  // Check if already connected
                  const tempState = tempData.state || tempData.status || tempData.instance?.state;
                  if (tempState === "open" || tempState === "connected") {
                    console.log(`[Evolution API] ✅ Instance connected after recreate!`);
                    qrObtainedAfterRecreate = true;
                    return new Response(
                      JSON.stringify({
                        success: true,
                        qrCode: null,
                        status: "connected",
                        message: "Instância reconectada com sucesso",
                      }),
                      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
                    );
                  }
                  
                  // {"count":0} or no QR - wait and retry
                  if (connectAttempt < 3) {
                    console.log(`[Evolution API] No QR yet (attempt ${connectAttempt}), waiting 5s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                  }
                } else {
                  console.warn(`[Evolution API] Post-recreate connect attempt ${connectAttempt} failed: ${qrResponse.status}`);
                  if (connectAttempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                  }
                }
              }
              
              // All 3 attempts failed - check connectionState before giving up
              try {
                const stateCheck = await fetchWithTimeout(
                  `${apiUrl}/instance/connectionState/${instance.instance_name}`,
                  { method: "GET", headers: { apikey: instance.api_key || "", "Content-Type": "application/json" } },
                  10000
                );
                if (stateCheck.ok) {
                  const stateInfo = await stateCheck.json();
                  const currentState = stateInfo?.instance?.state || stateInfo?.state || "unknown";
                  console.log(`[Evolution API] Post-recreate connectionState: ${currentState}`);
                  
                  if (currentState === "connecting") {
                    console.log(`[Evolution API] Instance is still initializing after recreate - returning informative message`);
                    return new Response(
                      JSON.stringify({
                        success: false,
                        error: "Instância recriada com sucesso, mas o WhatsApp ainda está inicializando. Aguarde 30 segundos e clique em 'Gerar QR Code' novamente.",
                        retryable: true,
                      }),
                      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                    );
                  }
                }
              } catch (stateErr) {
                console.warn(`[Evolution API] Post-recreate connectionState check error:`, stateErr);
              }
              
              // Flag to prevent corrupted session cascade
              console.log(`[Evolution API] Post-recreate: all connect attempts returned no QR. Setting wasRecreatedFrom404 flag.`);
              wasRecreatedFrom404 = true;
              
              // Re-fetch last qrResponse for downstream processing (won't have QR but needed for flow)
              qrResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
                method: "GET",
                headers: {
                  apikey: instance.api_key || "",
                  "Content-Type": "application/json",
                },
              });
            } else {
              const createError = await safeReadResponseText(createResponse);
              console.error(`[Evolution API] Failed to recreate instance:`, createError);
              
              // If 403 "name in use", try logout+connect with retries
              if (createResponse.status === 403) {
                console.log(`[Evolution API] 403 on create - trying logout+connect fallback with retries...`);
                try {
                  await fetchWithTimeout(`${apiUrl}/instance/logout/${instance.instance_name}`, {
                    method: "DELETE",
                    headers: { apikey: instance.api_key || "", "Content-Type": "application/json" },
                  }, 10000).catch(() => {});
                  
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  
                  let fb404Succeeded = false;
                  for (let fbAttempt = 1; fbAttempt <= 3; fbAttempt++) {
                    console.log(`[Evolution API] 404->403 fallback connect attempt ${fbAttempt}...`);
                    const fallbackConnect = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
                      method: "GET",
                      headers: { apikey: instance.api_key || "", "Content-Type": "application/json" },
                    });
                    
                    if (fallbackConnect.ok) {
                      const fbData = await fallbackConnect.json();
                      console.log(`[Evolution API] 404->403 fallback attempt ${fbAttempt} response:`, JSON.stringify(fbData).slice(0, 300));
                      const fbQr = fbData.base64 || fbData.qrcode?.base64 || fbData.qrcode || fbData.code || null;
                      
                      if (fbQr) {
                        console.log(`[Evolution API] ✅ 404->403 fallback succeeded on attempt ${fbAttempt} - QR obtained!`);
                        wasRecreatedFrom404 = true;
                        // Build a synthetic response-like object for downstream
                        qrResponse = new Response(JSON.stringify(fbData), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                        fb404Succeeded = true;
                        break;
                      }
                    }
                    
                    if (fbAttempt < 3) {
                      await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                  }
                  
                  if (!fb404Succeeded) {
                    // Check connectionState
                    try {
                      const stResp = await fetchWithTimeout(`${apiUrl}/instance/connectionState/${instance.instance_name}`, {
                        method: "GET",
                        headers: { apikey: instance.api_key || "", "Content-Type": "application/json" },
                      });
                      if (stResp.ok) {
                        const stData = await stResp.json();
                        const st = stData.instance?.state || stData.state || "unknown";
                        console.log(`[Evolution API] 404->403 fallback final connectionState: ${st}`);
                        if (st === "connecting") {
                          wasRecreatedFrom404 = true;
                          qrResponse = new Response(JSON.stringify({ count: 0 }), {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                          });
                        } else {
                          throw new Error("Instância existe no servidor mas não gera QR. Aguarde 1 minuto e tente novamente.");
                        }
                      } else {
                        throw new Error("Instância existe no servidor mas não gera QR. Aguarde 1 minuto e tente novamente.");
                      }
                    } catch (stErr: any) {
                      throw new Error(stErr.message || "Instância existe no servidor mas não gera QR. Aguarde 1 minuto e tente novamente.");
                    }
                  }
                } catch (fallbackErr: any) {
                  throw new Error(fallbackErr.message || "Não foi possível recriar a instância.");
                }
              } else {
                throw new Error("Não foi possível recriar a instância no servidor Evolution. Tente novamente.");
              }
            }
          } catch (recreateError: any) {
            console.error(`[Evolution API] Recreate error:`, recreateError);
            throw new Error(recreateError.message || "Erro ao recriar instância");
          }
        }

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
        console.log(`[Evolution API] QR Code extracted: ${!!qrCode}, Status: ${status}, Raw keys: ${Object.keys(qrData).join(',')}`);

        // CORRUPTED SESSION DETECTION: {"count":0} or no QR + not connected
        // This means the Baileys session may be corrupted OR the instance is actually connected
        const isCorruptedSession = !qrCode && 
          status !== "open" && status !== "connected" &&
          (qrData.count === 0 || (Object.keys(qrData).length <= 2 && !qrData.base64 && !qrData.qrcode));

        if (isCorruptedSession) {
          // GUARD: If we just recreated from 404, don't cascade into another recovery cycle
          if (wasRecreatedFrom404) {
            console.log(`[Evolution API] ⚠️ Skipping corrupted session recovery - instance was just recreated from 404. Baileys still initializing.`);
            return new Response(
              JSON.stringify({
                success: false,
                error: "A instância foi recriada com sucesso, mas o WhatsApp ainda está inicializando a sessão. Aguarde 30 segundos e clique em 'Gerar QR Code' novamente.",
                retryable: true,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          // GUARD: Check if another get_qrcode call recently ran recovery (race condition prevention)
          const { data: freshInstance } = await supabaseClient
            .from("whatsapp_instances")
            .select("status, awaiting_qr, updated_at")
            .eq("id", body.instanceId)
            .single();

          const updatedAgo = freshInstance?.updated_at 
            ? Date.now() - new Date(freshInstance.updated_at).getTime() 
            : Infinity;

          if (freshInstance?.awaiting_qr === true && updatedAgo < 60000) {
            console.log(`[Evolution API] Recovery already in progress (updated ${updatedAgo}ms ago). Skipping destructive recovery.`);
            // Try one simple connect to see if QR is available now
            const recoveryHeadersQuick = {
              apikey: instance.api_key || "",
              "Content-Type": "application/json",
            };
            try {
              const quickResp = await fetchWithTimeout(
                `${apiUrl}/instance/connect/${instance.instance_name}`,
                { method: "GET", headers: recoveryHeadersQuick }, 8000
              );
              if (quickResp.ok) {
                const quickData = await quickResp.json();
                const quickQr = quickData?.base64 || quickData?.qrcode?.base64 || quickData?.qrcode || quickData?.code || null;
                if (quickQr) {
                  console.log(`[Evolution API] Quick connect got QR while recovery in progress!`);
                  await supabaseClient
                    .from("whatsapp_instances")
                    .update({ status: "awaiting_qr", awaiting_qr: true, updated_at: new Date().toISOString() })
                    .eq("id", body.instanceId);
                  return new Response(
                    JSON.stringify({ success: true, qrCode: quickQr, status: "awaiting_qr" }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                  );
                }
              }
            } catch (_quickErr) {
              // Ignore - just return retryable
            }
            
            return new Response(
              JSON.stringify({
                success: false,
                error: "Recuperação em andamento. Aguarde 10 segundos...",
                retryable: true,
                connectionState: "recovering",
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          // Mark instance as recovering BEFORE starting Level 1
          await supabaseClient
            .from("whatsapp_instances")
            .update({ awaiting_qr: true, updated_at: new Date().toISOString() })
            .eq("id", body.instanceId);
          
          console.log(`[Evolution API] 🔧 POSSIBLE CORRUPTED SESSION for ${instance.instance_name} - Response: ${JSON.stringify(qrData).slice(0, 200)}`);

          const recoveryHeaders = {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          };

          // v2.2.3 optimized
          const detectedApiVersion = "v2.2.3";

          // Helper to extract QR from connect response
          const extractQrFromResponse = (data: any): string | null => {
            return data?.base64 || data?.qrcode?.base64 || data?.qrcode || data?.code || null;
          };

          // Helper to return QR success response
          const returnQrSuccess = async (recoveredQr: string, level: string) => {
            console.log(`[Evolution API] ✅ ${level} recovery successful - QR code obtained!`);
            await supabaseClient
              .from("whatsapp_instances")
              .update({ 
                status: "awaiting_qr", 
                awaiting_qr: true,
                manual_disconnect: false,
                reconnect_attempts_count: 0,
                updated_at: new Date().toISOString() 
              })
              .eq("id", body.instanceId);
            return new Response(
              JSON.stringify({
                success: true, qrCode: recoveredQr, status: "awaiting_qr",
                message: "Sessão recuperada - escaneie o QR code", recovered: true,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          };

          // Helper to return connected success
          const returnConnectedSuccess = async (message: string) => {
            await supabaseClient
              .from("whatsapp_instances")
              .update({ 
                status: "connected", awaiting_qr: false, manual_disconnect: false,
                reconnect_attempts_count: 0, updated_at: new Date().toISOString() 
              })
              .eq("id", body.instanceId);
            return new Response(
              JSON.stringify({ success: true, qrCode: null, status: "connected", message }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          };

          try {
            // === STEP 0: Check connectionState ===
            let currentState = "unknown";
            try {
              console.log(`[Evolution API] Recovery Step 0: Checking connectionState for ${instance.instance_name}`);
              const stateResp = await fetchWithTimeout(
                `${apiUrl}/instance/connectionState/${instance.instance_name}`,
                { method: "GET", headers: recoveryHeaders },
                8000
              );

              if (stateResp.ok) {
                const stateData = await stateResp.json();
                currentState = stateData?.instance?.state || stateData?.state || stateData?.connectionStatus || "unknown";
                console.log(`[Evolution API] connectionState: ${currentState} (raw: ${JSON.stringify(stateData).slice(0, 300)})`);

                if (currentState === "open" || currentState === "connected") {
                  console.log(`[Evolution API] ✅ Instance is actually CONNECTED!`);
                  const phone = extractPhoneFromPayload(stateData);
                  if (phone) {
                    await supabaseClient.from("whatsapp_instances").update({ phone_number: phone }).eq("id", body.instanceId);
                  } else {
                    const fetchedPhone = await fetchConnectedPhoneNumber(apiUrl, instance.api_key || "", instance.instance_name);
                    if (fetchedPhone) {
                      await supabaseClient.from("whatsapp_instances").update({ phone_number: fetchedPhone }).eq("id", body.instanceId);
                    }
                  }
                  return await returnConnectedSuccess("Instância já está conectada");
                }

                // If Baileys is still initializing ("connecting"), check if awaiting QR
                if (currentState === "connecting") {
                  const { data: dbInstance } = await supabaseClient
                    .from("whatsapp_instances")
                    .select("awaiting_qr, status")
                    .eq("id", body.instanceId)
                    .single();

                  const shouldForceRecovery = dbInstance?.awaiting_qr === true || dbInstance?.status === 'awaiting_qr';

                  if (shouldForceRecovery) {
                    console.log(`[Evolution API] ⏳ Instance is "connecting" + awaiting_qr/status=awaiting_qr. Proceeding to Level 1 recovery to force QR generation.`);
                    // Nao retorna - continua para o Level 1 recovery abaixo
                  } else {
                    console.log(`[Evolution API] ⏳ Instance is "connecting" - Baileys still initializing. Returning retryable.`);
                    return new Response(
                      JSON.stringify({
                        success: false,
                        error: "WhatsApp está inicializando a conexão. Aguarde alguns segundos...",
                        retryable: true,
                        connectionState: "connecting",
                      }),
                      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                    );
                  }
                }
              }
            } catch (stateErr: any) {
              console.warn(`[Evolution API] connectionState check error (non-fatal):`, stateErr?.message);
            }

            // ====================================================================
            // LEVEL 1 - Simple retry connect (NO logout, NO delete)
            // 3 attempts x 3s delay = ~12s total
            // ====================================================================
            console.log(`[Evolution API] 🔄 LEVEL 1: Simple retry connect for ${instance.instance_name} (3 attempts, 5s delay)`);
            
            for (let l1 = 1; l1 <= 3; l1++) {
              console.log(`[Evolution API] Level 1 - connect attempt ${l1}/3...`);
              try {
                const l1Resp = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
                  method: "GET",
                  headers: recoveryHeaders,
                }, 8000);

                if (l1Resp.ok) {
                  const l1Data = await l1Resp.json();
                  console.log(`[Evolution API] Level 1 attempt ${l1} response:`, JSON.stringify(l1Data).slice(0, 300));
                  
                  const l1State = l1Data?.instance?.state || l1Data?.state || null;
                  if (l1State === "open" || l1State === "connected") {
                    return await returnConnectedSuccess(`Instância reconectada na tentativa ${l1}`);
                  }

                  const l1Qr = extractQrFromResponse(l1Data);
                  if (l1Qr) {
                    return await returnQrSuccess(l1Qr, "Level 1");
                  }
                }
              } catch (l1Err: any) {
                console.warn(`[Evolution API] Level 1 attempt ${l1} error:`, l1Err?.message);
              }
              
              if (l1 < 3) {
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }

            // Post-Level1: Check if state changed
            try {
              const postL1State = await fetchWithTimeout(
                `${apiUrl}/instance/connectionState/${instance.instance_name}`,
                { method: "GET", headers: recoveryHeaders }, 8000
              );
              if (postL1State.ok) {
                const postL1Data = await postL1State.json();
                const postL1RealState = postL1Data?.instance?.state || postL1Data?.state || "unknown";
                console.log(`[Evolution API] Post-Level1 connectionState: ${postL1RealState}`);
                if (postL1RealState === "open" || postL1RealState === "connected") {
                  return await returnConnectedSuccess("Instância reconectada após Level 1");
                }
                if (postL1RealState === "connecting") {
                  // Check if we should force Level 2 instead of returning retryable
                  const { data: postL1Db } = await supabaseClient
                    .from("whatsapp_instances")
                    .select("awaiting_qr, status")
                    .eq("id", body.instanceId)
                    .single();

                  const shouldForceLevel2 = postL1Db?.awaiting_qr === true || postL1Db?.status === 'awaiting_qr';

                  if (shouldForceLevel2) {
                    console.log(`[Evolution API] ⏳ Still "connecting" after Level 1 + awaiting_qr=true. Forcing Level 2 (logout + connect).`);
                    // NAO retorna - continua para Level 2 abaixo
                  } else {
                    console.log(`[Evolution API] ⏳ Still "connecting" after Level 1 - returning retryable`);
                    return new Response(
                      JSON.stringify({
                        success: false,
                        error: "WhatsApp está inicializando. Aguarde e tente novamente em 10 segundos.",
                        retryable: true,
                        connectionState: "connecting",
                      }),
                      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                    );
                  }
                }
              }
            } catch (_) {}

            // ====================================================================
            // LEVEL 2 - Logout + Delete + Create + Connect (full session cleanup)
            // Forces Evolution API to remove corrupted session files from disk
            // ====================================================================
            console.log(`[Evolution API] 🔄 LEVEL 2: Logout + Delete + Recreate for ${instance.instance_name}`);
            
            // Step 1: Logout (non-fatal)
            try {
              const logoutResp = await fetchWithTimeout(`${apiUrl}/instance/logout/${instance.instance_name}`, {
                method: "DELETE",
                headers: recoveryHeaders,
              }, 8000);
              console.log(`[Evolution API] Level 2 - Logout response: ${logoutResp.status}`);
            } catch (e) {
              console.warn(`[Evolution API] Level 2 - Logout failed (non-fatal):`, e);
            }

            // Step 2: Delete instance to force removal of session files from disk
            try {
              const deleteResp = await fetchWithTimeout(`${apiUrl}/instance/delete/${instance.instance_name}`, {
                method: "DELETE",
                headers: recoveryHeaders,
              }, 8000);
              console.log(`[Evolution API] Level 2 - Delete response: ${deleteResp.status}`);
            } catch (e) {
              console.warn(`[Evolution API] Level 2 - Delete failed (non-fatal):`, e);
            }

            // Step 3: Wait for Evolution API to clean up
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 4: Recreate instance with webhook config
            let l2CreateQr: string | null = null;
            try {
              const createResp = await fetchWithTimeout(`${apiUrl}/instance/create`, {
                method: "POST",
                headers: recoveryHeaders,
                body: JSON.stringify({
                  instanceName: instance.instance_name,
                  token: instance.api_key,
                  qrcode: true,
                  integration: "WHATSAPP-BAILEYS",
                  webhook: buildWebhookConfig(WEBHOOK_URL),
                }),
              }, 30000);
              
              if (createResp.ok) {
                const createData = await createResp.json();
                console.log(`[Evolution API] Level 2 - Instance recreated. Keys: ${Object.keys(createData)}`);
                l2CreateQr = extractQrFromResponse(createData);
                if (!l2CreateQr) {
                  // Try nested qrcode object
                  l2CreateQr = createData?.qrcode?.base64 || createData?.qrcode?.qrcode || null;
                }
                if (l2CreateQr) {
                  console.log(`[Evolution API] ✅ Level 2 - QR extracted from create response!`);
                }
              } else {
                console.warn(`[Evolution API] Level 2 - Create failed: ${createResp.status}`);
              }
            } catch (e: any) {
              console.warn(`[Evolution API] Level 2 - Create error:`, e?.message);
            }

            // Step 5: Configure settings (groupsIgnore=true)
            try {
              await fetchWithTimeout(`${apiUrl}/settings/set/${instance.instance_name}`, {
                method: "POST",
                headers: recoveryHeaders,
                body: JSON.stringify({
                  rejectCall: false,
                  msgCall: "",
                  groupsIgnore: true,
                  alwaysOnline: false,
                  readMessages: false,
                  readStatus: false,
                  syncFullHistory: false,
                }),
              }, 8000);
              console.log(`[Evolution API] Level 2 - Settings configured`);
            } catch (e) {
              console.warn(`[Evolution API] Level 2 - Settings config failed (non-fatal):`, e);
            }

            // Step 6: Configure webhook
            try {
              await fetchWithTimeout(`${apiUrl}/webhook/set/${instance.instance_name}`, {
                method: "POST",
                headers: recoveryHeaders,
                body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
              }, 8000);
              console.log(`[Evolution API] Level 2 - Webhook configured`);
            } catch (e) {
              console.warn(`[Evolution API] Level 2 - Webhook config failed (non-fatal):`, e);
            }

            // If QR was extracted from create, return immediately
            if (l2CreateQr) {
              return await returnQrSuccess(l2CreateQr, "Level 2 (create)");
            }

            // Step 7: Wait then try connect to get QR
            await new Promise(resolve => setTimeout(resolve, 2000));

            for (let l2 = 1; l2 <= 2; l2++) {
              console.log(`[Evolution API] Level 2 - connect attempt ${l2}/2...`);
              try {
                const l2Resp = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
                  method: "GET",
                  headers: recoveryHeaders,
                }, 8000);

                if (l2Resp.ok) {
                  const l2Data = await l2Resp.json();
                  console.log(`[Evolution API] Level 2 attempt ${l2} response:`, JSON.stringify(l2Data).slice(0, 300));
                  
                  const l2State = l2Data?.instance?.state || l2Data?.state || null;
                  if (l2State === "open" || l2State === "connected") {
                    return await returnConnectedSuccess("Instância reconectada no Level 2");
                  }

                  const l2Qr = extractQrFromResponse(l2Data);
                  if (l2Qr) {
                    return await returnQrSuccess(l2Qr, "Level 2");
                  }
                }
              } catch (l2Err: any) {
                console.warn(`[Evolution API] Level 2 attempt ${l2} error:`, l2Err?.message);
              }
              if (l2 < 2) {
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }

            // All levels exhausted - return retryable instead of hard error
            console.warn(`[Evolution API] Levels 1-2 exhausted without QR. API version: ${detectedApiVersion}. Returning retryable.`);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Não foi possível gerar o QR code agora. Aguarde 15 segundos e tente novamente.",
                retryable: true,
                connectionState: currentState,
                apiVersion: detectedApiVersion,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          } catch (recoveryError: any) {
            console.error(`[Evolution API] Recovery failed:`, recoveryError);
            throw new Error(recoveryError.message || `Sessão corrompida. Tentativa de recuperação falhou.`);
          }
        }

        // Update instance status based on state
        if (status === "open" || status === "connected") {
          // Connected - reset all disconnect/waiting flags
          await supabaseClient
            .from("whatsapp_instances")
            .update({ 
              status: "connected", 
              awaiting_qr: false,
              manual_disconnect: false,
              updated_at: new Date().toISOString() 
            })
            .eq("id", body.instanceId);
        } else if (qrCode) {
          // QR code returned - mark as awaiting QR scan
          // This prevents auto-reconnect from trying to reconnect while user is viewing QR
          await supabaseClient
            .from("whatsapp_instances")
            .update({ 
              status: "awaiting_qr", 
              awaiting_qr: true,
              manual_disconnect: false, // Reset manual disconnect since user is trying to connect
              updated_at: new Date().toISOString() 
            })
            .eq("id", body.instanceId);
          
          // Reassociate orphan clients/conversations
          console.log(`[Evolution API] Reassociating orphan records for instance: ${body.instanceId}`);
          const { data: reassocResult, error: reassocError } = await supabaseClient
            .rpc('reassociate_orphan_records', { _instance_id: body.instanceId });
          
          if (reassocError) {
            console.error(`[Evolution API] Failed to reassociate orphans:`, reassocError);
          } else if (reassocResult) {
            console.log(`[Evolution API] Orphan reassociation result:`, reassocResult);
          }
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

        // ── UAZAPI PROVIDER ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          const statusResult = await provider.getStatus(config);

          let dbStatus: string = statusResult.status;
          const updatePayload: Record<string, unknown> = { status: dbStatus, updated_at: new Date().toISOString() };
          if (dbStatus === 'connected') { updatePayload.awaiting_qr = false; }
          if (statusResult.phoneNumber) { updatePayload.phone_number = statusResult.phoneNumber; }

          const { data: updatedInstance } = await supabaseClient.from("whatsapp_instances")
            .update(updatePayload).eq("id", body.instanceId).select().single();

          return new Response(
            JSON.stringify({ success: true, status: dbStatus, instance: updatedInstance }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── EVOLUTION PROVIDER ──
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

        // IMPORTANT: keep awaiting_qr stable.
        // The frontend polls get_status frequently; if we downgrade awaiting_qr to connecting/disconnected,
        // the UI flips back to "Conectando" and the system may look like it's stuck in a reconnection loop.
        const dbIsAwaitingQr = instance.awaiting_qr === true || instance.status === "awaiting_qr";

        let dbStatus: "connected" | "connecting" | "disconnected" | "awaiting_qr" = "disconnected";

        if (state === "open" || state === "connected") {
          dbStatus = "connected";
        } else if (state === "qr") {
          dbStatus = "awaiting_qr";
        } else if (dbIsAwaitingQr) {
          // Preserve awaiting_qr when DB says we are waiting for a scan
          dbStatus = "awaiting_qr";
        } else if (state === "connecting") {
          dbStatus = "connecting";
        }

        // Fetch and store phone number when connected using enhanced method
        let phoneNumberToSave: string | null = null;
        let duplicateWarning: { id: string; instance_name: string; law_firm_id: string } | null = null;
        if (dbStatus === "connected" && !instance.phone_number && instance.api_key) {
          try {
            const result = await fetchPhoneNumberEnhanced(apiUrl, instance.api_key, instance.instance_name);
            phoneNumberToSave = result.phone;
            console.log(`[Evolution API] Phone fetch (get_status): ${phoneNumberToSave ? `found ${phoneNumberToSave.slice(0,4)}***` : result.reason}`);
            
            // Check for duplicate - log warning but still save (webhook will auto-disconnect)
            if (phoneNumberToSave) {
              duplicateWarning = await checkPhoneNumberDuplicate(supabaseClient, phoneNumberToSave, body.instanceId);
              if (duplicateWarning) {
                console.log(`[Evolution API] ⚠️ DUPLICATE PHONE on get_status: ${phoneNumberToSave} already on ${duplicateWarning.instance_name}`);
              }
            }
          } catch (e) {
            console.log("[Evolution API] Failed to fetch phone number (non-fatal):", e);
          }
        }

        const updatePayload: Record<string, unknown> = {
          status: dbStatus,
          updated_at: new Date().toISOString(),
        };
        if (phoneNumberToSave) updatePayload.phone_number = phoneNumberToSave;

        // Only mutate flags when we have a definitive state
        if (dbStatus === "connected") {
          updatePayload.awaiting_qr = false;
          updatePayload.manual_disconnect = false;
        } else if (state === "qr") {
          updatePayload.awaiting_qr = true;
          updatePayload.manual_disconnect = false;
        }

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
            duplicateWarning: duplicateWarning ? {
              message: `Número ${phoneNumberToSave} já está conectado em outra instância (${duplicateWarning.instance_name})`,
              existingInstance: duplicateWarning,
            } : undefined,
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

        // ── UAZAPI PROVIDER ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          await provider.deleteInstance(config);

          // NULL + tracking for clients/conversations (same as Evolution)
          await supabaseClient.from("clients")
            .update({ whatsapp_instance_id: null, last_whatsapp_instance_id: body.instanceId } as any)
            .eq("whatsapp_instance_id", body.instanceId).eq("law_firm_id", lawFirmId);

          await supabaseClient.from("conversations")
            .update({ whatsapp_instance_id: null, last_whatsapp_instance_id: body.instanceId } as any)
            .eq("whatsapp_instance_id", body.instanceId).eq("law_firm_id", lawFirmId);

          await supabaseClient.from("whatsapp_instances").delete().eq("id", body.instanceId).eq("law_firm_id", lawFirmId);

          return new Response(
            JSON.stringify({ success: true, message: "Instance deleted" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── EVOLUTION PROVIDER ──
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

        // ── Simple NULL + tracking (no automatic reassignment) ──
        // Set whatsapp_instance_id = NULL and track last_whatsapp_instance_id
        // Handle uniqueness conflicts (23505) by merging only conflicting records

        console.log(`[Evolution API] Setting NULL for clients/conversations of instance: ${body.instanceId}`);

        // 1. Try batch update for clients
        const { error: clientsError } = await supabaseClient
          .from("clients")
          .update({ 
            whatsapp_instance_id: null, 
            last_whatsapp_instance_id: body.instanceId 
          } as any)
          .eq("whatsapp_instance_id", body.instanceId)
          .eq("law_firm_id", lawFirmId);

        if (clientsError) {
          if (clientsError.code === "23505") {
            console.log(`[Evolution API] Uniqueness conflict on clients, resolving individually...`);
            
            // Fetch clients from this instance
            const { data: conflictClients } = await supabaseClient
              .from("clients")
              .select("id, phone")
              .eq("whatsapp_instance_id", body.instanceId)
              .eq("law_firm_id", lawFirmId);

            if (conflictClients) {
              for (const client of conflictClients) {
                // Try individual update
                const { error: indivError } = await supabaseClient
                  .from("clients")
                  .update({ whatsapp_instance_id: null, last_whatsapp_instance_id: body.instanceId } as any)
                  .eq("id", client.id);

                if (indivError?.code === "23505") {
                  // This client has a duplicate with NULL instance - merge into existing
                  const { data: existing } = await supabaseClient
                    .from("clients")
                    .select("id")
                    .eq("law_firm_id", lawFirmId)
                    .eq("phone", client.phone)
                    .is("whatsapp_instance_id", null)
                    .neq("id", client.id)
                    .limit(1)
                    .single();

                  if (existing) {
                    console.log(`[Evolution API] Merging duplicate client ${client.id} -> ${existing.id}`);
                    // Move related records to surviving client
                    await supabaseClient.from("conversations").update({ client_id: existing.id }).eq("client_id", client.id);
                    await supabaseClient.from("client_tags").update({ client_id: existing.id }).eq("client_id", client.id);
                    await supabaseClient.from("client_actions").update({ client_id: existing.id }).eq("client_id", client.id);
                    await supabaseClient.from("client_memories").update({ client_id: existing.id }).eq("client_id", client.id);
                    // Delete the duplicate
                    await supabaseClient.from("clients").delete().eq("id", client.id);
                  }
                }
              }
            }
          } else {
            console.error(`[Evolution API] Failed to update clients:`, clientsError);
          }
        }

        // 2. Same for conversations
        const { error: convsError } = await supabaseClient
          .from("conversations")
          .update({
            whatsapp_instance_id: null,
            last_whatsapp_instance_id: body.instanceId
          } as any)
          .eq("whatsapp_instance_id", body.instanceId)
          .eq("law_firm_id", lawFirmId);

        if (convsError) {
          if (convsError.code === "23505") {
            console.log(`[Evolution API] Uniqueness conflict on conversations, resolving individually...`);
            
            const { data: conflictConvs } = await supabaseClient
              .from("conversations")
              .select("id, remote_jid")
              .eq("whatsapp_instance_id", body.instanceId)
              .eq("law_firm_id", lawFirmId);

            if (conflictConvs) {
              for (const conv of conflictConvs) {
                const { error: indivConvError } = await supabaseClient
                  .from("conversations")
                  .update({ whatsapp_instance_id: null, last_whatsapp_instance_id: body.instanceId } as any)
                  .eq("id", conv.id);

                if (indivConvError?.code === "23505") {
                  // Merge into existing conversation with same remote_jid + NULL instance
                  const { data: existingConv } = await supabaseClient
                    .from("conversations")
                    .select("id")
                    .eq("law_firm_id", lawFirmId)
                    .eq("remote_jid", conv.remote_jid)
                    .is("whatsapp_instance_id", null)
                    .neq("id", conv.id)
                    .limit(1)
                    .single();

                  if (existingConv) {
                    console.log(`[Evolution API] Merging duplicate conversation ${conv.id} -> ${existingConv.id}`);
                    await supabaseClient.from("messages").update({ conversation_id: existingConv.id }).eq("conversation_id", conv.id);
                    await supabaseClient.from("conversations").delete().eq("id", conv.id);
                  }
                }
              }
            }
          } else {
            console.error(`[Evolution API] Failed to update conversations:`, convsError);
          }
        }

        console.log(`[Evolution API] Clients and conversations set to NULL with tracking`);

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

        // ── UAZAPI PROVIDER ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          const UAZAPI_WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") || "";
          const uazapiWebhookUrl = UAZAPI_WEBHOOK_TOKEN
            ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook?token=${UAZAPI_WEBHOOK_TOKEN}`
            : `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook`;
          await provider.configureWebhook(config, { webhookUrl: uazapiWebhookUrl });
          return new Response(JSON.stringify({ success: true, message: "Webhook configured successfully" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // ── EVOLUTION PROVIDER ──
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

        // ── UAZAPI PROVIDER: no equivalent settings ──
        if (isUazapi(instance)) {
          return new Response(JSON.stringify({ success: true, settings: { rejectCall: false } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // ── EVOLUTION PROVIDER ──
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
        console.log(`[Evolution API] Raw settings response:`, JSON.stringify(settingsData));
        const rejectCall = extractRejectCallFlag(settingsData);
        console.log(`[Evolution API] Extracted rejectCall:`, rejectCall);

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

        // ── UAZAPI PROVIDER: no equivalent settings, just return success ──
        if (isUazapi(instance)) {
          return new Response(JSON.stringify({ success: true, settings: { rejectCall: body.rejectCall } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // ── EVOLUTION PROVIDER ──
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

        // Use isGlobalAdmin to allow global admins to refresh any instance
        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId, isGlobalAdmin);

        // ── UAZAPI PROVIDER ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          const statusResult = await provider.getStatus(config);

          let dbStatus = statusResult.status;
          const refreshUpdatePayload: Record<string, unknown> = { status: dbStatus, updated_at: new Date().toISOString() };
          if (dbStatus === 'connected') { refreshUpdatePayload.disconnected_since = null; refreshUpdatePayload.awaiting_qr = false; }
          if (statusResult.phoneNumber) { refreshUpdatePayload.phone_number = statusResult.phoneNumber; }

          const { data: updatedInstance } = await supabaseClient.from("whatsapp_instances")
            .update(refreshUpdatePayload).eq("id", body.instanceId).select().single();

          return new Response(
            JSON.stringify({ success: true, status: dbStatus, instance: updatedInstance }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── EVOLUTION PROVIDER ──
        const apiUrl = normalizeUrl(instance.api_url);

        let dbStatus = "disconnected";
        let evolutionState = "unknown";
        let sourceEndpoint = "none";

        // PRIMARY: Use fetchInstances (same endpoint as Evolution Manager UI)
        try {
          const fetchUrl = `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instance_name)}`;
          console.log(`[Evolution API] Calling fetchInstances: ${fetchUrl}`);
          const fetchResponse = await fetchWithTimeout(fetchUrl, {
            method: "GET",
            headers: { apikey: instance.api_key || "", "Content-Type": "application/json" },
          });

          if (fetchResponse.ok) {
            const fetchData = await fetchResponse.json();
            console.log(`[Evolution API] fetchInstances raw response:`, JSON.stringify(fetchData).slice(0, 500));

            // Parse response (can be array or object)
            const instances = Array.isArray(fetchData) ? fetchData : fetchData?.instances || [fetchData];
            const found = instances.find((i: any) => i?.instanceName === instance.instance_name || i?.name === instance.instance_name) || instances[0];

            if (found) {
              // connectionStatus is what Evolution Manager UI uses
              evolutionState = found.connectionStatus || found.status || found.state || "unknown";
              sourceEndpoint = "fetchInstances";
              console.log(`[Evolution API] fetchInstances parsed: connectionStatus=${found.connectionStatus}, status=${found.status}, state=${found.state}, final=${evolutionState}`);
            }
          } else {
            console.warn(`[Evolution API] fetchInstances returned ${fetchResponse.status}`);
          }
        } catch (e) {
          console.warn(`[Evolution API] fetchInstances failed, trying connectionState:`, e.message);
        }

        // FALLBACK: connectionState endpoint (known to return stale data in v2.3+)
        if (sourceEndpoint === "none") {
          try {
            const stateResponse = await fetchWithTimeout(
              `${apiUrl}/instance/connectionState/${instance.instance_name}`,
              { method: "GET", headers: { apikey: instance.api_key || "", "Content-Type": "application/json" } }
            );
            if (stateResponse.ok) {
              const stateData = await stateResponse.json();
              console.log(`[Evolution API] connectionState raw:`, JSON.stringify(stateData));
              evolutionState = stateData.state || stateData.instance?.state || "unknown";
              sourceEndpoint = "connectionState";
            }
          } catch (e) {
            console.error(`[Evolution API] Both endpoints failed:`, e.message);
          }
        }

        // Map Evolution state to our DB status
        if (evolutionState === "open" || evolutionState === "connected") {
          dbStatus = "connected";
        } else if (evolutionState === "connecting" || evolutionState === "qr") {
          dbStatus = "connecting";
        } else if (evolutionState === "close" || evolutionState === "closed") {
          dbStatus = "disconnected";
        }

        // Build update payload with proper flag cleanup
        const refreshUpdatePayload: Record<string, unknown> = {
          status: dbStatus,
          updated_at: new Date().toISOString(),
        };

        if (dbStatus === "connected") {
          refreshUpdatePayload.disconnected_since = null;
          refreshUpdatePayload.awaiting_qr = false;
          refreshUpdatePayload.reconnect_attempts_count = 0;
        } else if (dbStatus === "disconnected") {
          if (!instance.disconnected_since) {
            refreshUpdatePayload.disconnected_since = new Date().toISOString();
          }
        }

        const { data: updatedInstance } = await supabaseClient
          .from("whatsapp_instances")
          .update(refreshUpdatePayload)
          .eq("id", body.instanceId)
          .select()
          .single();

        console.log(`[Evolution API] Status refreshed: ${dbStatus} (source: ${sourceEndpoint}, evolution: ${evolutionState})`);

        return new Response(
          JSON.stringify({
            success: true,
            status: dbStatus,
            evolutionState,
            sourceEndpoint,
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

        // CRITICAL: Check for duplicate phone number before saving
        if (phoneNumber) {
          const duplicate = await checkPhoneNumberDuplicate(supabaseClient, phoneNumber, body.instanceId);
          if (duplicate) {
            console.log(`[Evolution API] ⚠️ DUPLICATE PHONE DETECTED: ${phoneNumber} already on instance ${duplicate.instance_name}`);
            return new Response(
              JSON.stringify({
                success: false,
                error: `Este número (${phoneNumber}) já está conectado em outra instância: ${duplicate.instance_name}. Desconecte a outra instância primeiro.`,
                duplicateInstance: duplicate,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

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

        // ── UAZAPI PROVIDER ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          const statusResult = await provider.getStatus(config);
          const phoneNumber = statusResult.phoneNumber || null;

          if (phoneNumber) {
            const duplicate = await checkPhoneNumberDuplicate(supabaseClient, phoneNumber, body.instanceId);
            if (duplicate) {
              return new Response(
                JSON.stringify({ success: false, error: `Este número (${phoneNumber}) já está conectado em outra instância: ${duplicate.instance_name}` }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            await supabaseClient.from("whatsapp_instances").update({ phone_number: phoneNumber, updated_at: new Date().toISOString() }).eq("id", body.instanceId);
          }

          return new Response(
            JSON.stringify({ success: true, phoneNumber }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── EVOLUTION PROVIDER ──
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
      // TENANT-LEVEL INSTANCE MANAGEMENT
      // =========================
      case "logout_instance": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Logging out (disconnecting) instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        // Call Evolution API logout endpoint (best effort)
        try {
          const logoutResponse = await fetchWithTimeout(`${apiUrl}/instance/logout/${instance.instance_name}`, {
            method: "DELETE",
            headers: {
              apikey: instance.api_key || "",
              "Content-Type": "application/json",
            },
          });
          console.log(`[Evolution API] Logout response: ${logoutResponse.status}`);
        } catch (e) {
          console.log(`[Evolution API] Logout API call failed (non-fatal):`, e);
        }

        // Update database status to disconnected and mark as manual disconnect
        // This prevents auto-reconnect from trying to reconnect this instance
        const { data: updatedInstance, error: updateError } = await supabaseClient
          .from("whatsapp_instances")
          .update({ 
            status: "disconnected", 
            manual_disconnect: true, // Mark as manual so auto-reconnect ignores it
            updated_at: new Date().toISOString() 
          })
          .eq("id", body.instanceId)
          .eq("law_firm_id", lawFirmId)
          .select()
          .single();

        if (updateError) {
          console.error(`[Evolution API] Failed to update instance status:`, updateError);
        }

        console.log(`[Evolution API] Instance disconnected successfully`);

        return new Response(JSON.stringify({ 
          success: true, 
          message: "Instance disconnected",
          instance: updatedInstance 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "restart_instance": {
        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        console.log(`[Evolution API] Restarting instance: ${body.instanceId}`);

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);

        // ── UAZAPI PROVIDER ──
        if (isUazapi(instance)) {
          const config = getProviderConfig(instance);
          const provider = getProvider(config);
          await provider.disconnect(config);

          const { data: updatedInstance } = await supabaseClient.from("whatsapp_instances")
            .update({ status: "disconnected", manual_disconnect: true, updated_at: new Date().toISOString() })
            .eq("id", body.instanceId).eq("law_firm_id", lawFirmId).select().single();

          return new Response(JSON.stringify({ success: true, message: "Instance disconnected", instance: updatedInstance }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // ── EVOLUTION PROVIDER ──
        const apiUrl = normalizeUrl(instance.api_url);

        // Call Evolution API restart endpoint
        const restartResponse = await fetchWithTimeout(`${apiUrl}/instance/restart/${instance.instance_name}`, {
          method: "PUT",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
        });

        console.log(`[Evolution API] Restart response: ${restartResponse.status}`);

        if (!restartResponse.ok) {
          const errorText = await safeReadResponseText(restartResponse);
          console.error(`[Evolution API] Restart failed:`, errorText);
          
          // If 404 - instance doesn't exist in Evolution API, try to recreate it
          if (restartResponse.status === 404) {
            console.log(`[Evolution API] Instance not found in Evolution, attempting to recreate...`);
            
            // Try to create the instance again
            try {
              const createResponse = await fetchWithTimeout(`${apiUrl}/instance/create`, {
                method: "POST",
                headers: {
                  apikey: instance.api_key || "",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  instanceName: instance.instance_name,
                  token: instance.api_key,
                  qrcode: true,
                  integration: "WHATSAPP-BAILEYS",
                  webhook: buildWebhookConfig(WEBHOOK_URL),
                }),
              }, 30000);
              
              if (createResponse.ok) {
                console.log(`[Evolution API] Instance recreated successfully, now getting QR code...`);
                
                // CRITICAL: Configure groupsIgnore=true to prevent AI from responding in groups
                try {
                  const settingsPayload = {
                    rejectCall: false,    // Required by Evolution API v2
                    msgCall: "",
                    groupsIgnore: true,
                    alwaysOnline: false,
                    readMessages: false,
                    readStatus: false,
                    syncFullHistory: false,
                  };
                  
                  const settingsResponse = await fetchWithTimeout(`${apiUrl}/settings/set/${instance.instance_name}`, {
                    method: "POST",
                    headers: {
                      apikey: instance.api_key || "",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(settingsPayload),
                  });
                  
                  if (settingsResponse.ok) {
                    console.log(`[Evolution API] Auto-configured groupsIgnore=true for recreated instance ${instance.instance_name}`);
                  } else {
                    console.warn(`[Evolution API] Failed to configure settings for recreated instance:`, await safeReadResponseText(settingsResponse));
                  }
                } catch (settingsError) {
                  console.warn(`[Evolution API] Error configuring settings for recreated instance:`, settingsError);
                }
                
                // Get QR code after recreation
                const qrResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance.instance_name}`, {
                  method: "GET",
                  headers: {
                    apikey: instance.api_key || "",
                    "Content-Type": "application/json",
                  },
                });
                
                if (qrResponse.ok) {
                  const qrData = await qrResponse.json();
                  const qrCode = qrData.base64 || qrData.qrcode?.base64;
                  
                  // Update DB to awaiting_qr
                  await supabaseClient
                    .from("whatsapp_instances")
                    .update({ 
                      status: "awaiting_qr", 
                      awaiting_qr: true,
                      updated_at: new Date().toISOString() 
                    })
                    .eq("id", body.instanceId);
                  
                  // Configure webhook for the recreated instance
                  await fetchWithTimeout(`${apiUrl}/webhook/set/${instance.instance_name}`, {
                    method: "POST",
                    headers: {
                      apikey: instance.api_key || "",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
                  }).catch(e => console.warn("[Evolution API] Webhook config failed:", e));
                  
                  return new Response(JSON.stringify({ 
                    success: true, 
                    message: "Instância recriada. Escaneie o QR Code.",
                    recreated: true,
                    qrCode,
                    needsQR: true,
                  }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }
              }
            } catch (recreateError) {
              console.error(`[Evolution API] Failed to recreate instance:`, recreateError);
            }
            
            // If recreation failed, mark as awaiting_qr and return helpful error
            await supabaseClient
              .from("whatsapp_instances")
              .update({ 
                status: "awaiting_qr", 
                awaiting_qr: true,
                updated_at: new Date().toISOString() 
              })
              .eq("id", body.instanceId);
            
            throw new Error("Instância não encontrada no servidor. Clique em 'Conectar' para recriar e gerar novo QR Code.");
          }
          
          throw new Error(simplifyEvolutionError(restartResponse.status, errorText));
        }

        // Update database timestamp
        await supabaseClient
          .from("whatsapp_instances")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", body.instanceId)
          .eq("law_firm_id", lawFirmId);

        console.log(`[Evolution API] Instance restarted successfully`);

        return new Response(JSON.stringify({ 
          success: true, 
          message: "Instance restarted" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        let conversationOrigin: string | null = null;

        // If we have a conversationId, get the remoteJid, instanceId, and ORIGIN from it
        if (conversationId && !targetRemoteJid) {
          const { data: conversation, error: convError } = await supabaseClient
            .from("conversations")
            .select("remote_jid, whatsapp_instance_id, origin")
            .eq("id", conversationId)
            .eq("law_firm_id", lawFirmId)
            .single();

          if (convError || !conversation) {
            console.error("[Evolution API] Conversation not found:", convError);
            throw new Error("Conversation not found");
          }

          targetRemoteJid = conversation.remote_jid;
          instanceId = conversation.whatsapp_instance_id;
          conversationOrigin = conversation.origin;
        }

        // CRITICAL: Check if this is a non-WhatsApp conversation (Widget, Tray, Site, Web)
        // These conversations MUST NOT be sent via WhatsApp - this is a defense-in-depth check
        // The frontend should never call this function for non-WhatsApp conversations
        const nonWhatsAppOrigins = ['WIDGET', 'TRAY', 'SITE', 'WEB'];
        const isNonWhatsAppConversation = conversationOrigin && nonWhatsAppOrigins.includes(conversationOrigin.toUpperCase());

        if (isNonWhatsAppConversation) {
          console.error(`[Evolution API] BLOCKED: Frontend incorrectly called Evolution API for ${conversationOrigin} conversation`, {
            conversationId,
            origin: conversationOrigin,
            lawFirmId,
            message: body.message?.substring(0, 50),
          });
          
          // Return error without saving anything - frontend should handle this via Widget route
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Canal incorreto: Esta conversa é do ${conversationOrigin}. Use o canal correto.`,
              errorCode: 'WRONG_CHANNEL',
              channel: conversationOrigin,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // Fallback: old WhatsApp conversations may not have whatsapp_instance_id set.
        // ONLY apply this fallback for WhatsApp conversations (origin is null or 'WHATSAPP')
        // If there's a connected instance for the law firm, use it and persist back to the conversation.
        if (!instanceId && conversationId && !isNonWhatsAppConversation) {
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
              is_pontual: body.isPontual || false, // Mark as pontual intervention
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
            // ========================================================================
            // CHECK FOR MEDIA TEMPLATE PATTERN: [IMAGE]url, [VIDEO]url, [AUDIO]url, [DOCUMENT]url
            // If found, send as media instead of text
            // ========================================================================
            // Regex that captures media type and URL (URL ends at whitespace or end of string)
            const MEDIA_PATTERN_RE = /\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n\]]+)/i;
            const messageContent = body.message || "";
            const mediaMatch = messageContent.match(MEDIA_PATTERN_RE);
            
            console.log(`[Evolution API] Checking for media pattern in message:`, { 
              hasMatch: !!mediaMatch,
              contentPreview: messageContent.substring(0, 100)
            });
            
            if (mediaMatch) {
              // Media template detected - send as native media
              const fullMatch = mediaMatch[0];
              const mediaTypeRaw = mediaMatch[1].toUpperCase() as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
              const mediaUrl = mediaMatch[2].trim();
              
              // Get text before and after the media pattern
              const matchIndex = messageContent.indexOf(fullMatch);
              const textBefore = messageContent.substring(0, matchIndex).trim();
              const textAfter = messageContent.substring(matchIndex + fullMatch.length).trim();
              
              // Caption is the first line after the media URL (or all remaining text if single line)
              const captionLines = textAfter.split('\n');
              const caption = captionLines[0]?.trim() || '';
              const remainingText = captionLines.slice(1).join('\n').trim();
              
              console.log(`[Evolution API] Media template detected: ${mediaTypeRaw}`, { 
                mediaUrl: mediaUrl.substring(0, 80),
                caption: caption.substring(0, 50),
                hasTextBefore: !!textBefore,
                hasRemainingText: !!remainingText
              });
              
              // 1. Send text before (if any)
              if (textBefore) {
                console.log(`[Evolution API] Sending text before media: "${textBefore.substring(0, 50)}..."`);
                await providerSendText(instance, {
                  number: targetNumber,
                  text: textBefore,
                  quotedMessageId: replyToWhatsAppMessageId || undefined,
                });
              }
              
              // 2. Send the media via provider abstraction
              const urlLower = mediaUrl.toLowerCase();
              let mediaMime = "application/octet-stream";
              let mediaFileName: string | undefined;
              
              switch (mediaTypeRaw) {
                case 'IMAGE':
                  mediaMime = urlLower.includes(".png") ? "image/png" : urlLower.includes(".gif") ? "image/gif" : urlLower.includes(".webp") ? "image/webp" : "image/jpeg";
                  break;
                case 'VIDEO':
                  mediaMime = urlLower.includes(".webm") ? "video/webm" : urlLower.includes(".mov") ? "video/quicktime" : "video/mp4";
                  break;
                case 'AUDIO':
                  mediaMime = urlLower.includes('.ogg') ? 'audio/ogg' : urlLower.includes('.mp3') ? 'audio/mpeg' : 'audio/ogg';
                  break;
                case 'DOCUMENT': {
                  const urlPath = mediaUrl.split('?')[0];
                  mediaFileName = decodeURIComponent(urlPath.split('/').pop() || 'documento');
                  if (urlLower.includes(".pdf")) mediaMime = "application/pdf";
                  else if (urlLower.includes(".docx")) mediaMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                  else if (urlLower.includes(".doc")) mediaMime = "application/msword";
                  else if (urlLower.includes(".xlsx")) mediaMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                  else if (urlLower.includes(".xls")) mediaMime = "application/vnd.ms-excel";
                  break;
                }
              }
              
              console.log(`[Evolution API] Sending ${mediaTypeRaw} via provider`);
              
              try {
                const mediaResult = await providerSendMedia(instance, {
                  number: targetNumber,
                  mediaType: mediaTypeRaw.toLowerCase() as 'image' | 'video' | 'audio' | 'document',
                  mediaUrl: mediaUrl,
                  caption: caption,
                  mimeType: mediaMime,
                  fileName: mediaFileName,
                });
                
                const whatsappMessageId = mediaResult.whatsappMessageId || crypto.randomUUID();
                console.log(`[Evolution API] Media sent successfully, whatsapp_message_id: ${whatsappMessageId}`);
                
                if (conversationId) {
                  await supabaseClient.from("messages").update({ 
                    whatsapp_message_id: whatsappMessageId,
                    status: "sent",
                    message_type: mediaTypeRaw.toLowerCase() as "image" | "video" | "audio" | "document",
                    content: caption || `[${mediaTypeRaw}]`,
                    media_url: mediaUrl,
                  }).eq("id", tempMessageId);
                }
              } catch (mediaErr: any) {
                console.error(`[Evolution API] Media send failed:`, mediaErr?.message);
                
                // Connection Closed detection (Evolution-only)
                if (isEvolution(instance) && mediaErr?.message?.includes('Connection Closed') && instanceId) {
                  console.warn(`[Evolution API] Connection Closed for ${instanceId} - marking disconnected`);
                  await supabaseClient.from("whatsapp_instances")
                    .update({ status: 'disconnected', disconnected_since: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .eq("id", instanceId);
                }

                if (conversationId) {
                  await supabaseClient.from("messages")
                    .update({ status: "failed", content: `❌ Falha ao enviar mídia: ${caption || mediaTypeRaw}` })
                    .eq("id", tempMessageId);
                }
                return;
              }
              
              // 3. Send remaining text after media (if any)
              if (remainingText) {
                console.log(`[Evolution API] Sending remaining text: "${remainingText.substring(0, 50)}..."`);
                await providerSendText(instance, { number: targetNumber, text: remainingText }).catch(() => {});
              }
              
              return; // Done - media template was handled
            }
            
            // ========================================================================
            // REGULAR TEXT MESSAGE (no media pattern found)
            // ========================================================================
            
            console.log(`[Evolution API] Sending text via provider (${instance.api_provider || 'evolution'})`);
            
            try {
              const sendResult = await providerSendText(instance, {
                number: targetNumber,
                text: body.message,
                quotedMessageId: replyToWhatsAppMessageId || undefined,
              });

              const whatsappMessageId = sendResult.whatsappMessageId;
              console.log(`[Evolution API] Background send completed, whatsapp_message_id: ${whatsappMessageId}`);

              if (conversationId && whatsappMessageId) {
                await supabaseClient.from("messages").update({ 
                  whatsapp_message_id: whatsappMessageId,
                  status: "sent"
                }).eq("id", tempMessageId);
              }
            } catch (sendErr: any) {
              console.error(`[Evolution API] Background send failed:`, sendErr?.message);
              
              // Connection Closed detection (Evolution-only)
              if (isEvolution(instance) && sendErr?.message?.includes('Connection Closed') && instanceId) {
                console.warn(`[Evolution API] Connection Closed for ${instanceId} - marking disconnected`);
                try {
                  const logoutApiUrl = normalizeUrl(instance.api_url);
                  await fetchWithTimeout(
                    `${logoutApiUrl}/instance/logout/${instance.instance_name}`,
                    { method: "DELETE", headers: { apikey: instance.api_key || "", "Content-Type": "application/json" } },
                    10000
                  );
                } catch { /* best effort */ }
                
                await supabaseClient.from("whatsapp_instances")
                  .update({ status: 'disconnected', disconnected_since: new Date().toISOString(), updated_at: new Date().toISOString() })
                  .eq("id", instanceId)
                  .not("status", "in", '("disconnected")');
              }
              
              if (conversationId) {
                await supabaseClient.from("messages").update({ status: "failed" }).eq("id", tempMessageId);
              }
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
                  // Keep original content intact - user will see "failed" status badge in UI
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

        const sendResult = await providerSendText(instance, {
          number: targetNumber,
          text: body.message,
        });

        console.log(`[Evolution API] Send message completed (${Date.now() - startedAt}ms)`);

        const whatsappMessageId = sendResult.whatsappMessageId || crypto.randomUUID();

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

        // uazapi: media is already persisted by webhook, no need for this endpoint
        if (isUazapi(instance)) {
          return new Response(JSON.stringify({
            success: false,
            error: "Mídia não disponível para download via API neste provider. Verifique o Storage.",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

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

        // Normalize common provider quirk: audio messages sometimes come as video/webm
        // This breaks HTMLAudio duration/playback (shows 0:00).
        const normalizedMimetype = (() => {
          const mt = (mediaData.mimetype || "").toLowerCase();
          if (mt === "video/webm") return "audio/webm";
          return mediaData.mimetype;
        })();

        // --- PERSIST ON DOWNLOAD (catch-up for older messages) ---
        try {
          const baseMime = (normalizedMimetype || '').split(';')[0].trim().toLowerCase();
          const extMap: Record<string, string> = {
            'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png',
            'image/webp': '.webp', 'image/gif': '.gif', 'audio/ogg': '.ogg',
            'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/webm': '.webm',
            'video/mp4': '.mp4', 'video/3gpp': '.3gp',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/msword': '.doc', 'application/vnd.ms-excel': '.xls',
          };
          const ext = extMap[baseMime] || '.bin';
          const safeId = (body.whatsappMessageId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const storagePath = `${targetLawFirmId}/${body.conversationId}/${safeId}${ext}`;

          const raw = mediaData.base64 as string;
          const binaryStr = atob(raw);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }

          const { error: uploadErr } = await supabaseClient.storage
            .from('chat-media')
            .upload(storagePath, bytes, {
              contentType: baseMime || 'application/octet-stream',
              upsert: true,
            });

          if (!uploadErr) {
            const { data: publicUrlData } = supabaseClient.storage
              .from('chat-media')
              .getPublicUrl(storagePath);

            if (publicUrlData?.publicUrl) {
              await supabaseClient
                .from('messages')
                .update({ media_url: publicUrlData.publicUrl })
                .eq('whatsapp_message_id', body.whatsappMessageId)
                .eq('conversation_id', body.conversationId);
              console.log(`[Evolution API] Media persisted to Storage: ${storagePath}`);
            }
          } else {
            console.warn(`[Evolution API] Storage upload failed:`, uploadErr.message);
          }
        } catch (persistErr) {
          console.warn('[Evolution API] Failed to persist media on download:', persistErr);
        }
        // --- END PERSIST ON DOWNLOAD ---

        return new Response(
          JSON.stringify({
            success: true,
            base64: mediaData.base64,
            mimetype: normalizedMimetype,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // =========================
      // ASYNC SEND MEDIA (<500ms response) - uses background task
      // Returns immediately with temp message ID, processes in background
      // =========================
      case "send_media_async": {
        if (!body.conversationId && !body.remoteJid) {
          throw new Error("conversationId or remoteJid is required");
        }
        if (!body.mediaBase64 && !body.mediaUrl) {
          throw new Error("mediaBase64 or mediaUrl is required");
        }
        if (!body.mediaType) {
          throw new Error("mediaType is required (image, audio, video, document)");
        }

        const startTime = Date.now();
        console.log(`[Evolution API] ASYNC Sending media`, { 
          conversationId: body.conversationId, 
          mediaType: body.mediaType,
        });

        let targetRemoteJid = body.remoteJid;
        let conversationId = body.conversationId;
        let instanceId = body.instanceId;
        let contactPhone: string | null = null;

        // If we have a conversationId, get the remoteJid and instanceId from it
        if (conversationId && !targetRemoteJid) {
          const { data: conversation, error: convError } = await supabaseClient
            .from("conversations")
            .select("remote_jid, whatsapp_instance_id, contact_phone, origin")
            .eq("id", conversationId)
            .eq("law_firm_id", lawFirmId)
            .single();

          if (convError || !conversation) {
            console.error("[Evolution API] Conversation not found:", convError);
            throw new Error("Conversation not found");
          }

          // CRITICAL: Block non-WhatsApp channels
          const nonWhatsAppOrigins = ['WIDGET', 'TRAY', 'SITE', 'WEB'];
          if (conversation.origin && nonWhatsAppOrigins.includes(conversation.origin.toUpperCase())) {
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: `Canal incorreto: Esta conversa é do ${conversation.origin}. Use o canal correto.`,
                errorCode: 'WRONG_CHANNEL',
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            );
          }

          targetRemoteJid = conversation.remote_jid;
          instanceId = conversation.whatsapp_instance_id;
          contactPhone = conversation.contact_phone || null;
        }

        // Fallback to connected instance if not set
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
              .eq("id", conversationId);
          }
        }

        if (!instanceId) {
          throw new Error("Nenhuma instância WhatsApp conectada para enviar arquivos.");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        const jidPart = (targetRemoteJid || "").split("@")[0];
        const targetNumber = ((contactPhone || jidPart) || "").replace(/\D/g, "");
        if (!targetNumber) {
          throw new Error("remoteJid inválido para envio de mídia");
        }

        // Use client-provided ID or generate new one
        // This ensures frontend optimistic message and DB record have the same ID
        const isValidUUID = (id?: string) => id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const tempMessageId = isValidUUID(body.clientMessageId) ? body.clientMessageId! : crypto.randomUUID();
        const mediaTypeDisplay = body.mediaType === "audio" ? "[Áudio]" 
          : body.mediaType === "image" ? "[Imagem]"
          : body.mediaType === "video" ? "[Vídeo]"
          : `[${body.fileName || body.mediaType}]`;

        // Insert temp message for immediate UI feedback via Realtime
        if (conversationId) {
          await supabaseClient
            .from("messages")
            .insert({
              id: tempMessageId,
              conversation_id: conversationId,
              content: body.caption || mediaTypeDisplay,
              message_type: body.mediaType,
              media_url: body.mediaUrl || null, // Storage URL for preview if available
              media_mime_type: body.mimeType || null,
              is_from_me: true,
              sender_type: "human",
              ai_generated: false,
              status: "sending",
            });

          await supabaseClient
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              archived_at: null,
              archived_reason: null,
            })
            .eq("id", conversationId);
        }

        // Background task - send to WhatsApp and update message
        const backgroundSendMedia = async () => {
          try {
            console.log(`[Evolution API] Background: Starting media send for ${body.mediaType} (provider: ${instance.api_provider || 'evolution'})`);
            
            let whatsappMessageId: string | null = null;
            let extractedMediaUrl: string | null = null;
            let extractedMimeType: string | null = body.mimeType || null;

            if (body.mediaType === "audio") {
              const audioBase64 = body.mediaBase64 || "";
              if (!audioBase64 || audioBase64.length < 1000) {
                throw new Error("Áudio inválido/muito pequeno para enviar.");
              }
              const cleanedAudioBase64 = audioBase64.trim().replace(/\s+/g, "");

              const audioResult = await providerSendAudio(instance, {
                number: targetNumber,
                audioBase64: cleanedAudioBase64,
                mimeType: body.mimeType,
              });

              whatsappMessageId = audioResult.whatsappMessageId || null;
              const audioRaw = audioResult.raw as any;
              extractedMediaUrl = audioRaw?.message?.audioMessage?.url || null;
              extractedMimeType = audioRaw?.message?.audioMessage?.mimetype || body.mimeType || "audio/ogg";
              if (extractedMimeType === "video/webm") extractedMimeType = "audio/webm";
            } else {
              const mediaResult = await providerSendMedia(instance, {
                number: targetNumber,
                mediaType: body.mediaType,
                mediaBase64: body.mediaBase64,
                mediaUrl: body.mediaUrl,
                fileName: body.fileName,
                caption: body.caption,
                mimeType: body.mimeType,
              });

              whatsappMessageId = mediaResult.whatsappMessageId || null;
              const raw = mediaResult.raw as any;
              extractedMediaUrl = raw?.message?.imageMessage?.url || raw?.message?.videoMessage?.url || raw?.message?.documentMessage?.url || body.mediaUrl || null;
              extractedMimeType = raw?.message?.imageMessage?.mimetype || raw?.message?.videoMessage?.mimetype || raw?.message?.documentMessage?.mimetype || body.mimeType;
            }

            console.log(`[Evolution API] Background: Media sent successfully, id=${whatsappMessageId}`);

            if (conversationId && whatsappMessageId) {
              await supabaseClient.from("messages").update({ 
                whatsapp_message_id: whatsappMessageId,
                media_url: extractedMediaUrl || body.mediaUrl,
                media_mime_type: extractedMimeType,
                status: "sent",
              }).eq("id", tempMessageId);
            }
          } catch (error) {
            console.error("[Evolution API] Background media send error:", error);
            // Mark message as failed
            if (conversationId) {
              const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
              await supabaseClient
                .from("messages")
                .update({ 
                  status: "failed",
                  content: `❌ Falha no envio: ${body.caption || body.mediaType}`,
                })
                .eq("id", tempMessageId);
            }
          }
        };

        // Fire and forget
        // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
        (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundSendMedia()) || backgroundSendMedia();

        console.log(`[Evolution API] ASYNC Media response in ${Date.now() - startTime}ms`);

        // Return immediately
        return new Response(
          JSON.stringify({
            success: true,
            messageId: tempMessageId,
            async: true,
            message: "Media queued for sending",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // =========================
      // SYNC SEND MEDIA (legacy, waits for Evolution response)
      // =========================
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
        let contactPhone: string | null = null;

        // If we have a conversationId, get the remoteJid and instanceId from it
        if (conversationId && !targetRemoteJid) {
          const { data: conversation, error: convError } = await supabaseClient
            .from("conversations")
            .select("remote_jid, whatsapp_instance_id, contact_phone")
            .eq("id", conversationId)
            .eq("law_firm_id", lawFirmId)
            .single();

          if (convError || !conversation) {
            console.error("[Evolution API] Conversation not found:", convError);
            throw new Error("Conversation not found");
          }

          targetRemoteJid = conversation.remote_jid;
          instanceId = conversation.whatsapp_instance_id;
          contactPhone = conversation.contact_phone || null;
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
        // Provider-based sending

        console.log(`[Evolution API] Sending ${body.mediaType} to ${targetRemoteJid} via ${instance.instance_name} (provider: ${instance.api_provider || 'evolution'})`);

        const jidPart = (targetRemoteJid || "").split("@")[0];
        const targetNumber = ((contactPhone || jidPart) || "").replace(/\D/g, "");
        if (!targetNumber) {
          throw new Error("remoteJid inválido para envio de mídia");
        }

        let whatsappMessageId: string;
        let extractedMediaUrl: string | null = null;
        let extractedMimeType: string | null = body.mimeType || null;

        if (body.mediaType === "audio") {
          // Audio: use provider sendAudio
          const audioBase64 = body.mediaBase64 || "";
          if (!audioBase64 || audioBase64.length < 1000) {
            throw new Error("Áudio inválido/muito pequeno para enviar.");
          }
          const cleanedAudioBase64 = audioBase64.trim().replace(/\s+/g, "");

          const audioResult = await providerSendAudio(instance, {
            number: targetNumber,
            audioBase64: cleanedAudioBase64,
            mimeType: body.mimeType,
          });

          whatsappMessageId = audioResult.whatsappMessageId || crypto.randomUUID();
          const audioRaw = audioResult.raw as any;
          extractedMediaUrl = audioRaw?.message?.audioMessage?.url || body.mediaUrl || null;
          extractedMimeType = audioRaw?.message?.audioMessage?.mimetype || body.mimeType || "audio/ogg";
          if (extractedMimeType === "video/webm") extractedMimeType = "audio/webm";

          // Save audio message to DB
          if (conversationId) {
            await supabaseClient.from("messages").insert({
              conversation_id: conversationId,
              whatsapp_message_id: whatsappMessageId,
              content: "[Áudio]",
              message_type: "audio",
              media_url: extractedMediaUrl,
              media_mime_type: extractedMimeType,
              is_from_me: true,
              sender_type: "human",
              ai_generated: false,
            });

            await supabaseClient.from("conversations").update({
              last_message_at: new Date().toISOString(),
              archived_at: null, archived_reason: null,
              archived_next_responsible_type: null, archived_next_responsible_id: null,
            }).eq("id", conversationId);
          }

          return new Response(JSON.stringify({
            success: true,
            messageId: whatsappMessageId,
            message: "Audio sent successfully",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // IMAGE, VIDEO, DOCUMENT: use provider sendMedia
        const mediaResult = await providerSendMedia(instance, {
          number: targetNumber,
          mediaType: body.mediaType,
          mediaBase64: body.mediaBase64,
          mediaUrl: body.mediaUrl,
          fileName: body.fileName,
          caption: body.caption,
          mimeType: body.mimeType,
        });

        whatsappMessageId = mediaResult.whatsappMessageId || crypto.randomUUID();
        const mediaRaw = mediaResult.raw as any;
        extractedMimeType =
          mediaRaw?.message?.imageMessage?.mimetype ||
          mediaRaw?.message?.videoMessage?.mimetype ||
          mediaRaw?.message?.documentMessage?.mimetype ||
          body.mimeType || null;
        extractedMediaUrl =
          mediaRaw?.message?.imageMessage?.url ||
          mediaRaw?.message?.videoMessage?.url ||
          mediaRaw?.message?.documentMessage?.url ||
          body.mediaUrl || null;

        if (conversationId) {
          await supabaseClient.from("messages").insert({
            conversation_id: conversationId,
            whatsapp_message_id: whatsappMessageId,
            content: body.caption || body.fileName || `[${body.mediaType}]`,
            message_type: body.mediaType,
            media_url: extractedMediaUrl,
            media_mime_type: extractedMimeType,
            is_from_me: true,
            sender_type: "human",
            ai_generated: false,
          });

          await supabaseClient.from("conversations").update({
            last_message_at: new Date().toISOString(),
            archived_at: null, archived_reason: null,
            archived_next_responsible_type: null, archived_next_responsible_id: null,
          }).eq("id", conversationId);
        }

        return new Response(JSON.stringify({
          success: true,
          messageId: whatsappMessageId,
          message: "Media sent successfully",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

        // Auto-configure settings to ignore groups by default
        try {
          const settingsPayload = {
            rejectCall: false,    // Required by Evolution API v2
            msgCall: "",
            groupsIgnore: true,
            alwaysOnline: false,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
          };
          
          const settingsResponse = await fetchWithTimeout(`${apiUrl}/settings/set/${body.instanceName}`, {
            method: "POST",
            headers: {
              apikey: globalApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(settingsPayload),
          });
          
          if (settingsResponse.ok) {
            console.log(`[Evolution API] GLOBAL Auto-configured groupsIgnore=true for instance ${body.instanceName}`);
          } else {
            console.warn(`[Evolution API] GLOBAL Failed to auto-configure settings for ${body.instanceName}:`, await safeReadResponseText(settingsResponse));
          }
        } catch (settingsError) {
          console.warn(`[Evolution API] GLOBAL Error auto-configuring settings:`, settingsError);
        }

        console.log(`[Evolution API] global_create qrcode field:`, JSON.stringify(createData?.qrcode).slice(0, 500));
        const _extractQrGlobal = (d: any): string | null => {
          if (d?.qrcode?.base64) return d.qrcode.base64;
          if (typeof d?.qrcode?.qrcode === "string" && d.qrcode.qrcode.length > 10) return d.qrcode.qrcode;
          if (typeof d?.qrcode === "string" && d.qrcode.length > 10) return d.qrcode;
          if (d?.base64) return d.base64;
          if (typeof d?.code === "string" && d.code.length > 10) return d.code;
          if (typeof d?.qrcode?.code === "string" && d.qrcode.code.length > 10) return d.qrcode.code;
          return null;
        };
        let qrCode: string | null = _extractQrGlobal(createData);

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

      // Recreate a lost instance (exists in DB but not in Evolution API)
      case "global_recreate_instance": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        if (!body.instanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Recreating lost instance: ${body.instanceName} at ${apiUrl}`);

        // Step 0: Clean up any existing instance (logout + delete to clear session files)
        console.log(`[Evolution API] global_recreate: Cleaning up existing instance ${body.instanceName}...`);
        try {
          await fetchWithTimeout(`${apiUrl}/instance/logout/${body.instanceName}`, {
            method: "DELETE",
            headers: { apikey: globalApiKey },
          }, 5000);
          console.log(`[Evolution API] global_recreate: Logout successful for ${body.instanceName}`);
        } catch (_) { /* ignore - may not exist */ }

        try {
          await fetchWithTimeout(`${apiUrl}/instance/delete/${body.instanceName}`, {
            method: "DELETE",
            headers: { apikey: globalApiKey },
          }, 5000);
          console.log(`[Evolution API] global_recreate: Delete successful for ${body.instanceName}`);
        } catch (_) { /* ignore - may not exist */ }

        // Wait for filesystem cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 1: Create instance in Evolution API
        const recreateResponse = await fetchWithTimeout(`${apiUrl}/instance/create`, {
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

        if (!recreateResponse.ok) {
          const errorText = await safeReadResponseText(recreateResponse);
          console.error(`[Evolution API] GLOBAL Recreate instance failed:`, errorText);
          throw new Error(simplifyEvolutionError(recreateResponse.status, errorText));
        }

        const recreateData = await recreateResponse.json();
        console.log(`[Evolution API] GLOBAL Recreate instance response:`, JSON.stringify(recreateData).slice(0, 500));

        // Step 2: Configure settings (groupsIgnore, etc)
        try {
          await fetchWithTimeout(`${apiUrl}/settings/set/${body.instanceName}`, {
            method: "POST",
            headers: {
              apikey: globalApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              rejectCall: false,
              msgCall: "",
              groupsIgnore: true,
              alwaysOnline: false,
              readMessages: false,
              readStatus: false,
              syncFullHistory: false,
            }),
          });
          console.log(`[Evolution API] GLOBAL Settings configured for recreated instance ${body.instanceName}`);
        } catch (settingsError) {
          console.warn(`[Evolution API] GLOBAL Error configuring settings for recreated instance:`, settingsError);
        }

        // Step 3: Extract QR code if available (robust v2.3.x extraction)
        console.log(`[Evolution API] global_recreate qrcode field:`, JSON.stringify(recreateData?.qrcode).slice(0, 500));
        const _extractQrGlobalR = (d: any): string | null => {
          if (d?.qrcode?.base64) return d.qrcode.base64;
          if (typeof d?.qrcode?.qrcode === "string" && d.qrcode.qrcode.length > 10) return d.qrcode.qrcode;
          if (typeof d?.qrcode === "string" && d.qrcode.length > 10) return d.qrcode;
          if (d?.base64) return d.base64;
          if (typeof d?.code === "string" && d.code.length > 10) return d.code;
          if (typeof d?.qrcode?.code === "string" && d.qrcode.code.length > 10) return d.qrcode.code;
          return null;
        };
        let qrCode: string | null = _extractQrGlobalR(recreateData);

        // Step 4: Update existing DB row status (DO NOT insert - row already exists)
        const { error: updateError } = await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: "awaiting_qr",
            api_url: apiUrl,
            api_key: globalApiKey,
            updated_at: new Date().toISOString(),
          })
          .eq("instance_name", body.instanceName);

        if (updateError) {
          console.error(`[Evolution API] GLOBAL DB update error for recreated instance:`, updateError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode,
            message: `Instance ${body.instanceName} recreated successfully`,
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

        // Update instance status if connected and reassociate orphans
        if (dbInstanceId && (status === "open" || status === "connected")) {
          await supabaseClient
            .from("whatsapp_instances")
            .update({ status: "connected", updated_at: new Date().toISOString() })
            .eq("id", dbInstanceId);
          
          // Reassociate orphan clients/conversations
          console.log(`[Evolution API] Reassociating orphan records for instance: ${dbInstanceId}`);
          const { data: reassocResult, error: reassocError } = await supabaseClient
            .rpc('reassociate_orphan_records', { _instance_id: dbInstanceId });
          
          if (reassocError) {
            console.error(`[Evolution API] Failed to reassociate orphans:`, reassocError);
          } else if (reassocResult) {
            console.log(`[Evolution API] Orphan reassociation result:`, reassocResult);
          }
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
        
        // Support both instanceName (preferred) and instanceId (fallback)
        let resolvedInstanceName = body.instanceName;
        if (!resolvedInstanceName && body.instanceId) {
          console.log(`[Evolution API] Resolving instanceName from instanceId: ${body.instanceId}`);
          const { data: instanceRow, error: lookupError } = await supabaseClient
            .from("whatsapp_instances")
            .select("instance_name")
            .eq("id", body.instanceId)
            .single();
          if (lookupError || !instanceRow) {
            throw new Error(`Instance not found for id: ${body.instanceId}`);
          }
          resolvedInstanceName = instanceRow.instance_name;
        }
        if (!resolvedInstanceName) {
          throw new Error("instanceName is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] GLOBAL Configuring webhook for: ${resolvedInstanceName}`);

        const webhookConfig = buildWebhookConfig(WEBHOOK_URL);
        
        console.log(`[Evolution API] Webhook URL being set: ${WEBHOOK_URL.slice(0, 80)}...`);
        
        // Try with { webhook: ... } wrapper first (required by some Evolution API versions)
        let webhookResponse = await fetchWithTimeout(`${apiUrl}/webhook/set/${resolvedInstanceName}`, {
          method: "POST",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ webhook: webhookConfig }),
        });

        const firstResponseText = await safeReadResponseText(webhookResponse);
        console.log(`[Evolution API] Webhook config response (wrapped) for ${resolvedInstanceName}:`, {
          status: webhookResponse.status,
          body: firstResponseText.slice(0, 500)
        });

        // Fallback: if wrapped format fails with 400, try without wrapper
        if (webhookResponse.status === 400) {
          console.log(`[Evolution API] Wrapped format failed for ${resolvedInstanceName}, trying unwrapped...`);
          webhookResponse = await fetchWithTimeout(`${apiUrl}/webhook/set/${resolvedInstanceName}`, {
            method: "POST",
            headers: {
              apikey: globalApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(webhookConfig),
          });
          
          const secondResponseText = await safeReadResponseText(webhookResponse);
          console.log(`[Evolution API] Webhook config response (unwrapped) for ${resolvedInstanceName}:`, {
            status: webhookResponse.status,
            body: secondResponseText.slice(0, 500)
          });
        }

        if (!webhookResponse.ok) {
          const errorText = await safeReadResponseText(webhookResponse);
          throw new Error(simplifyEvolutionError(webhookResponse.status, errorText));
        }

        return new Response(JSON.stringify({ success: true, message: "Webhook configured successfully", webhookUrl: WEBHOOK_URL.slice(0, 80) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "verify_webhook_config": {
        const globalApiUrl = Deno.env.get("EVOLUTION_BASE_URL");
        const globalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
        
        if (!globalApiUrl || !globalApiKey) {
          throw new Error("EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured");
        }
        
        let resolvedInstanceName = body.instanceName;
        if (!resolvedInstanceName && body.instanceId) {
          const { data: instanceRow } = await supabaseClient
            .from("whatsapp_instances")
            .select("instance_name")
            .eq("id", body.instanceId)
            .single();
          resolvedInstanceName = instanceRow?.instance_name;
        }
        if (!resolvedInstanceName) {
          throw new Error("instanceName or instanceId is required");
        }

        const apiUrl = normalizeUrl(globalApiUrl);
        console.log(`[Evolution API] Verifying webhook config for: ${resolvedInstanceName}`);
        
        const response = await fetchWithTimeout(`${apiUrl}/webhook/find/${resolvedInstanceName}`, {
          method: "GET",
          headers: {
            apikey: globalApiKey,
            "Content-Type": "application/json",
          },
        });
        
        const responseText = await safeReadResponseText(response);
        console.log(`[Evolution API] Webhook find response for ${resolvedInstanceName}:`, responseText.slice(0, 500));
        
        let config;
        try {
          config = JSON.parse(responseText);
        } catch {
          config = { raw: responseText.slice(0, 500) };
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          instance_name: resolvedInstanceName,
          webhook_config: config,
          expected_url: WEBHOOK_URL.slice(0, 80),
        }), {
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
          console.warn(`[Evolution API] GLOBAL restart failed (${restartResponse.status}), trying /instance/connect as fallback...`);
          
          // Fallback: try connect endpoint
          const connectResponse = await fetchWithTimeout(`${apiUrl}/instance/connect/${body.instanceName}`, {
            method: "GET",
            headers: {
              apikey: globalApiKey,
              "Content-Type": "application/json",
            },
          });
          
          if (!connectResponse.ok) {
            throw new Error(simplifyEvolutionError(restartResponse.status, errorText));
          }
          
          return new Response(JSON.stringify({ success: true, message: "Instance reconnected via connect fallback" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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
            .select("*, whatsapp_instances!conversations_whatsapp_instance_id_fkey(*)")
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

        // Use provider abstraction for delete
        await providerDeleteMessage(deleteInstance, body.remoteJid, body.whatsappMessageId, true);

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

      case "send_reaction": {
        // Send emoji reaction to a WhatsApp message
        if (!body.conversationId) {
          throw new Error("conversationId is required for send_reaction");
        }
        if (!body.whatsappMessageId) {
          throw new Error("whatsappMessageId is required for send_reaction");
        }
        if (!body.remoteJid) {
          throw new Error("remoteJid is required for send_reaction");
        }
        if (body.reaction === undefined) {
          throw new Error("reaction is required for send_reaction (emoji or empty string to remove)");
        }

        // Get conversation with instance - specify FK to avoid ambiguity
        const { data: reactionConversation, error: reactionConvError } =
          await supabaseClient
            .from("conversations")
            .select("*, whatsapp_instances!conversations_whatsapp_instance_id_fkey(*)")
            .eq("id", body.conversationId)
            .single();

        if (reactionConvError || !reactionConversation) {
          throw new Error(
            `Conversation not found: ${reactionConvError?.message}`
          );
        }

        const reactionInstance = reactionConversation.whatsapp_instances;
        if (!reactionInstance) {
          throw new Error("No WhatsApp instance associated with conversation");
        }

        // Use provider abstraction for reaction
        await providerSendReaction(reactionInstance, body.remoteJid, body.whatsappMessageId, body.reaction, body.isFromMe ?? false);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Reaction sent successfully",
            reaction: body.reaction,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_profile_picture": {
        // Fetch WhatsApp profile picture and update client avatar
        if (!body.instanceId) {
          throw new Error("instanceId is required for fetch_profile_picture");
        }
        if (!body.phoneNumber || !body.clientId) {
          throw new Error("phoneNumber and clientId are required for fetch_profile_picture");
        }

        console.log(`[Evolution API] Fetching profile picture for phone: ${body.phoneNumber.slice(0, 4)}***`);

        // Get instance
        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId, isGlobalAdmin);
        const apiUrl = normalizeUrl(instance.api_url);

        // Call Evolution API to fetch profile picture
        const profileResponse = await fetchWithTimeout(
          `${apiUrl}/chat/fetchProfilePictureUrl/${instance.instance_name}`,
          {
            method: "POST",
            headers: {
              apikey: instance.api_key || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ number: body.phoneNumber }),
          },
          DEFAULT_TIMEOUT_MS
        );

        if (!profileResponse.ok) {
          const errorText = await safeReadResponseText(profileResponse);
          console.error("[fetch_profile_picture] Evolution API error:", profileResponse.status, errorText);
          
          // Don't throw - just return that photo is not available
          return new Response(
            JSON.stringify({
              success: false,
              message: "Foto não disponível (usuário pode ter privacidade ativada)",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const profileData = await profileResponse.json();
        console.log("[fetch_profile_picture] Response:", JSON.stringify(profileData));

        // Extract profile picture URL from various response formats
        const profilePicUrl = 
          profileData?.profilePictureUrl || 
          profileData?.picture || 
          profileData?.url || 
          profileData?.pictureUrl ||
          profileData?.profilePicture;

        if (profilePicUrl && typeof profilePicUrl === "string" && profilePicUrl.startsWith("http")) {
          // Download image and persist to Storage to avoid expiring WhatsApp URLs
          let permanentUrl = profilePicUrl;
          try {
            const imageResponse = await fetch(profilePicUrl);
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
              
              const filePath = `${lawFirmId}/avatars/${body.clientId}.jpg`;
              const { error: uploadError } = await supabaseClient.storage
                .from("chat-media")
                .upload(filePath, imageBuffer, { contentType, upsert: true });
              
              if (!uploadError) {
                const { data: urlData } = supabaseClient.storage
                  .from("chat-media")
                  .getPublicUrl(filePath);
                if (urlData?.publicUrl) {
                  permanentUrl = urlData.publicUrl;
                  console.log("[fetch_profile_picture] Image persisted to Storage:", filePath);
                }
              } else {
                console.warn("[fetch_profile_picture] Storage upload failed, using original URL:", uploadError.message);
              }
            }
          } catch (storageErr) {
            console.warn("[fetch_profile_picture] Failed to persist to Storage, using original URL:", storageErr);
          }

          // Update client avatar in database with permanent URL
          const { error: updateError } = await supabaseClient
            .from("clients")
            .update({ avatar_url: permanentUrl })
            .eq("id", body.clientId);

          if (updateError) {
            console.error("[fetch_profile_picture] Database update error:", updateError);
            throw new Error(`Failed to update avatar: ${updateError.message}`);
          }

          console.log("[fetch_profile_picture] Avatar updated for client:", body.clientId, "persisted:", permanentUrl !== profilePicUrl);

          return new Response(
            JSON.stringify({
              success: true,
              avatarUrl: permanentUrl,
              message: "Foto de perfil atualizada com sucesso",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Foto não disponível (usuário pode ter privacidade ativada)",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "reapply_webhook": {
        // Reapply optimized webhook config to a single instance
        if (!isGlobalAdmin) {
          throw new Error("Only global admins can reapply webhook configurations");
        }

        if (!body.instanceId) {
          throw new Error("instanceId is required");
        }

        const instance = await getInstanceById(supabaseClient, null, body.instanceId, true);
        const apiKey = instance.api_key;
        const apiUrl = normalizeUrl(instance.api_url);

        console.log(`[Evolution API] Reapplying webhook config for: ${instance.instance_name}`);

        const reapplyRes = await fetchWithTimeout(`${apiUrl}/webhook/set/${instance.instance_name}`, {
          method: "POST",
          headers: {
            apikey: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
        });

        if (!reapplyRes.ok) {
          const errorText = await safeReadResponseText(reapplyRes);
          throw new Error(simplifyEvolutionError(reapplyRes.status, errorText));
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Webhook reapplied for ${instance.instance_name}`,
          instance_name: instance.instance_name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "reapply_all_webhooks": {
        // Batch reapply webhook config to ALL active instances
        if (!isGlobalAdmin) {
          throw new Error("Only global admins can reapply webhook configurations");
        }

        console.log("[Evolution API] Reapplying webhook config to ALL instances...");

        // Fetch all instances (not suspended)
        const { data: allInstances, error: fetchError } = await supabaseClient
          .from("whatsapp_instances")
          .select("id, instance_name, api_url, api_key, status")
          .neq("status", "suspended");

        if (fetchError) throw new Error(`Failed to fetch instances: ${fetchError.message}`);

        const results: Array<{ instance_name: string; success: boolean; error?: string }> = [];

        for (const inst of (allInstances || [])) {
          try {
            const instApiUrl = normalizeUrl(inst.api_url);
            const res = await fetchWithTimeout(`${instApiUrl}/webhook/set/${inst.instance_name}`, {
              method: "POST",
              headers: {
                apikey: inst.api_key,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
            }, 10000);

            if (!res.ok) {
              const errText = await safeReadResponseText(res);
              results.push({ instance_name: inst.instance_name, success: false, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` });
            } else {
              results.push({ instance_name: inst.instance_name, success: true });
            }
          } catch (e: any) {
            results.push({ instance_name: inst.instance_name, success: false, error: e?.message || "unknown error" });
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`[Evolution API] Reapply complete: ${successCount} success, ${failCount} failed out of ${results.length}`);

        return new Response(JSON.stringify({
          success: true,
          message: `Webhook reapplied: ${successCount}/${results.length} instances updated`,
          total: results.length,
          success_count: successCount,
          fail_count: failCount,
          results,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
