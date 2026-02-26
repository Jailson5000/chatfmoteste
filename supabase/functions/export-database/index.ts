import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 1000;

async function validateSuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return { error: "Unauthorized", status: 401 };
  }

  const userId = claimsData.claims.sub;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: adminRole } = await adminClient
    .from("admin_user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!adminRole) {
    return { error: "Forbidden: admin only", status: 403 };
  }

  return { adminClient, userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const validation = await validateSuperAdmin(req);
    if ("error" in validation) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: validation.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { adminClient } = validation;
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    // ── LIST ──
    if (action === "list") {
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

      const counts: Record<string, number> = {};
      for (const table of knownTables) {
        try {
          const { count } = await adminClient
            .from(table)
            .select("*", { count: "exact", head: true });
          counts[table] = count ?? 0;
        } catch {
          counts[table] = -1;
        }
      }

      // Auth users count
      let authUsersCount = 0;
      try {
        const { data: authPage } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
        // listUsers returns { users, aud } — we need total from response
        // Unfortunately the admin API doesn't return total count directly in all versions
        // We'll do a full count via pagination
        let page = 1;
        let total = 0;
        while (true) {
          const { data } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
          if (!data?.users?.length) break;
          total += data.users.length;
          if (data.users.length < 1000) break;
          page++;
        }
        authUsersCount = total;
      } catch (e) {
        console.error("[export-database] Error counting auth users:", e);
        authUsersCount = -1;
      }

      // Storage buckets count
      let storageBuckets: { name: string; id: string; objectCount: number }[] = [];
      try {
        const { data: buckets } = await adminClient.storage.listBuckets();
        if (buckets) {
          for (const bucket of buckets) {
            let objCount = 0;
            try {
              const { data: objects } = await adminClient.storage.from(bucket.id).list("", { limit: 1, offset: 0 });
              // We can't get exact count easily, we'll estimate
              // For the list view, just show bucket exists
              objCount = objects?.length ?? 0;
            } catch { /* ignore */ }
            storageBuckets.push({ name: bucket.name, id: bucket.id, objectCount: objCount });
          }
        }
      } catch (e) {
        console.error("[export-database] Error listing storage:", e);
      }

      return new Response(JSON.stringify({
        tables: knownTables,
        counts,
        internal: {
          auth_users: authUsersCount,
          storage_buckets: storageBuckets,
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── EXPORT PUBLIC TABLE ──
    if (action === "export") {
      const tableName = body.table;
      if (!tableName || typeof tableName !== "string") {
        return new Response(JSON.stringify({ error: "table is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
        return new Response(JSON.stringify({ error: "Invalid table name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

    // ── EXPORT AUTH USERS ──
    if (action === "export-auth-users") {
      const allUsers: any[] = [];
      let page = 1;

      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) {
          return new Response(
            JSON.stringify({ error: `Failed to export auth users: ${error.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!data?.users?.length) break;

        // Map to safe fields (Admin API never returns encrypted_password anyway)
        for (const user of data.users) {
          allUsers.push({
            id: user.id,
            aud: user.aud,
            role: user.role,
            email: user.email,
            email_confirmed_at: user.email_confirmed_at,
            phone: user.phone,
            phone_confirmed_at: user.phone_confirmed_at,
            confirmed_at: user.confirmed_at,
            last_sign_in_at: user.last_sign_in_at,
            app_metadata: user.app_metadata,
            user_metadata: user.user_metadata,
            identities: user.identities,
            created_at: user.created_at,
            updated_at: user.updated_at,
            is_anonymous: user.is_anonymous,
            banned_until: user.banned_until,
          });
        }

        if (data.users.length < 1000) break;
        page++;

        // Safety: max 50k users
        if (allUsers.length >= 50000) {
          console.warn("[export-database] Truncated auth users at 50k");
          break;
        }
      }

      return new Response(
        JSON.stringify({ table: "_auth_users", rows: allUsers, count: allUsers.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── EXPORT STORAGE ──
    if (action === "export-storage") {
      const result: { buckets: any[]; objects: Record<string, any[]> } = {
        buckets: [],
        objects: {},
      };

      const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets();
      if (bucketsError) {
        return new Response(
          JSON.stringify({ error: `Failed to list storage buckets: ${bucketsError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      result.buckets = buckets || [];

      for (const bucket of (buckets || [])) {
        const bucketObjects: any[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data: objects, error } = await adminClient.storage
            .from(bucket.id)
            .list("", { limit: PAGE_SIZE, offset });

          if (error) {
            console.error(`[export-database] Error listing objects in ${bucket.id}:`, error);
            break;
          }

          if (!objects?.length) break;
          bucketObjects.push(...objects);
          hasMore = objects.length === PAGE_SIZE;
          offset += PAGE_SIZE;

          // Safety: max 10k objects per bucket
          if (offset >= 10000) {
            console.warn(`[export-database] Truncated storage objects in ${bucket.id} at 10k`);
            break;
          }
        }

        result.objects[bucket.id] = bucketObjects;
      }

      const totalObjects = Object.values(result.objects).reduce((sum, arr) => sum + arr.length, 0);

      return new Response(
        JSON.stringify({
          table: "_storage",
          buckets: result.buckets,
          objects: result.objects,
          count: totalObjects,
        }),
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
