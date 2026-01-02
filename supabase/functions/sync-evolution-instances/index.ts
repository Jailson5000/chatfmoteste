import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvolutionInstance {
  instanceName: string;
  instanceId?: string;
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  status?: string;
  connectionStatus?: string;
  integration?: string;
}

interface SyncResult {
  connection_id: string;
  connection_name: string;
  api_url: string;
  evolution_instances: EvolutionInstance[];
  matched_instances: {
    instance_name: string;
    db_id: string | null;
    company_name: string | null;
    law_firm_name: string | null;
    phone_number: string | null;
    status: string;
    is_orphan: boolean; // Exists in Evolution but not in our DB
    is_stale: boolean;  // Exists in our DB but not in Evolution
  }[];
  total_evolution: number;
  total_db: number;
  orphan_count: number;
  stale_count: number;
}

function normalizeUrl(url: string): string {
  if (!url) return "";
  let normalized = url.trim().replace(/\/+$/, "");
  normalized = normalized.replace(/\/manager$/i, "");
  return normalized.toLowerCase();
}

async function fetchEvolutionInstances(
  apiUrl: string,
  apiKey: string
): Promise<EvolutionInstance[]> {
  const url = `${normalizeUrl(apiUrl)}/instance/fetchInstances`;
  
  console.log(`[Sync Evolution] Fetching instances from: ${url}`);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Sync Evolution] API error ${response.status}:`, text.slice(0, 200));
      throw new Error(`Evolution API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data)) {
      return data.map((inst: any) => ({
        instanceName: inst.instanceName || inst.name || inst.instance?.instanceName,
        instanceId: inst.instanceId || inst.id || inst.instance?.instanceId,
        owner: inst.owner || inst.instance?.owner,
        profileName: inst.profileName || inst.instance?.profileName,
        profilePictureUrl: inst.profilePictureUrl || inst.instance?.profilePictureUrl,
        status: inst.status || inst.connectionStatus || inst.state || "unknown",
        connectionStatus: inst.connectionStatus || inst.status || "unknown",
        integration: inst.integration,
      }));
    }
    
    if (data.instances && Array.isArray(data.instances)) {
      return data.instances;
    }
    
    return [];
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("Evolution API timeout");
    }
    throw error;
  }
}

function extractPhoneFromJid(jid?: string | null): string | null {
  if (!jid) return null;
  const number = jid.split("@")[0];
  return number || null;
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

    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check admin role
    const { data: isAdmin } = await supabaseClient.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const body = await req.json().catch(() => ({}));
    const connectionId = body.connectionId; // Optional: sync specific connection only

    // Fetch Evolution API connections
    let connectionsQuery = supabaseClient
      .from("evolution_api_connections")
      .select("*")
      .eq("is_active", true);
    
    if (connectionId) {
      connectionsQuery = connectionsQuery.eq("id", connectionId);
    }

    const { data: connections, error: connError } = await connectionsQuery;
    
    if (connError) {
      throw new Error(`Failed to fetch connections: ${connError.message}`);
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active Evolution API connections found",
          results: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all whatsapp_instances from our database
    const { data: dbInstances, error: dbError } = await supabaseClient
      .from("whatsapp_instances")
      .select("*");

    if (dbError) {
      throw new Error(`Failed to fetch DB instances: ${dbError.message}`);
    }

    // Fetch law firms and companies for mapping
    const { data: lawFirms } = await supabaseClient
      .from("law_firms")
      .select("id, name, subdomain");

    const { data: companies } = await supabaseClient
      .from("companies")
      .select("id, name, law_firm_id");

    const results: SyncResult[] = [];

    // Process each Evolution API connection
    for (const connection of connections) {
      console.log(`[Sync Evolution] Processing connection: ${connection.name} (${connection.api_url})`);
      
      try {
        const evolutionInstances = await fetchEvolutionInstances(
          connection.api_url,
          connection.api_key
        );

        console.log(`[Sync Evolution] Found ${evolutionInstances.length} instances in Evolution`);

        // Find DB instances that belong to this Evolution API (match by api_url)
        const normalizedApiUrl = normalizeUrl(connection.api_url);
        const dbInstancesForConnection = (dbInstances || []).filter(
          (inst) => normalizeUrl(inst.api_url) === normalizedApiUrl
        );

        console.log(`[Sync Evolution] Found ${dbInstancesForConnection.length} instances in DB for this connection`);

        // Create matched instances array
        const matchedInstances: SyncResult["matched_instances"] = [];
        const evolutionInstanceNames = new Set(
          evolutionInstances.map((ei) => ei.instanceName?.toLowerCase())
        );

        // Process Evolution instances
        for (const evoInstance of evolutionInstances) {
          const matchingDbInstance = dbInstancesForConnection.find(
            (dbi) => dbi.instance_name?.toLowerCase() === evoInstance.instanceName?.toLowerCase()
          );

          if (matchingDbInstance) {
            // Found matching DB instance
            const lawFirm = lawFirms?.find((lf) => lf.id === matchingDbInstance.law_firm_id);
            const company = companies?.find((c) => c.law_firm_id === matchingDbInstance.law_firm_id);

            // Determine real status from Evolution
            let realStatus = "unknown";
            const connStatus = (evoInstance.connectionStatus || evoInstance.status || "").toLowerCase();
            if (connStatus.includes("open") || connStatus.includes("connected")) {
              realStatus = "connected";
            } else if (connStatus.includes("close") || connStatus.includes("disconnected")) {
              realStatus = "disconnected";
            } else if (connStatus.includes("connecting")) {
              realStatus = "connecting";
            }

            matchedInstances.push({
              instance_name: evoInstance.instanceName,
              db_id: matchingDbInstance.id,
              company_name: company?.name || null,
              law_firm_name: lawFirm?.name || null,
              phone_number: extractPhoneFromJid(evoInstance.owner) || matchingDbInstance.phone_number,
              status: realStatus,
              is_orphan: false,
              is_stale: false,
            });

            // Update DB instance status if it differs
            if (realStatus !== "unknown" && realStatus !== matchingDbInstance.status) {
              console.log(`[Sync Evolution] Updating status for ${evoInstance.instanceName}: ${matchingDbInstance.status} -> ${realStatus}`);
              await supabaseClient
                .from("whatsapp_instances")
                .update({
                  status: realStatus,
                  phone_number: extractPhoneFromJid(evoInstance.owner) || matchingDbInstance.phone_number,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", matchingDbInstance.id);
            }
          } else {
            // Orphan: exists in Evolution but not in our DB
            matchedInstances.push({
              instance_name: evoInstance.instanceName,
              db_id: null,
              company_name: null,
              law_firm_name: null,
              phone_number: extractPhoneFromJid(evoInstance.owner),
              status: evoInstance.connectionStatus || evoInstance.status || "unknown",
              is_orphan: true,
              is_stale: false,
            });
          }
        }

        // Check for stale instances (in DB but not in Evolution)
        for (const dbInstance of dbInstancesForConnection) {
          if (!evolutionInstanceNames.has(dbInstance.instance_name?.toLowerCase())) {
            const lawFirm = lawFirms?.find((lf) => lf.id === dbInstance.law_firm_id);
            const company = companies?.find((c) => c.law_firm_id === dbInstance.law_firm_id);

            matchedInstances.push({
              instance_name: dbInstance.instance_name,
              db_id: dbInstance.id,
              company_name: company?.name || null,
              law_firm_name: lawFirm?.name || null,
              phone_number: dbInstance.phone_number,
              status: "not_found_in_evolution",
              is_orphan: false,
              is_stale: true,
            });
          }
        }

        const orphanCount = matchedInstances.filter((m) => m.is_orphan).length;
        const staleCount = matchedInstances.filter((m) => m.is_stale).length;

        results.push({
          connection_id: connection.id,
          connection_name: connection.name,
          api_url: connection.api_url,
          evolution_instances: evolutionInstances,
          matched_instances: matchedInstances,
          total_evolution: evolutionInstances.length,
          total_db: dbInstancesForConnection.length,
          orphan_count: orphanCount,
          stale_count: staleCount,
        });

        // Update connection health status
        await supabaseClient
          .from("evolution_api_connections")
          .update({
            health_status: "online",
            last_health_check_at: new Date().toISOString(),
          })
          .eq("id", connection.id);

      } catch (error: any) {
        console.error(`[Sync Evolution] Error processing connection ${connection.name}:`, error);
        
        results.push({
          connection_id: connection.id,
          connection_name: connection.name,
          api_url: connection.api_url,
          evolution_instances: [],
          matched_instances: [],
          total_evolution: 0,
          total_db: 0,
          orphan_count: 0,
          stale_count: 0,
        });

        // Update connection health status to offline
        await supabaseClient
          .from("evolution_api_connections")
          .update({
            health_status: "offline",
            last_health_check_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
      }
    }

    console.log(`[Sync Evolution] Completed sync for ${results.length} connections`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${results.length} Evolution API connections`,
        results,
        synced_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[Sync Evolution] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: error.message.includes("Unauthorized") ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
