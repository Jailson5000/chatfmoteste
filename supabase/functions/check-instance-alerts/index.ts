import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration - alert after 5 minutes of disconnection
const ALERT_THRESHOLD_MINUTES = 5;
// Threshold for "connecting" status - should be longer as it might be in progress
const CONNECTING_ALERT_THRESHOLD_MINUTES = 30;
// NO COOLDOWN - We only send ONE alert per disconnection cycle
// The alert_sent_for_current_disconnect flag is reset when instance reconnects

interface DisconnectedInstance {
  id: string;
  instance_name: string;
  display_name: string | null;
  status: string;
  phone_number: string | null;
  disconnected_since: string | null;
  last_alert_sent_at: string | null;
  alert_sent_for_current_disconnect: boolean | null;
  law_firm_id: string;
  manual_disconnect: boolean | null;
  awaiting_qr: boolean | null;
  updated_at: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  email: string | null;
  law_firm_id: string;
  admin_user_id: string | null;
}

interface AdminProfile {
  id: string;
  email: string;
  full_name: string;
  law_firm_id: string;
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

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const globalAdminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");

    if (!resendApiKey) {
      console.log("[Check Instance Alerts] Missing RESEND_API_KEY");
      return new Response(
        JSON.stringify({ success: false, error: "Email configuration missing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);
    const thresholdTime = new Date(Date.now() - ALERT_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const connectingThresholdTime = new Date(Date.now() - CONNECTING_ALERT_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    console.log("[Check Instance Alerts] Checking for disconnected instances...");
    console.log(`[Check Instance Alerts] Threshold: ${ALERT_THRESHOLD_MINUTES} min (disconnected), ${CONNECTING_ALERT_THRESHOLD_MINUTES} min (connecting)`);

    // Find instances that:
    // 1. Are disconnected/error status for more than ALERT_THRESHOLD_MINUTES
    // 2. OR are stuck in "connecting" status for more than CONNECTING_ALERT_THRESHOLD_MINUTES
    // 3. Were NOT manually disconnected
    // 4. Are NOT awaiting QR scan
    // 5. Have NOT already received an alert for THIS disconnection cycle
    
    // First, get disconnected/error instances
    const { data: disconnectedInstances, error: fetchError1 } = await supabaseClient
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, status, phone_number, disconnected_since, last_alert_sent_at, alert_sent_for_current_disconnect, law_firm_id, manual_disconnect, awaiting_qr, updated_at")
      .in("status", ["disconnected", "error"])
      .not("disconnected_since", "is", null)
      .lt("disconnected_since", thresholdTime);

    // Also get instances stuck in "connecting" status for too long
    const { data: connectingInstances, error: fetchError2 } = await supabaseClient
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, status, phone_number, disconnected_since, last_alert_sent_at, alert_sent_for_current_disconnect, law_firm_id, manual_disconnect, awaiting_qr, updated_at")
      .eq("status", "connecting")
      .lt("updated_at", connectingThresholdTime);

    if (fetchError1 || fetchError2) {
      console.error("[Check Instance Alerts] Error fetching instances:", fetchError1 || fetchError2);
      throw fetchError1 || fetchError2;
    }

    // Combine and deduplicate
    const rawInstances = [...(disconnectedInstances || []), ...(connectingInstances || [])];

    // Filter out manually disconnected, awaiting QR, or already alerted instances
    const instances = (rawInstances || []).filter((instance: DisconnectedInstance) => {
      // Skip if manually disconnected
      if (instance.manual_disconnect === true) {
        console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: manual_disconnect=true`);
        return false;
      }
      // Skip if awaiting QR scan
      if (instance.awaiting_qr === true) {
        console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: awaiting_qr=true`);
        return false;
      }
      // Skip if already sent alert for THIS disconnection cycle
      if (instance.alert_sent_for_current_disconnect === true) {
        console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: alert already sent for this disconnect`);
        return false;
      }
      return true;
    });

    console.log(`[Check Instance Alerts] Found ${rawInstances?.length || 0} raw, ${instances.length} after filtering`);

    if (instances.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No alerts needed",
          checked_at: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique law_firm_ids
    const lawFirmIds = [...new Set(instances.map((i: DisconnectedInstance) => i.law_firm_id))];

    // Get companies and their admin info
    const { data: companies } = await supabaseClient
      .from("companies")
      .select("id, name, email, law_firm_id, admin_user_id")
      .in("law_firm_id", lawFirmIds);

    // Get admin profiles for companies that have admin_user_id
    const adminUserIds = (companies || [])
      .filter((c: CompanyInfo) => c.admin_user_id)
      .map((c: CompanyInfo) => c.admin_user_id);

    let adminProfiles: AdminProfile[] = [];
    if (adminUserIds.length > 0) {
      const { data: profiles } = await supabaseClient
        .from("profiles")
        .select("id, email, full_name, law_firm_id")
        .in("id", adminUserIds);
      adminProfiles = profiles || [];
    }

    // Also get profiles with admin role as fallback
    const { data: adminRoleProfiles } = await supabaseClient
      .from("profiles")
      .select("id, email, full_name, law_firm_id")
      .in("law_firm_id", lawFirmIds);

    const { data: adminRoles } = await supabaseClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", (adminRoleProfiles || []).map((p: AdminProfile) => p.id))
      .eq("role", "admin");

    const adminRoleUserIds = new Set((adminRoles || []).map((r: { user_id: string }) => r.user_id));

    // Group instances by company/law_firm for sending individual emails
    const instancesByLawFirm = new Map<string, DisconnectedInstance[]>();
    for (const instance of instances) {
      const existing = instancesByLawFirm.get(instance.law_firm_id) || [];
      existing.push(instance);
      instancesByLawFirm.set(instance.law_firm_id, existing);
    }

    const results: { law_firm_id: string; company_name: string; email: string; instances_count: number; success: boolean }[] = [];
    const notifiedInstanceIds: string[] = [];

    // Send email to each company's admin
    for (const [lawFirmId, companyInstances] of instancesByLawFirm) {
      const company = (companies || []).find((c: CompanyInfo) => c.law_firm_id === lawFirmId);
      
      // Find admin email - priority:
      // 1. Profile of company's admin_user_id
      // 2. Company email field
      // 3. Any profile with admin role in this law_firm
      // 4. Global admin email (fallback)
      let adminEmail: string | null = null;
      let adminName = "Administrador";

      if (company?.admin_user_id) {
        const adminProfile = adminProfiles.find((p: AdminProfile) => p.id === company.admin_user_id);
        if (adminProfile?.email) {
          adminEmail = adminProfile.email;
          adminName = adminProfile.full_name || "Administrador";
        }
      }

      if (!adminEmail && company?.email) {
        adminEmail = company.email;
      }

      if (!adminEmail) {
        // Find any admin in this law_firm
        const lawFirmAdmin = (adminRoleProfiles || []).find(
          (p: AdminProfile) => p.law_firm_id === lawFirmId && adminRoleUserIds.has(p.id)
        );
        if (lawFirmAdmin?.email) {
          adminEmail = lawFirmAdmin.email;
          adminName = lawFirmAdmin.full_name || "Administrador";
        }
      }

      if (!adminEmail) {
        // Fallback to global admin
        adminEmail = globalAdminEmail || null;
      }

      if (!adminEmail) {
        console.log(`[Check Instance Alerts] No admin email found for law_firm ${lawFirmId}`);
        continue;
      }

      const companyName = company?.name || "Sua empresa";

      // Calculate duration for each instance
      const instancesWithDuration = companyInstances.map((instance: DisconnectedInstance) => {
        // Use disconnected_since if available, otherwise use updated_at (for "connecting" status)
        const disconnectedAt = new Date(instance.disconnected_since || instance.updated_at);
        const durationMs = Date.now() - disconnectedAt.getTime();
        const durationMinutes = Math.floor(durationMs / 60000);
        const durationHours = Math.floor(durationMinutes / 60);
        const remainingMinutes = durationMinutes % 60;
        
        return {
          ...instance,
          duration: durationHours > 0 
            ? `${durationHours}h ${remainingMinutes}min`
            : `${durationMinutes} minutos`,
          durationMinutes,
        };
      });

      // Sort by duration (longest first)
      instancesWithDuration.sort((a, b) => b.durationMinutes - a.durationMinutes);

      // Helper to get status display
      const getStatusDisplay = (status: string) => {
        switch (status) {
          case 'error': return { text: 'Erro', bg: '#fee2e2', color: '#dc2626' };
          case 'connecting': return { text: 'Conectando', bg: '#dbeafe', color: '#2563eb' };
          default: return { text: 'Desconectada', bg: '#fef3c7', color: '#d97706' };
        }
      };

      // Build email HTML
      const instanceList = instancesWithDuration.map((instance) => {
        const statusDisplay = getStatusDisplay(instance.status);
        return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${instance.display_name || instance.instance_name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${instance.phone_number || "-"}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
              <span style="background: ${statusDisplay.bg}; color: ${statusDisplay.color}; padding: 4px 8px; border-radius: 4px; font-weight: 500;">
                ${statusDisplay.text}
              </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: 500; color: #dc2626;">${instance.duration}</td>
          </tr>
        `;
      }).join("");

      // Check if any instances are stuck in "connecting"
      const hasConnectingIssue = instancesWithDuration.some(i => i.status === 'connecting');
      const alertTitle = hasConnectingIssue 
        ? '⚠️ Alerta: WhatsApp com Problema de Conexão'
        : '⚠️ Alerta: WhatsApp Desconectado';
      const alertDescription = hasConnectingIssue
        ? `${instancesWithDuration.length === 1 ? 'sua conexão WhatsApp está com problema' : 'algumas de suas conexões WhatsApp estão com problema'}`
        : `${instancesWithDuration.length === 1 ? 'sua conexão WhatsApp está desconectada' : 'algumas de suas conexões WhatsApp estão desconectadas'}`;

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Alerta de Conexão WhatsApp</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 24px;">
              <h1 style="margin: 0; font-size: 22px;">${alertTitle}</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${companyName}</p>
            </div>
            
            <div style="padding: 24px;">
              <p style="margin: 0 0 16px 0;">Olá, ${adminName}!</p>
              
              <p style="margin: 0 0 20px 0;">
                Detectamos que ${alertDescription}:
              </p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background: #f3f4f6;">
                    <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px; color: #374151;">Conexão</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px; color: #374151;">Número</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px; color: #374151;">Status</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px; color: #374151;">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  ${instanceList}
                </tbody>
              </table>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚡ O que fazer?</strong><br>
                  Acesse o painel MIAUCHAT, vá em <strong>Conexões</strong> e reconecte seu WhatsApp escaneando o QR Code.
                </p>
              </div>
              
              <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                  <strong>💡 Dica:</strong> Enquanto desconectado, mensagens de clientes não serão recebidas e automações não funcionarão.
                </p>
              </div>
            </div>
            
            <div style="background: #f3f4f6; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Este alerta é enviado uma única vez por desconexão.<br>
                Você receberá um novo alerta somente se reconectar e a conexão cair novamente.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        console.log(`[Check Instance Alerts] Sending email to ${adminEmail} for ${companyName}`);
        
        const { error: emailError } = await resend.emails.send({
          from: "MIAUCHAT <onboarding@resend.dev>",
          to: [adminEmail],
          subject: `⚠️ WhatsApp desconectado - ${companyName}`,
          html: emailHtml,
        });

        if (emailError) {
          console.error(`[Check Instance Alerts] Email error for ${companyName}:`, emailError);
          results.push({
            law_firm_id: lawFirmId,
            company_name: companyName,
            email: adminEmail,
            instances_count: instancesWithDuration.length,
            success: false,
          });
        } else {
          console.log(`[Check Instance Alerts] Email sent to ${adminEmail}`);
          results.push({
            law_firm_id: lawFirmId,
            company_name: companyName,
            email: adminEmail,
            instances_count: instancesWithDuration.length,
            success: true,
          });
          
          // Track notified instances
          notifiedInstanceIds.push(...instancesWithDuration.map(i => i.id));
        }
      } catch (emailErr: unknown) {
        const errorMessage = emailErr instanceof Error ? emailErr.message : "Unknown error";
        console.error(`[Check Instance Alerts] Email exception for ${companyName}:`, emailErr);
        results.push({
          law_firm_id: lawFirmId,
          company_name: companyName,
          email: adminEmail,
          instances_count: instancesWithDuration.length,
          success: false,
        });
      }
    }

    // Mark instances as alerted for THIS disconnection cycle
    // This flag is reset when the instance reconnects (via webhook)
    if (notifiedInstanceIds.length > 0) {
      const { error: updateError } = await supabaseClient
        .from("whatsapp_instances")
        .update({ 
          last_alert_sent_at: new Date().toISOString(),
          alert_sent_for_current_disconnect: true // Prevents duplicate alerts until reconnection
        })
        .in("id", notifiedInstanceIds);

      if (updateError) {
        console.error("[Check Instance Alerts] Error updating alert timestamp:", updateError);
      }
    }

    // Log summary
    const successCount = results.filter(r => r.success).length;
    console.log(`[Check Instance Alerts] Summary: ${successCount}/${results.length} emails sent`);

    // Log to admin_notification_logs
    for (const result of results.filter(r => r.success)) {
      await supabaseClient.from("admin_notification_logs").insert({
        event_type: "INSTANCE_DISCONNECTION_ALERT",
        event_key: `instance_alert_${result.law_firm_id}_${new Date().toISOString().slice(0, 13)}`,
        email_sent_to: result.email,
        tenant_id: result.law_firm_id,
        company_name: result.company_name,
        metadata: {
          instances_count: result.instances_count,
          threshold_minutes: ALERT_THRESHOLD_MINUTES,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Alerts sent to ${successCount} companies`,
        results,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Check Instance Alerts] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});