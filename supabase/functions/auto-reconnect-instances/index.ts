import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration - 3 attempts in 3 minutes (1 per minute)
const CONNECTING_THRESHOLD_MINUTES = 1; // Try after 1 min if stuck in "connecting"
const DISCONNECTED_THRESHOLD_MINUTES = 1; // Try after 1 min if disconnected
const MAX_RECONNECT_ATTEMPTS = 3; // Total 3 attempts per disconnection cycle
const ATTEMPT_WINDOW_MINUTES = 3; // Window for counting attempts

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

// Helper to normalize URL
function normalizeUrl(url: string): string {
  let normalized = url.replace(/\/+$/, "");
  normalized = normalized.replace(/\/manager$/i, "");
  return normalized;
}

// Helper for timeout fetch
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

// Check if instance should skip reconnection (too many recent attempts)
function shouldSkipReconnect(instance: InstanceToReconnect): { skip: boolean; reason: string } {
  const lastAttempt = instance.last_reconnect_attempt_at 
    ? new Date(instance.last_reconnect_attempt_at) 
    : null;
  
  if (!lastAttempt) {
    return { skip: false, reason: "" };
  }

  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  
  // Reset counter if last attempt was outside the window
  if (lastAttempt < windowStart) {
    return { skip: false, reason: "" };
  }

  // Check if we've hit the limit (3 attempts in 3 minutes)
  if (instance.reconnect_attempts_count >= MAX_RECONNECT_ATTEMPTS) {
    return { 
      skip: true, 
      reason: `Max attempts (${MAX_RECONNECT_ATTEMPTS}) reached in ${ATTEMPT_WINDOW_MINUTES} minutes - QR scan required` 
    };
  }

  return { skip: false, reason: "" };
}


// Try to connect the instance (may return QR code)
async function attemptConnect(instance: InstanceToReconnect): Promise<ReconnectResult> {
  const apiUrl = normalizeUrl(instance.api_url);
  
  try {
    console.log(`[Auto-Reconnect] Attempting connect for ${instance.instance_name}...`);
    
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
      
      // Check if we got connected or need QR code
      const state = data?.instance?.state || data?.state;
      const qrcode = data?.base64 || data?.qrcode?.base64;
      
      if (state === "open" || state === "connected") {
        console.log(`[Auto-Reconnect] Connect successful for ${instance.instance_name} - already connected`);
        return {
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: true,
          action: "connect",
          message: "Instance reconnected automatically",
        };
      }
      
      if (qrcode) {
        console.log(`[Auto-Reconnect] Connect returned QR code for ${instance.instance_name} - marking as awaiting_qr to stop further attempts`);
        return {
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: false, // Not fully successful, needs QR scan
          action: "connect",
          message: "Session expired - QR code scan required",
          qrcode: qrcode,
          needs_qr: true, // Flag to update awaiting_qr in database
        };
      }

      console.log(`[Auto-Reconnect] Connect initiated for ${instance.instance_name}, state: ${state}`);
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

// Check if instance is actually connected on Evolution API before attempting restart
// This catches cases where the DB is out of sync but session is still active
async function checkConnectionState(instance: InstanceToReconnect): Promise<{
  isConnected: boolean;
  state: string;
}> {
  const apiUrl = normalizeUrl(instance.api_url);
  
  try {
    console.log(`[Auto-Reconnect] Checking connection state for ${instance.instance_name}...`);
    
    const statusResponse = await fetchWithTimeout(
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

    if (!statusResponse.ok) {
      console.log(`[Auto-Reconnect] Connection state check returned ${statusResponse.status}`);
      return { isConnected: false, state: "unknown" };
    }

    const data = await statusResponse.json();
    const state = data.state || data.instance?.state || "unknown";
    const isConnected = state === "open" || state === "connected";
    
    console.log(`[Auto-Reconnect] Connection state for ${instance.instance_name}: ${state} (connected: ${isConnected})`);
    
    return { isConnected, state };
  } catch (error: any) {
    console.log(`[Auto-Reconnect] Connection state check failed for ${instance.instance_name}:`, error.message);
    return { isConnected: false, state: "error" };
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

    console.log("[Auto-Reconnect] Starting auto-reconnection check...");
    console.log(`[Auto-Reconnect] Thresholds: connecting=${CONNECTING_THRESHOLD_MINUTES}min, disconnected=${DISCONNECTED_THRESHOLD_MINUTES}min`);

    const now = new Date();
    const connectingThreshold = new Date(now.getTime() - CONNECTING_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const disconnectedThreshold = new Date(now.getTime() - DISCONNECTED_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    // Find instances that need reconnection:
    // 1. Status "connecting" for more than X minutes (stuck in connecting)
    // 2. Status "disconnected" for more than Y minutes (disconnected but not by user logout)
    // We fetch all and filter in code because Supabase's .or() doesn't combine well with multiple conditions
    const { data: rawInstances, error: fetchError } = await supabaseClient
      .from("whatsapp_instances")
      .select("id, instance_name, status, api_url, api_key, law_firm_id, disconnected_since, reconnect_attempts_count, last_reconnect_attempt_at, manual_disconnect, awaiting_qr")
      .in("status", ["connecting", "disconnected"])
      .not("api_url", "is", null)
      .not("api_key", "is", null);

    if (fetchError) {
      console.error("[Auto-Reconnect] Error fetching instances:", fetchError);
      throw fetchError;
    }

    // Filter out instances that should NOT be auto-reconnected:
    // - manual_disconnect = true (user intentionally disconnected)
    // - awaiting_qr = true (waiting for user to scan QR code)
    const instances = (rawInstances || []).filter(instance => {
      // Skip if manually disconnected
      if (instance.manual_disconnect === true) {
        console.log(`[Auto-Reconnect] Skipping ${instance.instance_name}: manual_disconnect=true`);
        return false;
      }
      // Skip if awaiting QR scan
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

    // Filter instances based on time thresholds
    const instancesToReconnect: InstanceToReconnect[] = [];

    for (const instance of instances) {
      // Use disconnected_since for timing, or fall back to checking if we should try anyway
      const disconnectedSince = instance.disconnected_since 
        ? new Date(instance.disconnected_since) 
        : null;

      if (instance.status === "connecting") {
        // For "connecting" status, we need it to be stuck for at least CONNECTING_THRESHOLD_MINUTES
        if (disconnectedSince && disconnectedSince.toISOString() <= connectingThreshold) {
          instancesToReconnect.push(instance as InstanceToReconnect);
        } else if (!disconnectedSince) {
          // If no timestamp, assume it needs help
          instancesToReconnect.push(instance as InstanceToReconnect);
        }
      } else if (instance.status === "disconnected") {
        // For "disconnected" status, wait DISCONNECTED_THRESHOLD_MINUTES before trying
        if (disconnectedSince && disconnectedSince.toISOString() <= disconnectedThreshold) {
          instancesToReconnect.push(instance as InstanceToReconnect);
        }
      }
    }

    console.log(`[Auto-Reconnect] ${instancesToReconnect.length} instances qualify for reconnection attempt`);

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

    // Attempt reconnection for each qualifying instance
    const results: ReconnectResult[] = [];
    const qrCodesNeeded: { instance_name: string; law_firm_id: string }[] = [];

    for (const instance of instancesToReconnect) {
      // Check rate limiting
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

      // STEP 1: Check if instance is actually connected in Evolution API
      // This catches cases where the DB is out of sync but session is still active
      const connectionCheck = await checkConnectionState(instance);

      if (connectionCheck.isConnected) {
        console.log(`[Auto-Reconnect] Instance ${instance.instance_name} is actually connected in Evolution API - updating DB only`);
        
        // Update database to connected status - no restart needed!
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
        
        results.push({
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: true,
          action: "status_sync",
          message: `Instance was already connected (state: ${connectionCheck.state}) - database synced`,
        });
        
        // Small delay between instances
        await new Promise(resolve => setTimeout(resolve, 500));
        continue; // Skip to next instance, no restart needed
      }

      // STEP 2: If not connected, proceed with restart attempt
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
        })
        .eq("id", instance.id);

      // Try connect directly (restart endpoint removed in Evolution API v2.3+)
      const result = await attemptConnect(instance);
      results.push(result);

      // Track instances that need QR code
      if (result.qrcode || result.needs_qr) {
        qrCodesNeeded.push({
          instance_name: instance.instance_name,
          law_firm_id: instance.law_firm_id,
        });
        
        // CRITICAL: Mark instance as awaiting_qr to STOP future auto-reconnect attempts
        // User must manually scan QR - no point in auto-reconnecting anymore
        console.log(`[Auto-Reconnect] Setting awaiting_qr=true for ${instance.instance_name} to stop reconnection loop`);
        await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: "awaiting_qr",
            awaiting_qr: true,
            updated_at: now.toISOString(),
          })
          .eq("id", instance.id);
      } else if (!result.success && newAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
        // Max attempts reached without success - mark as awaiting QR to stop loop
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
        // Check if the connection returned "already connected" state
        const isFullyConnected = result.message.includes("reconnected automatically") || 
                                 result.message.includes("already connected");
        
        // Update instance status based on result
        await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: isFullyConnected ? "connected" : "connecting",
            // If fully connected, reset all reconnection-related fields
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
          console.log(`[Auto-Reconnect] Instance ${instance.instance_name} marked as connected in database`);
        }
      }

      // Small delay between instances to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success && r.action !== "skipped").length;
    const skippedCount = results.filter(r => r.action === "skipped").length;
    const statusSyncCount = results.filter(r => r.action === "status_sync").length;
    const qrNeededCount = qrCodesNeeded.length;

    console.log(`[Auto-Reconnect] Summary: ${successCount} successful (${statusSyncCount} status syncs), ${failedCount} failed, ${skippedCount} skipped, ${qrNeededCount} need QR scan`);

    // Log the action in admin_notification_logs if there were attempts
    if (results.length > 0 && results.some(r => r.action !== "skipped")) {
      await supabaseClient.from("admin_notification_logs").insert({
        event_type: "AUTO_RECONNECT_ATTEMPT",
        event_key: `auto_reconnect_${now.toISOString().slice(0, 13)}`,
        email_sent_to: "system", // No email sent, just logging
        metadata: {
          total_attempts: results.filter(r => r.action !== "skipped").length,
          successful: successCount,
          status_syncs: statusSyncCount,
          failed: failedCount,
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
