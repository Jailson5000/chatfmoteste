import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface CleanupRequest {
  law_firm_ids: string[];
  confirm_data_deletion: boolean;
}

interface CleanupResponse {
  success: boolean;
  deleted_count: number;
  errors: { law_firm_id: string; error: string }[];
  audit_log_ids: string[];
  message?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth header to verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;

    // Create service role client for operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is a global admin (super_admin only for this destructive operation)
    const { data: adminRole } = await supabase
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!adminRole || adminRole.role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Apenas super_admin pode executar limpeza de órfãos" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: CleanupRequest = await req.json();
    const { law_firm_ids, confirm_data_deletion } = body;

    if (!law_firm_ids || law_firm_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum law_firm_id fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[cleanup-orphan-lawfirm] Starting cleanup of ${law_firm_ids.length} law firm(s) by admin ${userId}`);

    const errors: { law_firm_id: string; error: string }[] = [];
    const auditLogIds: string[] = [];
    let deletedCount = 0;

    for (const lawFirmId of law_firm_ids) {
      try {
        // First, verify this law_firm is actually an orphan (no company associated)
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("law_firm_id", lawFirmId)
          .single();

        if (company) {
          errors.push({ law_firm_id: lawFirmId, error: "Este law_firm tem uma company associada" });
          continue;
        }

        // Fetch law_firm details for audit log
        const { data: lawFirm } = await supabase
          .from("law_firms")
          .select("name, subdomain, email")
          .eq("id", lawFirmId)
          .single();

        if (!lawFirm) {
          errors.push({ law_firm_id: lawFirmId, error: "Law firm não encontrado" });
          continue;
        }

        // Check if it has data and confirmation is required
        const { count: msgCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("law_firm_id", lawFirmId);

        const { count: clientCount } = await supabase
          .from("clients")
          .select("*", { count: "exact", head: true })
          .eq("law_firm_id", lawFirmId);

        const hasData = (msgCount || 0) > 0 || (clientCount || 0) > 0;

        if (hasData && !confirm_data_deletion) {
          errors.push({ law_firm_id: lawFirmId, error: "Este law_firm possui dados. Confirme a exclusão." });
          continue;
        }

        // Collect metrics before deletion for audit log
        const { count: userCount } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("law_firm_id", lawFirmId);

        const { count: convCount } = await supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("law_firm_id", lawFirmId);

        const deletedData = {
          name: lawFirm.name,
          subdomain: lawFirm.subdomain,
          email: lawFirm.email,
          users_deleted: userCount || 0,
          conversations_deleted: convCount || 0,
          clients_deleted: clientCount || 0,
          messages_deleted: msgCount || 0,
        };

        console.log(`[cleanup-orphan-lawfirm] Deleting law_firm "${lawFirm.name}" (${lawFirmId})`);

        // Delete in correct order to respect foreign keys
        // 1. Messages (via conversations)
        await supabase.from("messages").delete().eq("law_firm_id", lawFirmId);
        
        // 2. Client-related data
        await supabase.from("client_tags").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("client_memories").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("scheduled_follow_ups").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("client_actions").delete().eq("law_firm_id", lawFirmId);
        
        // 3. Clients
        await supabase.from("clients").delete().eq("law_firm_id", lawFirmId);
        
        // 4. Conversations
        await supabase.from("conversations").delete().eq("law_firm_id", lawFirmId);
        
        // 5. Agent/Automation related
        await supabase.from("agent_knowledge").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("automations").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("knowledge_items").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agent_folders").delete().eq("law_firm_id", lawFirmId);
        
        // 6. Organization data
        await supabase.from("departments").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("custom_statuses").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("status_follow_ups").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("tags").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("templates").delete().eq("law_firm_id", lawFirmId);
        
        // 7. Settings and integrations
        await supabase.from("law_firm_settings").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("whatsapp_instances").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("google_calendar_integrations").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("tray_chat_integrations").delete().eq("law_firm_id", lawFirmId);
        
        // 8. Tasks
        await supabase.from("task_comments").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("task_activity_log").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("tasks").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("task_categories").delete().eq("law_firm_id", lawFirmId);
        
        // 9. Agenda Pro
        await supabase.from("agenda_pro_scheduled_messages").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_activity_log").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_appointments").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_clients").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_service_professionals").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_service_resources").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_services").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_working_hours").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_breaks").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_time_off").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_professionals").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_resources").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_holidays").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("agenda_pro_settings").delete().eq("law_firm_id", lawFirmId);
        
        // 10. Support tickets
        await supabase.from("ticket_messages").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("support_tickets").delete().eq("law_firm_id", lawFirmId);
        
        // 11. Notifications and usage
        await supabase.from("notifications").delete().eq("law_firm_id", lawFirmId);
        await supabase.from("usage_tracking").delete().eq("law_firm_id", lawFirmId);
        
        // 12. User roles (before profiles)
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("law_firm_id", lawFirmId);
        
        if (profiles && profiles.length > 0) {
          const userIds = profiles.map(p => p.id);
          await supabase.from("user_roles").delete().in("user_id", userIds);
        }
        
        // 13. Profiles (unlink from law_firm, don't delete auth.users)
        // We set law_firm_id to null rather than deleting, to preserve auth.users
        await supabase
          .from("profiles")
          .update({ law_firm_id: null })
          .eq("law_firm_id", lawFirmId);
        
        // 14. Finally, delete the law_firm
        const { error: deleteError } = await supabase
          .from("law_firms")
          .delete()
          .eq("id", lawFirmId);

        if (deleteError) {
          throw deleteError;
        }

        // Create audit log entry
        const { data: auditLog } = await supabase
          .from("audit_logs")
          .insert({
            admin_user_id: userId,
            action: "ORPHAN_LAWFIRM_DELETED",
            entity_type: "law_firm",
            entity_id: lawFirmId,
            old_values: deletedData,
            new_values: null,
          })
          .select("id")
          .single();

        if (auditLog) {
          auditLogIds.push(auditLog.id);
        }

        deletedCount++;
        console.log(`[cleanup-orphan-lawfirm] Successfully deleted law_firm "${lawFirm.name}"`);
      } catch (err: any) {
        console.error(`[cleanup-orphan-lawfirm] Error deleting ${lawFirmId}:`, err);
        errors.push({ law_firm_id: lawFirmId, error: err.message || "Erro desconhecido" });
      }
    }

    const response: CleanupResponse = {
      success: errors.length === 0,
      deleted_count: deletedCount,
      errors,
      audit_log_ids: auditLogIds,
      message: `${deletedCount} law firm(s) excluído(s) com sucesso${errors.length > 0 ? `, ${errors.length} erro(s)` : ""}`,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[cleanup-orphan-lawfirm] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
