import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration
const CONNECTING_THRESHOLD_MINUTES = 5; // Consider stale if "connecting" for more than 5 min
const DISCONNECTED_THRESHOLD_MINUTES = 10; // Try to reconnect if disconnected for more than 10 min
const MAX_RECONNECT_ATTEMPTS_PER_HOUR = 3; // Limit attempts to avoid spam

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
}

interface ReconnectResult {
  instance_id: string;
  instance_name: string;
  success: boolean;
  action: string;
  message: string;
  qrcode?: string;
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

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  // Reset counter if last attempt was more than an hour ago
  if (lastAttempt < hourAgo) {
    return { skip: false, reason: "" };
  }

  // Check if we've hit the limit
  if (instance.reconnect_attempts_count >= MAX_RECONNECT_ATTEMPTS_PER_HOUR) {
    return { 
      skip: true, 
      reason: `Max attempts (${MAX_RECONNECT_ATTEMPTS_PER_HOUR}) reached in the last hour` 
    };
  }

  return { skip: false, reason: "" };
}

// Try to restart the instance via Evolution API
async function attemptRestart(instance: InstanceToReconnect): Promise<ReconnectResult> {
  const apiUrl = normalizeUrl(instance.api_url);
  
  try {
    console.log(`[Auto-Reconnect] Attempting restart for ${instance.instance_name}...`);
    
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
      console.log(`[Auto-Reconnect] Restart successful for ${instance.instance_name}`);
      return {
        instance_id: instance.id,
        instance_name: instance.instance_name,
        success: true,
        action: "restart",
        message: "Instance restarted successfully",
      };
    }

    const errorText = await restartResponse.text().catch(() => "");
    console.log(`[Auto-Reconnect] Restart returned ${restartResponse.status}: ${errorText.slice(0, 200)}`);

    // If restart fails with 404 or similar, instance may not exist - try connect
    if (restartResponse.status === 404 || restartResponse.status === 400) {
      return await attemptConnect(instance);
    }

    return {
      instance_id: instance.id,
      instance_name: instance.instance_name,
      success: false,
      action: "restart",
      message: `Restart failed with status ${restartResponse.status}`,
    };
  } catch (error: any) {
    console.error(`[Auto-Reconnect] Restart error for ${instance.instance_name}:`, error);
    
    // Try connect as fallback
    return await attemptConnect(instance);
  }
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
        console.log(`[Auto-Reconnect] Connect returned QR code for ${instance.instance_name} - needs manual scan`);
        return {
          instance_id: instance.id,
          instance_name: instance.instance_name,
          success: false, // Not fully successful, needs QR scan
          action: "connect",
          message: "Session expired - QR code scan required",
          qrcode: qrcode,
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

      // Update attempt counter BEFORE trying
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const lastAttempt = instance.last_reconnect_attempt_at 
        ? new Date(instance.last_reconnect_attempt_at) 
        : null;
      
      const newAttemptCount = (lastAttempt && lastAttempt >= hourAgo) 
        ? (instance.reconnect_attempts_count || 0) + 1 
        : 1;

      await supabaseClient
        .from("whatsapp_instances")
        .update({
          reconnect_attempts_count: newAttemptCount,
          last_reconnect_attempt_at: now.toISOString(),
        })
        .eq("id", instance.id);

      // Try restart first, then connect if restart fails
      const result = await attemptRestart(instance);
      results.push(result);

      // Track instances that need QR code
      if (result.qrcode) {
        qrCodesNeeded.push({
          instance_name: instance.instance_name,
          law_firm_id: instance.law_firm_id,
        });
      }

      // Update instance status based on result
      if (result.success) {
        await supabaseClient
          .from("whatsapp_instances")
          .update({
            status: "connecting", // Will be updated by webhook when fully connected
            updated_at: now.toISOString(),
          })
          .eq("id", instance.id);
      }

      // Small delay between instances to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success && r.action !== "skipped").length;
    const skippedCount = results.filter(r => r.action === "skipped").length;
    const qrNeededCount = qrCodesNeeded.length;

    console.log(`[Auto-Reconnect] Summary: ${successCount} successful, ${failedCount} failed, ${skippedCount} skipped, ${qrNeededCount} need QR scan`);

    // Log the action in admin_notification_logs if there were attempts
    if (results.length > 0 && results.some(r => r.action !== "skipped")) {
      await supabaseClient.from("admin_notification_logs").insert({
        event_type: "AUTO_RECONNECT_ATTEMPT",
        event_key: `auto_reconnect_${now.toISOString().slice(0, 13)}`,
        email_sent_to: "system", // No email sent, just logging
        metadata: {
          total_attempts: results.filter(r => r.action !== "skipped").length,
          successful: successCount,
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
