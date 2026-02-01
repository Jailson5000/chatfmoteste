import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration
const ALERT_THRESHOLD_MINUTES = 5; // First alert after 5 min
const CONNECTING_ALERT_THRESHOLD_MINUTES = 10; // Alert if stuck connecting for 10 min
const REMINDER_THRESHOLD_HOURS = 24; // Send reminder after 24h if still disconnected
const ADMIN_ESCALATION_HOURS = 48; // Escalate to global admin after 48h
const MAX_ALERT_DURATION_HOURS = 48; // Stop alerting after 2 days - client decided to keep disconnected

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
  isReminder?: boolean; // Added for reminder tracking
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
    console.log(`[Check Instance Alerts] Thresholds: ${ALERT_THRESHOLD_MINUTES}min (first alert), ${REMINDER_THRESHOLD_HOURS}h (reminder), ${ADMIN_ESCALATION_HOURS}h (escalation)`);

    // Find disconnected/error instances
    const { data: disconnectedInstances, error: fetchError1 } = await supabaseClient
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, status, phone_number, disconnected_since, last_alert_sent_at, alert_sent_for_current_disconnect, law_firm_id, manual_disconnect, awaiting_qr, updated_at")
      .in("status", ["disconnected", "error"])
      .not("disconnected_since", "is", null)
      .lt("disconnected_since", thresholdTime);

    // Also get instances stuck in "connecting" status
    const { data: connectingInstances, error: fetchError2 } = await supabaseClient
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, status, phone_number, disconnected_since, last_alert_sent_at, alert_sent_for_current_disconnect, law_firm_id, manual_disconnect, awaiting_qr, updated_at")
      .eq("status", "connecting")
      .lt("updated_at", connectingThresholdTime);

    if (fetchError1 || fetchError2) {
      console.error("[Check Instance Alerts] Error fetching instances:", fetchError1 || fetchError2);
      throw fetchError1 || fetchError2;
    }

    const rawInstances = [...(disconnectedInstances || []), ...(connectingInstances || [])];

    // Filter instances - improved logic with reminder support and max duration limit
    const instances = (rawInstances || []).filter((instance: DisconnectedInstance) => {
      // Skip if manually disconnected
      if (instance.manual_disconnect === true) {
        console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: manual_disconnect=true`);
        return false;
      }

      // NEW: Check if disconnected for more than MAX_ALERT_DURATION_HOURS - stop alerting
      // If client hasn't reconnected after 2 days, they've decided to keep it disconnected
      if (instance.disconnected_since) {
        const hoursSinceDisconnect = (Date.now() - new Date(instance.disconnected_since).getTime()) / (1000 * 60 * 60);
        if (hoursSinceDisconnect >= MAX_ALERT_DURATION_HOURS) {
          console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: exceeded ${MAX_ALERT_DURATION_HOURS}h limit (${hoursSinceDisconnect.toFixed(1)}h disconnected)`);
          return false;
        }
      }

      // For instances that already received first alert
      if (instance.alert_sent_for_current_disconnect === true) {
        // Check if enough time has passed for a reminder
        if (instance.last_alert_sent_at) {
          const hoursSinceAlert = (Date.now() - new Date(instance.last_alert_sent_at).getTime()) / (1000 * 60 * 60);
          if (hoursSinceAlert >= REMINDER_THRESHOLD_HOURS) {
            console.log(`[Check Instance Alerts] ${instance.instance_name}: Eligible for 24h reminder (${hoursSinceAlert.toFixed(1)}h since last alert)`);
            (instance as DisconnectedInstance).isReminder = true;
            return true; // Allow reminder even if awaiting_qr
          }
        }
        console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: alert already sent, waiting for reminder threshold`);
        return false;
      }

      // First alert - skip if awaiting QR (user already knows they need to scan)
      if (instance.awaiting_qr === true) {
        console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: awaiting_qr=true (first alert)`);
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

    // Get admin profiles
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

    // Get profiles with admin role as fallback
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

    // Group instances by company/law_firm
    const instancesByLawFirm = new Map<string, DisconnectedInstance[]>();
    for (const instance of instances) {
      const existing = instancesByLawFirm.get(instance.law_firm_id) || [];
      existing.push(instance);
      instancesByLawFirm.set(instance.law_firm_id, existing);
    }

    const results: { 
      law_firm_id: string; 
      company_name: string; 
      email: string; 
      instances_count: number; 
      success: boolean;
      is_reminder: boolean;
      max_hours_disconnected: number;
      escalated_to_admin: boolean;
    }[] = [];
    const notifiedInstanceIds: string[] = [];

    // Send email to each company's admin
    for (const [lawFirmId, companyInstances] of instancesByLawFirm) {
      const company = (companies || []).find((c: CompanyInfo) => c.law_firm_id === lawFirmId);
      
      // Find admin email
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
        const lawFirmAdmin = (adminRoleProfiles || []).find(
          (p: AdminProfile) => p.law_firm_id === lawFirmId && adminRoleUserIds.has(p.id)
        );
        if (lawFirmAdmin?.email) {
          adminEmail = lawFirmAdmin.email;
          adminName = lawFirmAdmin.full_name || "Administrador";
        }
      }

      if (!adminEmail) {
        adminEmail = globalAdminEmail || null;
      }

      if (!adminEmail) {
        console.log(`[Check Instance Alerts] No admin email found for law_firm ${lawFirmId}`);
        continue;
      }

      const companyName = company?.name || "Sua empresa";

      // Calculate duration for each instance
      const instancesWithDuration = companyInstances.map((instance: DisconnectedInstance) => {
        const disconnectedAt = new Date(instance.disconnected_since || instance.updated_at);
        const durationMs = Date.now() - disconnectedAt.getTime();
        const durationMinutes = Math.floor(durationMs / 60000);
        const durationHours = durationMinutes / 60;
        const wholeDays = Math.floor(durationHours / 24);
        const wholeHours = Math.floor(durationHours % 24);
        const remainingMinutes = durationMinutes % 60;
        
        let durationText: string;
        if (wholeDays > 0) {
          durationText = `${wholeDays}d ${wholeHours}h`;
        } else if (wholeHours > 0) {
          durationText = `${wholeHours}h ${remainingMinutes}min`;
        } else {
          durationText = `${remainingMinutes} minutos`;
        }
        
        return {
          ...instance,
          duration: durationText,
          durationMinutes,
          durationHours,
        };
      });

      // Sort by duration (longest first)
      instancesWithDuration.sort((a, b) => b.durationMinutes - a.durationMinutes);

      // Determine if this is a reminder alert
      const isReminderAlert = companyInstances.some((i: DisconnectedInstance) => i.isReminder === true);
      
      // Calculate max hours disconnected for escalation check
      const maxHoursDisconnected = Math.max(...instancesWithDuration.map(i => i.durationHours));
      const shouldEscalateToAdmin = maxHoursDisconnected >= ADMIN_ESCALATION_HOURS && globalAdminEmail;

      // Get instance names for logging
      const instanceNames = instancesWithDuration.map(i => i.display_name || i.instance_name);

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
      
      // Dynamic alert title and description based on type
      let alertTitle: string;
      let alertDescription: string;
      let emailSubject: string;

      if (isReminderAlert) {
        const daysOffline = Math.floor(maxHoursDisconnected / 24);
        alertTitle = '🔔 Lembrete: WhatsApp ainda desconectado';
        alertDescription = `${instancesWithDuration.length === 1 ? 'sua conexão WhatsApp continua desconectada' : 'suas conexões WhatsApp continuam desconectadas'} há ${daysOffline > 0 ? `${daysOffline} dia(s)` : `${Math.floor(maxHoursDisconnected)}h`}`;
        emailSubject = `🔔 Lembrete: WhatsApp desconectado há ${daysOffline > 0 ? `${daysOffline} dias` : `${Math.floor(maxHoursDisconnected)}h`} - ${companyName}`;
      } else if (hasConnectingIssue) {
        alertTitle = '⚠️ Alerta: WhatsApp com Problema de Conexão';
        alertDescription = `${instancesWithDuration.length === 1 ? 'sua conexão WhatsApp está com problema' : 'algumas de suas conexões WhatsApp estão com problema'}`;
        emailSubject = `⚠️ WhatsApp com problema de conexão - ${companyName}`;
      } else {
        alertTitle = '⚠️ Alerta: WhatsApp Desconectado';
        alertDescription = `${instancesWithDuration.length === 1 ? 'sua conexão WhatsApp está desconectada' : 'algumas de suas conexões WhatsApp estão desconectadas'}`;
        emailSubject = `⚠️ WhatsApp desconectado - ${companyName}`;
      }

      // Determine header color
      const headerColor = isReminderAlert 
        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' // Orange for reminder
        : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'; // Red for alert

      const footerMessage = isReminderAlert
        ? 'Este é um lembrete automático. Você receberá um último alerta após 48h de desconexão, depois os alertas serão pausados.'
        : 'Este alerta é enviado uma única vez por desconexão. Você receberá lembretes por até 48h.';

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Alerta de Conexão WhatsApp</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            
            <div style="background: ${headerColor}; color: white; padding: 24px;">
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
                ${footerMessage}
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        console.log(`[Check Instance Alerts] Sending ${isReminderAlert ? 'reminder' : 'alert'} email to ${adminEmail} for ${companyName}`);
        
        const { error: emailError } = await resend.emails.send({
          from: "MIAUCHAT <onboarding@resend.dev>",
          to: [adminEmail],
          subject: emailSubject,
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
            is_reminder: isReminderAlert,
            max_hours_disconnected: maxHoursDisconnected,
            escalated_to_admin: false,
          });
        } else {
          console.log(`[Check Instance Alerts] Email sent to ${adminEmail}`);
          
          // Track notified instances
          notifiedInstanceIds.push(...instancesWithDuration.map(i => i.id));

          // Check if we need to escalate to global admin
          let escalatedToAdmin = false;
          if (shouldEscalateToAdmin && adminEmail !== globalAdminEmail) {
            console.log(`[Check Instance Alerts] Escalating to global admin: ${globalAdminEmail} (offline for ${maxHoursDisconnected.toFixed(1)}h)`);
            
            const escalationHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>Escalação: Instância Offline Prolongada</title>
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
                <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                  
                  <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); color: white; padding: 24px;">
                    <h1 style="margin: 0; font-size: 22px;">🚨 Escalação: Cliente Offline há ${Math.floor(maxHoursDisconnected)}h</h1>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${companyName}</p>
                  </div>
                  
                  <div style="padding: 24px;">
                    <p style="margin: 0 0 16px 0;">
                      <strong>Atenção:</strong> O cliente <strong>${companyName}</strong> está com instância(s) WhatsApp offline há mais de ${ADMIN_ESCALATION_HOURS} horas.
                    </p>
                    
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
                      <p style="margin: 0; color: #92400e; font-size: 14px;">
                        <strong>Instâncias afetadas:</strong> ${instanceNames.join(', ')}<br>
                        <strong>Tempo offline:</strong> ${Math.floor(maxHoursDisconnected / 24)}d ${Math.floor(maxHoursDisconnected % 24)}h<br>
                        <strong>E-mail do cliente:</strong> ${adminEmail}
                      </p>
                    </div>
                    
                    <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 13px;">
                      Considere entrar em contato com o cliente para verificar se há algum problema.
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `;

            try {
              await resend.emails.send({
                from: "MIAUCHAT <onboarding@resend.dev>",
                to: [globalAdminEmail!],
                subject: `🚨 Escalação: ${companyName} offline há ${Math.floor(maxHoursDisconnected)}h`,
                html: escalationHtml,
              });
              escalatedToAdmin = true;
              console.log(`[Check Instance Alerts] Escalation email sent to ${globalAdminEmail}`);
            } catch (escError) {
              console.error(`[Check Instance Alerts] Escalation email error:`, escError);
            }
          }

          results.push({
            law_firm_id: lawFirmId,
            company_name: companyName,
            email: adminEmail,
            instances_count: instancesWithDuration.length,
            success: true,
            is_reminder: isReminderAlert,
            max_hours_disconnected: maxHoursDisconnected,
            escalated_to_admin: escalatedToAdmin,
          });
        }
      } catch (emailErr: unknown) {
        console.error(`[Check Instance Alerts] Email exception for ${companyName}:`, emailErr);
        results.push({
          law_firm_id: lawFirmId,
          company_name: companyName,
          email: adminEmail,
          instances_count: instancesWithDuration.length,
          success: false,
          is_reminder: isReminderAlert,
          max_hours_disconnected: maxHoursDisconnected,
          escalated_to_admin: false,
        });
      }
    }

    // Mark instances as alerted
    if (notifiedInstanceIds.length > 0) {
      const { error: updateError } = await supabaseClient
        .from("whatsapp_instances")
        .update({ 
          last_alert_sent_at: new Date().toISOString(),
          alert_sent_for_current_disconnect: true
        })
        .in("id", notifiedInstanceIds);

      if (updateError) {
        console.error("[Check Instance Alerts] Error updating alert timestamp:", updateError);
      }
    }

    // Log summary
    const successCount = results.filter(r => r.success).length;
    const reminderCount = results.filter(r => r.success && r.is_reminder).length;
    const escalationCount = results.filter(r => r.escalated_to_admin).length;
    console.log(`[Check Instance Alerts] Summary: ${successCount}/${results.length} emails sent (${reminderCount} reminders, ${escalationCount} escalations)`);

    // Log to admin_notification_logs with enriched metadata
    for (const result of results.filter(r => r.success)) {
      await supabaseClient.from("admin_notification_logs").insert({
        event_type: result.is_reminder ? "INSTANCE_DISCONNECTION_REMINDER" : "INSTANCE_DISCONNECTION_ALERT",
        event_key: `instance_alert_${result.law_firm_id}_${new Date().toISOString().slice(0, 13)}`,
        email_sent_to: result.email,
        tenant_id: result.law_firm_id,
        company_name: result.company_name,
        metadata: {
          instances_count: result.instances_count,
          threshold_minutes: ALERT_THRESHOLD_MINUTES,
          is_reminder: result.is_reminder,
          hours_disconnected: Math.round(result.max_hours_disconnected * 10) / 10,
          escalated_to_admin: result.escalated_to_admin,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Alerts sent to ${successCount} companies (${reminderCount} reminders, ${escalationCount} escalations)`,
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
