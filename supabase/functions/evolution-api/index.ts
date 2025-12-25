import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  | "send_message"
  | "send_media";

interface EvolutionRequest {
  action: EvolutionAction;
  instanceName?: string;
  apiUrl?: string;
  apiKey?: string;
  instanceId?: string;
  rejectCall?: boolean;
  msgCall?: string;
  // For send_message
  conversationId?: string;
  message?: string;
  remoteJid?: string;
  // For send_media
  mediaType?: "image" | "audio" | "video" | "document";
  mediaBase64?: string;
  mediaUrl?: string;
  fileName?: string;
  caption?: string;
}

// Helper to normalize URL (remove trailing slashes and /manager suffix)
function normalizeUrl(url: string): string {
  let normalized = url.replace(/\/+$/, "");
  normalized = normalized.replace(/\/manager$/i, "");
  return normalized;
}

const DEFAULT_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
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

async function getInstanceById(supabaseClient: any, lawFirmId: string, instanceDbId: string) {
  const { data: instance, error } = await supabaseClient
    .from("whatsapp_instances")
    .select("*")
    .eq("id", instanceDbId)
    .eq("law_firm_id", lawFirmId)
    .single();

  if (error || !instance) {
    console.error("[Evolution API] Instance not found:", error);
    throw new Error("Instance not found");
  }

  return instance;
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
      .select("law_firm_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.law_firm_id) {
      throw new Error("User not associated with a law firm");
    }

    const lawFirmId = profile.law_firm_id as string;
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
        if (!body.instanceName || !body.apiUrl || !body.apiKey) {
          throw new Error("instanceName, apiUrl, and apiKey are required");
        }

        const apiUrl = normalizeUrl(body.apiUrl);
        console.log(`[Evolution API] Creating instance: ${body.instanceName} at ${apiUrl}`);

        const createResponse = await fetchWithTimeout(`${apiUrl}/instance/create`, {
          method: "POST",
          headers: {
            apikey: body.apiKey,
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
            instance_id: instanceId,
            api_url: apiUrl,
            api_key: body.apiKey,
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

        // Fetch and store phone number when connected
        let phoneNumberToSave: string | null = null;
        if (dbStatus === "connected" && !instance.phone_number && instance.api_key) {
          try {
            phoneNumberToSave = await fetchConnectedPhoneNumber(apiUrl, instance.api_key, instance.instance_name);
          } catch (e) {
            console.log("[Evolution API] Failed to fetch phone number (non-fatal):", e);
          }
        }

        const updatePayload: Record<string, unknown> = {
          status: dbStatus,
          updated_at: new Date().toISOString(),
        };
        if (phoneNumberToSave) updatePayload.phone_number = phoneNumberToSave;

        const { data: updatedInstance } = await supabaseClient
          .from("whatsapp_instances")
          .update(updatePayload)
          .eq("id", body.instanceId)
          .select()
          .single();

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

        const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        let phoneNumber: string | null = null;

        try {
          phoneNumber = await fetchConnectedPhoneNumber(apiUrl, instance.api_key || "", instance.instance_name);
        } catch (e) {
          console.log("[Evolution API] Failed to fetch phone number:", e);
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
            instance: updatedInstance,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

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

        if (!instanceId) {
          throw new Error("instanceId is required (either directly or via conversationId)");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        console.log(`[Evolution API] Sending to ${targetRemoteJid} via ${instance.instance_name}`);

        // Send message via Evolution API
        const sendResponse = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance.instance_name}`, {
          method: "POST",
          headers: {
            apikey: instance.api_key || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: targetRemoteJid,
            text: body.message,
          }),
        });

        console.log(`[Evolution API] Send message response status: ${sendResponse.status}`);

        if (!sendResponse.ok) {
          const errorText = await safeReadResponseText(sendResponse);
          console.error(`[Evolution API] Send message failed:`, errorText);
          throw new Error(simplifyEvolutionError(sendResponse.status, errorText));
        }

        const sendData = await sendResponse.json();
        console.log(`[Evolution API] Message sent successfully:`, JSON.stringify(sendData));

        // Extract the message ID from the response
        const whatsappMessageId = sendData.key?.id || sendData.messageId || sendData.id || crypto.randomUUID();

        // Save message to database
        if (conversationId) {
          const { data: savedMessage, error: msgError } = await supabaseClient
            .from("messages")
            .insert({
              conversation_id: conversationId,
              whatsapp_message_id: whatsappMessageId,
              content: body.message,
              message_type: "text",
              is_from_me: true,
              sender_type: "human",
              ai_generated: false,
            })
            .select()
            .single();

          if (msgError) {
            console.error("[Evolution API] Failed to save message to DB:", msgError);
          } else {
            console.log(`[Evolution API] Message saved to DB with ID: ${savedMessage.id}`);
          }

          // Update conversation last_message_at
          await supabaseClient
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
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

        if (!instanceId) {
          throw new Error("instanceId is required (either directly or via conversationId)");
        }

        const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId);
        const apiUrl = normalizeUrl(instance.api_url);

        console.log(`[Evolution API] Sending ${body.mediaType} to ${targetRemoteJid} via ${instance.instance_name}`);

        // Determine the endpoint based on media type
        let endpoint = "";
        let payload: Record<string, unknown> = {
          number: targetRemoteJid,
        };

        switch (body.mediaType) {
          case "image":
            endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
            payload = {
              ...payload,
              mediatype: "image",
              mimetype: "image/jpeg",
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
              mimetype: "video/mp4",
              caption: body.caption || "",
              media: body.mediaBase64 || body.mediaUrl,
            };
            break;
          case "document":
            endpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
            payload = {
              ...payload,
              mediatype: "document",
              mimetype: "application/octet-stream",
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
            .update({ last_message_at: new Date().toISOString() })
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

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }
  } catch (error) {
    console.error("[Evolution API] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
