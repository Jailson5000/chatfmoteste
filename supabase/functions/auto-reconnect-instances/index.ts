import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration - 3 attempts in 3 minutes (1 per minute)
const CONNECTING_THRESHOLD_MINUTES = 1;
const DISCONNECTED_THRESHOLD_MINUTES = 1;
const MAX_RECONNECT_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MINUTES = 3;

interface InstanceToReconnect {
  id: string;
  instance_name: string;
  status: string;
  api_url: string;
  api_key: string;
  law_firm_id: string;
  disconnected_since: string | null;
  reconnect_attempts_count: number;
  last_reconnect_attempt_at: string | null;
  manual_disconnect: boolean | null;
  awaiting_qr: boolean | null;
  last_webhook_event: string | null;
}

interface ReconnectResult {
  instance_id: string;
  instance_name: string;
  success: boolean;
  action: string;
  message: string;
  qrcode?: string;
  needs_qr?: boolean;
}

function normalizeUrl(url: string): string {
  let normalized = url.replace(/\/+$/, "");
  normalized = normalized.replace(/\/manager$/i, "");
  return normalized;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = 15000,
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

function shouldSkipReconnect(instance: InstanceToReconnect): { skip: boolean; reason: string } {
  const lastAttempt = instance.last_reconnect_attempt_at 
    ? new Date(instance.last_reconnect_attempt_at) 
    : null;
  
  if (!lastAttempt) return { skip: false, reason: "" };

  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  if (lastAttempt < windowStart) return { skip: false, reason: "" };

  if (instance.reconnect_attempts_count >= MAX_RECONNECT_ATTEMPTS) {
    return { 
      skip: true, 
      reason: `Max attempts (${MAX_RECONNECT_ATTEMPTS}) reached in ${ATTEMPT_WINDOW_MINUTES} minutes - QR scan required` 
    };
  }

  return { skip: false, reason: "" };
}

// Force logout to clear stale Evolution session
async function forceLogout(instance: InstanceToReconnect): Promise<boolean> {
  const apiUrl = normalizeUrl(instance.api_url);
  try {
    console.log(`[Auto-Reconnect] Forcing logout for ghost session ${instance.instance_name}...`);
    const response = await fetchWithTimeout(
      `${apiUrl}/instance/logout/${encodeURIComponent(instance.instance_name)}`,
      {
        method: "DELETE",
        headers: {
          apikey: instance.api_key,
          "Content-Type": "application/json",
        },
      },
      10000
    );
    console.log(`[Auto-Reconnect] Logout response for ${instance.instance_name}: ${response.status}`);
    return response.ok || response.status === 404;
  } catch (error: any) {
    console.warn(`[Auto-Reconnect] Logout failed for ${instance.instance_name}: ${error.message}`);
    return false;
  }
}

async function deleteAndRecreateInstance(instance: InstanceToReconnect): Promise<{
  success: boolean;
  qrcode?: string;
  message: string;
}> {
  const apiUrl = normalizeUrl(instance.api_url);
  const headers = {
    apikey: instance.api_key,
    "Content-Type": "application/json",
  };
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const WEBHOOK_URL_LOCAL = `${SUPABASE_URL}/functions/v1/evolution-webhook`;

  try {
    // === ATTEMPT 1: Logout + Connect (preferred - keeps instance registration) ===
    console.log(`[Auto-Reconnect] 🔧 Recovery for ${instance.instance_name}: Step 1 - Logout + Connect`);
    
    // Logout (best-effort - clears Baileys session files)
    try {
      const logoutResp = await fetchWithTimeout(
        `${apiUrl}/instance/logout/${encodeURIComponent(instance.instance_name)}`,
        { method: "DELETE", headers },
        10000
      );
      console.log(`[Auto-Reconnect] Logout response: ${logoutResp.status}`);
    } catch (e) {
      console.warn(`[Auto-Reconnect] Logout failed (non-fatal):`, e);
    }

    // Wait for Baileys to clear session files
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try connect to get fresh QR
    const connectResp = await fetchWithTimeout(
      `${apiUrl}/instance/connect/${encodeURIComponent(instance.instance_name)}`,
      { method: "GET", headers },
      15000
    );

    if (connectResp.ok) {
      const connectData = await connectResp.json().catch(() => ({}));
      console.log(`[Auto-Reconnect] Connect after logout:`, JSON.stringify(connectData).slice(0, 300));
      const qrcode = connectData.base64 || connectData.qrcode?.base64 || null;
      if (qrcode) {
        console.log(`[Auto-Reconnect] ✅ Logout+Connect recovery successful for ${instance.instance_name}`);
        return { success: true, qrcode, message: "Session cleared - QR code available" };
      }
      console.log(`[Auto-Reconnect] Logout+Connect did not return QR, falling back to delete+recreate`);
    } else {
      console.log(`[Auto-Reconnect] Connect after logout failed (${connectResp.status}), falling back to delete+recreate`);
    }

    // === ATTEMPT 2: Delete + Recreate (fallback with retry) ===
    console.log(`[Auto-Reconnect] Recovery Step 2: Delete + Recreate for ${instance.instance_name}`);

    // Delete (best-effort)
    const deleteResp = await fetchWithTimeout(
      `${apiUrl}/instance/delete/${encodeURIComponent(instance.instance_name)}`,
      { method: "DELETE", headers },
      8000
    ).catch(() => ({ status: 0 } as any));
    console.log(`[Auto-Reconnect] Delete response: ${deleteResp?.status || 'failed'}`);

    // Wait longer for async deletion
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Try create with retry on 403
    let createSuccess = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`[Auto-Reconnect] Recreate attempt ${attempt} for ${instance.instance_name}...`);
      const createResp = await fetchWithTimeout(
        `${apiUrl}/instance/create`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            instanceName: instance.instance_name,
            token: instance.api_key,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: { url: WEBHOOK_URL_LOCAL, webhook_by_events: false, webhook_base64: true, events: ["CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_DELETE", "CONTACTS_UPDATE"] },
          }),
        },
        30000
      );

      if (createResp.ok) {
        console.log(`[Auto-Reconnect] Recreate succeeded on attempt ${attempt}`);
        createSuccess = true;
        break;
      }

      const err = await createResp.text().catch(() => "unknown");
      console.warn(`[Auto-Reconnect] Recreate attempt ${attempt} failed: ${createResp.status} - ${err.slice(0, 200)}`);
      
      if (createResp.status === 403 && attempt < 2) {
        console.log(`[Auto-Reconnect] 403 "name in use" - waiting 5s before retry...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        return { success: false, message: `Recreate failed: ${createResp.status} - ${err.slice(0, 200)}` };
      }
    }

    if (!createSuccess) {
      return { success: false, message: "Recreate failed after retries" };
    }

    // Configure settings
    try {
      await fetchWithTimeout(`${apiUrl}/settings/set/${encodeURIComponent(instance.instance_name)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rejectCall: false, msgCall: "", groupsIgnore: true,
          alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false,
        }),
      }, 10000);
    } catch (e) {
      console.warn(`[Auto-Reconnect] Settings config failed (non-fatal):`, e);
    }

    // Configure webhook
    try {
      await fetchWithTimeout(`${apiUrl}/webhook/set/${encodeURIComponent(instance.instance_name)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: WEBHOOK_URL_LOCAL,
          webhook_by_events: false,
          webhook_base64: true,
          events: ["CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_DELETE", "CONTACTS_UPDATE"],
        }),
      }, 10000);
    } catch (e) {
      console.warn(`[Auto-Reconnect] Webhook config failed (non-fatal):`, e);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get QR code
    const qrResp = await fetchWithTimeout(
      `${apiUrl}/instance/connect/${encodeURIComponent(instance.instance_name)}`,
      { method: "GET", headers },
      15000
    );

    if (qrResp.ok) {
      const qrData = await qrResp.json().catch(() => ({}));
      const qrcode = qrData.base64 || qrData.qrcode?.base64 || null;
      if (qrcode) {
        console.log(`[Auto-Reconnect] ✅ Delete+Recreate recovery successful for ${instance.instance_name}`);
        return { success: true, qrcode, message: "Instance recreated - QR code available" };
      }
    }

    return { success: true, message: "Instance recreated but no QR code returned" };
  } catch (error: any) {
    console.error(`[Auto-Reconnect] Recovery failed for ${instance.instance_name}:`, error);
    return { success: false, message: `Recovery failed: ${error.message}` };
  }
}

async function attemptConnect(instance: InstanceToReconnect): Promise<ReconnectResult> {
  const apiUrl = normalizeUrl(instance.api_url);
  
  try {
    // v2.2.3: Try restart first (preferred method - keeps session and reconnects)
    console.log(`[Auto-Reconnect] Attempting restart for ${instance.instance_name} (v2.2.3 preferred)...`);
    
    try {
      const restartResponse = await fetchWithTimeout(
        `${apiUrl}/instance/restart/${encodeURIComponent(instance.instance_name)}`,
        {
          method: "PUT",
          headers: {
            apikey: instance.api_key,
            "Content-Type": "application/json",
          },
        },
        15000
      );

      if (restartResponse.ok) {
        const data = await restartResponse.json().catch(() => ({}));
        console.log(`[Auto-Reconnect] /instance/restart response for ${instance.instance_name}:`, JSON.stringify(data).slice(0, 500));
        
        const state = data?.instance?.state || data?.instance?.status || data?.state || data?.status;
        
        if (state === "open" || state === "connected") {
          return {
            instance_id: instance.id,
            instance_name: instance.instance_name,
            success: true,
            action: "restart",
            message: "Instance reconnected automatically via restart",
          };
        }
        
        // Restart succeeded but not yet connected - give it a moment then check
        console.log(`[Auto-Reconnect] Restart returned state=${state}, waiting 3s then checking...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Quick check connectionState
        try {
          const stateResp = await fetchWithTimeout(
            `${apiUrl}/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
            { method: "GET", headers: { apikey: instance.api_key, "Content-Type": "application/json" } },
            8000
          );
          if (stateResp.ok) {
            const stateData = await stateResp.json();
            const realState = stateData?.instance?.state || stateData?.state || "unknown";
            if (realState === "open" || realState === "connected") {
              return {
                instance_id: instance.id,
                instance_name: instance.instance_name,
                success: true,
                action: "restart",
                message: "Instance reconnected automatically via restart (verified)",
              };
            }
          }
        } catch (_) {}
      } else {
        console.log(`[Auto-Reconnect] Restart failed (${restartResponse.status}), falling back to connect...`);
      }
    } catch (restartErr: any) {
      console.warn(`[Auto-Reconnect] Restart error for ${instance.instance_name}: ${restartErr.message}, falling back to connect...`);
    }

    // Fallback: /instance/connect
    console.log(`[Auto-Reconnect] Fallback: attempting connect for ${instance.instance_name}...`);
    
    const connectResponse = await fetchWithTimeout(
      `${apiUrl}/instance/connect/${encodeURIComponent(instance.instance_name)}`,
      {
        method: "GET",
        headers: {
          apikey: instance.api_key,
          "Content-Type": "application/json",
        },
      },
      15000
    );

    if (connectResponse.ok) {
      const data = await connectResponse.json().catch(() => ({}));
      console.log(`[Auto-Reconnect] /instance/connect raw response for ${instance.instance_name}:`, JSON.stringify(data).slice(0, 500));
      
      const state = data?.instance?.state || data?.instance?.status || data?.instance?.connectionStatus || data?.state || data?.status;
      const qrcode = data?.base64 || data?.qrcode?.base64;
      
      if (state === "open" || state === "connected") {
        return {
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: true,
          action: "connect",
          message: "Instance reconnected automatically",
        };
      }
      
      if (qrcode) {
        console.log(`[Auto-Reconnect] Connect returned QR code for ${instance.instance_name} - marking as awaiting_qr`);
        return {
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: false,
          action: "connect",
          message: "Session expired - QR code scan required",
          qrcode: qrcode,
          needs_qr: true,
        };
      }

      // CORRUPTED SESSION DETECTION
      const isCorrupted = !qrcode && !state &&
        (data.count === 0 || (Object.keys(data).length <= 2 && !data.base64 && !data.qrcode));
      
      if (isCorrupted) {
        console.log(`[Auto-Reconnect] 🔧 CORRUPTED SESSION for ${instance.instance_name} - triggering delete+recreate`);
        const recovery = await deleteAndRecreateInstance(instance);
        
        return {
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: recovery.success,
          action: "delete_recreate",
          message: recovery.message,
          qrcode: recovery.qrcode,
          needs_qr: !!recovery.qrcode,
        };
      }

      return {
        instance_id: instance.id,
        instance_name: instance.instance_name,
        success: true,
        action: "connect",
        message: `Connection initiated, current state: ${state || "connecting"}`,
      };
    }

    return {
      instance_id: instance.id,
      instance_name: instance.instance_name,
      success: false,
      action: "connect",
      message: `Connect failed with status ${connectResponse.status}`,
    };
  } catch (error: any) {
    console.error(`[Auto-Reconnect] Connect error for ${instance.instance_name}:`, error);
    return {
      instance_id: instance.id,
      instance_name: instance.instance_name,
      success: false,
      action: "connect",
      message: error.message === "timeout" ? "Connection timeout" : error.message,
    };
  }
}

// DUAL VERIFICATION: fetchInstances + connectionState
// fetchInstances returns REGISTRATION status (can be stale "open")
// connectionState returns REAL Baileys socket status
async function checkConnectionState(instance: InstanceToReconnect): Promise<{
  isConnected: boolean;
  state: string;
  ghostSession: boolean; // fetchInstances="open" but socket is dead
}> {
  const apiUrl = normalizeUrl(instance.api_url);
  let fetchInstancesState = "unknown";

  // STEP 1: fetchInstances (registration status)
  try {
    const fetchUrl = `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instance_name)}`;
    console.log(`[Auto-Reconnect] Step 1 - fetchInstances for ${instance.instance_name}...`);

    const response = await fetchWithTimeout(fetchUrl, {
      method: "GET",
      headers: {
        apikey: instance.api_key,
        "Content-Type": "application/json",
      },
    }, 10000);

    if (response.ok) {
      const data = await response.json();
      const instances = Array.isArray(data) ? data : data?.instances || [data];
      const found = instances.find((i: any) =>
        i?.instanceName === instance.instance_name ||
        i?.name === instance.instance_name
      ) || instances[0];

      if (found) {
        fetchInstancesState = found.connectionStatus || found.status || found.state || "unknown";
        console.log(`[Auto-Reconnect] fetchInstances state for ${instance.instance_name}: ${fetchInstancesState}`);
      }
    }
  } catch (e: any) {
    console.warn(`[Auto-Reconnect] fetchInstances failed for ${instance.instance_name}:`, e.message);
  }

  // If fetchInstances says NOT connected, no need for second check
  if (fetchInstancesState !== "open" && fetchInstancesState !== "connected") {
    console.log(`[Auto-Reconnect] fetchInstances says ${fetchInstancesState} - instance truly disconnected`);
    return { isConnected: false, state: fetchInstancesState, ghostSession: false };
  }

  // STEP 2: fetchInstances says "open" - VERIFY with connectionState (real socket status)
  try {
    console.log(`[Auto-Reconnect] Step 2 - connectionState verification for ${instance.instance_name}...`);
    const stateResponse = await fetchWithTimeout(
      `${apiUrl}/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
      {
        method: "GET",
        headers: {
          apikey: instance.api_key,
          "Content-Type": "application/json",
        },
      },
      10000
    );

    if (stateResponse.ok) {
      const data = await stateResponse.json();
      const socketState = data.state || data.instance?.state || "unknown";
      const isReallyConnected = socketState === "open" || socketState === "connected";
      
      if (isReallyConnected) {
        console.log(`[Auto-Reconnect] ✅ VERIFIED: ${instance.instance_name} is truly connected (fetchInstances=${fetchInstancesState}, connectionState=${socketState})`);
        return { isConnected: true, state: socketState, ghostSession: false };
      } else {
        // GHOST SESSION DETECTED!
        console.log(`[Auto-Reconnect] 👻 GHOST SESSION DETECTED: ${instance.instance_name} - fetchInstances="${fetchInstancesState}" but connectionState="${socketState}"`);
        return { isConnected: false, state: socketState, ghostSession: true };
      }
    }
  } catch (e: any) {
    console.warn(`[Auto-Reconnect] connectionState failed for ${instance.instance_name}:`, e.message);
  }

  // If connectionState endpoint fails, fall back to trusting fetchInstances
  // (better than breaking everything)
  console.log(`[Auto-Reconnect] connectionState check failed, trusting fetchInstances for ${instance.instance_name}`);
  return { isConnected: true, state: fetchInstancesState, ghostSession: false };
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

    console.log("[Auto-Reconnect] Starting auto-reconnection check...");

    const now = new Date();
    const connectingThreshold = new Date(now.getTime() - CONNECTING_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const disconnectedThreshold = new Date(now.getTime() - DISCONNECTED_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    // CHANGED: Also include "connected" instances to detect ghost sessions
    const { data: rawInstances, error: fetchError } = await supabaseClient
      .from("whatsapp_instances")
      .select("id, instance_name, status, api_url, api_key, law_firm_id, disconnected_since, reconnect_attempts_count, last_reconnect_attempt_at, manual_disconnect, awaiting_qr, last_webhook_event")
      .in("status", ["connecting", "disconnected", "connected"])
      .not("api_url", "is", null)
      .not("api_key", "is", null);

    if (fetchError) {
      console.error("[Auto-Reconnect] Error fetching instances:", fetchError);
      throw fetchError;
    }

    // Filter out instances that should NOT be auto-reconnected
    const instances = (rawInstances || []).filter(instance => {
      if (instance.manual_disconnect === true) {
        console.log(`[Auto-Reconnect] Skipping ${instance.instance_name}: manual_disconnect=true`);
        return false;
      }
      if (instance.awaiting_qr === true) {
        console.log(`[Auto-Reconnect] Skipping ${instance.instance_name}: awaiting_qr=true`);
        return false;
      }
      return true;
    });

    console.log(`[Auto-Reconnect] Found ${rawInstances?.length || 0} raw instances, ${instances.length} after filtering`);

    if (instances.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No instances need reconnection",
          checked_at: now.toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter instances based on time thresholds and ghost session eligibility
    const instancesToReconnect: InstanceToReconnect[] = [];

    for (const instance of instances) {
      const disconnectedSince = instance.disconnected_since 
        ? new Date(instance.disconnected_since) 
        : null;

      if (instance.status === "connecting") {
        if (disconnectedSince && disconnectedSince.toISOString() <= connectingThreshold) {
          instancesToReconnect.push(instance as InstanceToReconnect);
        } else if (!disconnectedSince) {
          instancesToReconnect.push(instance as InstanceToReconnect);
        }
      } else if (instance.status === "disconnected") {
        if (disconnectedSince && disconnectedSince.toISOString() <= disconnectedThreshold) {
          instancesToReconnect.push(instance as InstanceToReconnect);
        }
      } else if (instance.status === "connected") {
        // NEW: Include "connected" instances for ghost session detection
        // Only check those that haven't received real messages (last_webhook_event != messages.upsert)
        // or have no webhook event at all
        const lastEvent = instance.last_webhook_event;
        const isLikelyGhost = !lastEvent || lastEvent === "connection.update" || lastEvent === "connecting";
        if (isLikelyGhost) {
          console.log(`[Auto-Reconnect] Including connected instance ${instance.instance_name} for ghost check (last_webhook_event=${lastEvent || "null"})`);
          instancesToReconnect.push(instance as InstanceToReconnect);
        }
      }
    }

    console.log(`[Auto-Reconnect] ${instancesToReconnect.length} instances qualify for reconnection/ghost check`);

    if (instancesToReconnect.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No instances exceed threshold for reconnection",
          total_checked: instances.length,
          checked_at: now.toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ReconnectResult[] = [];
    const qrCodesNeeded: { instance_name: string; law_firm_id: string }[] = [];

    for (const instance of instancesToReconnect) {
      // Check rate limiting (skip for "connected" ghost checks - they don't count as reconnect attempts)
      if (instance.status !== "connected") {
        const skipCheck = shouldSkipReconnect(instance);
        if (skipCheck.skip) {
          console.log(`[Auto-Reconnect] Skipping ${instance.instance_name}: ${skipCheck.reason}`);
          results.push({
            instance_id: instance.id,
            instance_name: instance.instance_name,
            success: false,
            action: "skipped",
            message: skipCheck.reason,
          });
          continue;
        }
      }

      // STEP 1: Check real connection state (DUAL VERIFICATION)
      const connectionCheck = await checkConnectionState(instance);

      if (connectionCheck.isConnected) {
        // Truly connected - sync DB if needed
        if (instance.status !== "connected") {
          console.log(`[Auto-Reconnect] Instance ${instance.instance_name} is verified connected - syncing DB`);
          await supabaseClient
            .from("whatsapp_instances")
            .update({
              status: "connected",
              disconnected_since: null,
              reconnect_attempts_count: 0,
              awaiting_qr: false,
              manual_disconnect: false,
              alert_sent_for_current_disconnect: false,
              updated_at: now.toISOString(),
            })
            .eq("id", instance.id);
        }
        
        results.push({
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: true,
          action: "status_sync",
          message: `Verified connected (fetchInstances + connectionState both confirm)`,
        });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }

      // STEP 2: Handle ghost sessions - logout first to clear stale cache
      if (connectionCheck.ghostSession) {
        console.log(`[Auto-Reconnect] 👻 Handling ghost session for ${instance.instance_name}: forcing logout before reconnect`);
        await forceLogout(instance);
        // Small delay after logout to let Evolution clear the session
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // STEP 3: Instance is NOT connected - proceed with reconnection
      // Update attempt counter BEFORE trying
      const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
      const lastAttempt = instance.last_reconnect_attempt_at 
        ? new Date(instance.last_reconnect_attempt_at) 
        : null;
      
      const newAttemptCount = (lastAttempt && lastAttempt >= windowStart) 
        ? (instance.reconnect_attempts_count || 0) + 1 
        : 1;

      await supabaseClient
        .from("whatsapp_instances")
        .update({
          reconnect_attempts_count: newAttemptCount,
          last_reconnect_attempt_at: now.toISOString(),
          // If it was "connected" (ghost), mark as disconnected first
          ...(instance.status === "connected" && {
            status: "disconnected",
            disconnected_since: now.toISOString(),
          }),
        })
        .eq("id", instance.id);

      // Try connect
      const result = await attemptConnect(instance);
      results.push(result);

      // Track instances that need QR code
      if (result.qrcode || result.needs_qr) {
        qrCodesNeeded.push({
          instance_name: instance.instance_name,
          law_firm_id: instance.law_firm_id,
        });
        
        console.log(`[Auto-Reconnect] Setting awaiting_qr=true for ${instance.instance_name}`);
        await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: "awaiting_qr",
            awaiting_qr: true,
            updated_at: now.toISOString(),
          })
          .eq("id", instance.id);
      } else if (!result.success && newAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
        console.log(`[Auto-Reconnect] Max attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${instance.instance_name} - marking awaiting_qr`);
        qrCodesNeeded.push({
          instance_name: instance.instance_name,
          law_firm_id: instance.law_firm_id,
        });
        await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: "awaiting_qr",
            awaiting_qr: true,
            updated_at: now.toISOString(),
          })
          .eq("id", instance.id);
      } else if (result.success) {
        const isFullyConnected = result.message.includes("reconnected automatically") || 
                                 result.message.includes("already connected");
        
        await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: isFullyConnected ? "connected" : "connecting",
            ...(isFullyConnected && {
              disconnected_since: null,
              reconnect_attempts_count: 0,
              manual_disconnect: false,
              awaiting_qr: false,
              alert_sent_for_current_disconnect: false,
            }),
            updated_at: now.toISOString(),
          })
          .eq("id", instance.id);

        if (isFullyConnected) {
          console.log(`[Auto-Reconnect] Instance ${instance.instance_name} marked as connected`);
        }
      }

      // Delay between instances
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success && r.action !== "skipped").length;
    const skippedCount = results.filter(r => r.action === "skipped").length;
    const statusSyncCount = results.filter(r => r.action === "status_sync").length;
    const ghostsDetected = results.filter(r => r.message.includes("ghost") || r.action === "ghost_logout").length;
    const qrNeededCount = qrCodesNeeded.length;

    console.log(`[Auto-Reconnect] Summary: ${successCount} successful (${statusSyncCount} verified), ${failedCount} failed, ${skippedCount} skipped, ${qrNeededCount} need QR`);

    if (results.length > 0 && results.some(r => r.action !== "skipped")) {
      await supabaseClient.from("admin_notification_logs").insert({
        event_type: "AUTO_RECONNECT_ATTEMPT",
        event_key: `auto_reconnect_${now.toISOString().slice(0, 13)}`,
        email_sent_to: "system",
        metadata: {
          total_attempts: results.filter(r => r.action !== "skipped").length,
          successful: successCount,
          status_syncs: statusSyncCount,
          failed: failedCount,
          ghosts_detected: ghostsDetected,
          qr_needed: qrNeededCount,
          instances: results.map(r => ({
            name: r.instance_name,
            action: r.action,
            success: r.success,
            message: r.message,
          })),
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} instances`,
        summary: {
          total_checked: instances.length,
          qualified: instancesToReconnect.length,
          successful: successCount,
          failed: failedCount,
          skipped: skippedCount,
          qr_needed: qrNeededCount,
        },
        results,
        qr_codes_needed: qrCodesNeeded,
        checked_at: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Auto-Reconnect] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
