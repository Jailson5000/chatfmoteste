import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller is admin
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminRole } = await adminClient
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "list") {
      // List all public tables with row counts
      const { data: tables, error } = await adminClient.rpc("", {}).maybeSingle();
      
      // Use information_schema to get table list
      const { data: tableList, error: tableError } = await adminClient
        .from("information_schema.tables" as any)
        .select("table_name")
        .eq("table_schema", "public")
        .eq("table_type", "BASE TABLE");

      // Fallback: hardcoded list of known public tables
      const knownTables = [
        "addon_requests", "admin_notification_logs", "admin_profiles", "admin_user_roles",
        "agenda_pro_activity_log", "agenda_pro_appointments", "agenda_pro_breaks",
        "agenda_pro_clients", "agenda_pro_holidays", "agenda_pro_professionals",
        "agenda_pro_resources", "agenda_pro_scheduled_messages", "agenda_pro_service_professionals",
        "agenda_pro_service_resources", "agenda_pro_services", "agenda_pro_settings",
        "agenda_pro_time_off", "agenda_pro_working_hours", "agent_folders", "agent_knowledge",
        "agent_templates", "ai_api_configs", "ai_template_base", "audit_logs", "automations",
        "birthday_settings", "business_hours", "cases", "client_actions", "client_memories",
        "client_tags", "clients", "companies", "company_usage_tracking", "conversations",
        "custom_statuses", "dashboard_daily_snapshots", "departments", "documents",
        "evolution_api_connections", "google_calendar_events", "infrastructure_alerts",
        "instance_status_history", "knowledge_items", "law_firm_settings", "law_firms",
        "member_department_access", "member_departments", "messages", "messages_archive",
        "meta_connections", "n8n_workflow_configs", "notification_preferences", "notifications",
        "onboarding_steps", "plans", "profiles", "scheduled_follow_ups", "status_follow_ups",
        "support_tickets", "system_alert", "system_settings", "tags", "task_activity_log",
        "task_alert_settings", "task_categories", "task_comments", "tasks",
        "template_knowledge_items", "templates", "tray_chat_integrations",
        "tutorial_items", "tutorial_progress", "tutorials",
        "usage_tracking", "user_device_sessions", "user_roles",
        "webhook_logs", "whatsapp_cloud_configs", "whatsapp_instances",
      ];

      // Get counts for each table
      const counts: Record<string, number> = {};
      for (const table of knownTables) {
        try {
          const { count } = await adminClient
            .from(table)
            .select("*", { count: "exact", head: true });
          counts[table] = count ?? 0;
        } catch {
          counts[table] = -1; // error
        }
      }

      return new Response(JSON.stringify({ tables: knownTables, counts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "export") {
      const tableName = body.table;
      if (!tableName || typeof tableName !== "string") {
        return new Response(JSON.stringify({ error: "table is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sanitize table name (only allow alphanumeric + underscore)
      if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
        return new Response(JSON.stringify({ error: "Invalid table name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Paginated export
      const allRows: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await adminClient
          .from(tableName)
          .select("*")
          .range(offset, offset + PAGE_SIZE - 1)
          .order("created_at", { ascending: true, nullsFirst: true });

        if (error) {
          // Try without ordering (some tables may not have created_at)
          const { data: data2, error: error2 } = await adminClient
            .from(tableName)
            .select("*")
            .range(offset, offset + PAGE_SIZE - 1);

          if (error2) {
            return new Response(
              JSON.stringify({ error: `Failed to export ${tableName}: ${error2.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          if (data2) allRows.push(...data2);
          hasMore = (data2?.length ?? 0) === PAGE_SIZE;
        } else {
          if (data) allRows.push(...data);
          hasMore = (data?.length ?? 0) === PAGE_SIZE;
        }

        offset += PAGE_SIZE;

        // Safety: max 100k rows per table
        if (offset >= 100000) {
          console.warn(`[export-database] Truncated ${tableName} at 100k rows`);
          break;
        }
      }

      return new Response(
        JSON.stringify({ table: tableName, rows: allRows, count: allRows.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[export-database] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
