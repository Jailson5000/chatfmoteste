import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface TaskAssignee {
  user_id: string;
  profile: Profile;
}

interface TaskCategory {
  name: string;
}

interface Task {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  category: TaskCategory | null;
  assignees: TaskAssignee[];
}

interface LawFirmSettings {
  law_firm_id: string;
  task_alert_hours_before: number;
  task_alert_channels: string[];
  task_alert_business_hours_only: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[process-task-due-alerts] Starting...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check current hour (BRT = UTC-3)
    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    console.log(`[process-task-due-alerts] Current BRT hour: ${brtHour}`);

    // Get all law firms with task alerts enabled
    const { data: lawFirmSettings, error: settingsError } = await supabase
      .from("law_firm_settings")
      .select("law_firm_id, task_alert_hours_before, task_alert_channels, task_alert_business_hours_only")
      .eq("task_alert_enabled", true);

    if (settingsError) {
      console.error("Error fetching settings:", settingsError);
      throw settingsError;
    }

    console.log(`[process-task-due-alerts] Found ${lawFirmSettings?.length || 0} law firms with alerts enabled`);

    let totalAlertsSent = 0;

    for (const settings of (lawFirmSettings || []) as LawFirmSettings[]) {
      // Check business hours if required
      if (settings.task_alert_business_hours_only) {
        if (brtHour < 8 || brtHour >= 18) {
          console.log(`[process-task-due-alerts] Skipping law firm ${settings.law_firm_id} - outside business hours`);
          continue;
        }
      }

      const hoursBefore = settings.task_alert_hours_before || 24;
      const channels = settings.task_alert_channels || ["email"];

      // Calculate the time window for due tasks
      const windowStart = new Date(now.getTime());
      const windowEnd = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);

      // Get tasks due within the window that have send_due_alert enabled
      const { data: tasksData, error: tasksError } = await supabase
        .from("internal_tasks")
        .select(`
          id,
          title,
          due_date,
          priority,
          category:task_categories(name),
          assignees:task_assignees(
            user_id,
            profile:profiles(id, full_name, email, phone)
          )
        `)
        .eq("law_firm_id", settings.law_firm_id)
        .eq("send_due_alert", true)
        .neq("status", "done")
        .not("due_date", "is", null)
        .gte("due_date", windowStart.toISOString().split("T")[0])
        .lte("due_date", windowEnd.toISOString().split("T")[0]);

      if (tasksError) {
        console.error(`Error fetching tasks for ${settings.law_firm_id}:`, tasksError);
        continue;
      }

      console.log(`[process-task-due-alerts] Found ${tasksData?.length || 0} tasks due soon for law firm ${settings.law_firm_id}`);

      for (const taskRaw of tasksData || []) {
        // Type assertion for the task
        const task = taskRaw as unknown as Task;
        
        for (const assignee of task.assignees || []) {
          const profile = assignee.profile;
          if (!profile) continue;

          for (const channel of channels) {
            // Check if alert already sent
            const { data: existingLog } = await supabase
              .from("task_alert_logs")
              .select("id")
              .eq("task_id", task.id)
              .eq("user_id", profile.id)
              .eq("channel", channel)
              .maybeSingle();

            if (existingLog) {
              console.log(`[process-task-due-alerts] Alert already sent for task ${task.id}, user ${profile.id}, channel ${channel}`);
              continue;
            }

            let sent = false;

            if (channel === "email" && profile.email && resendKey) {
              try {
                const resend = new Resend(resendKey);
                const dueDate = new Date(task.due_date);
                const formattedDate = dueDate.toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });

                const priorityLabels: Record<string, string> = {
                  low: "Baixa",
                  medium: "Média",
                  high: "Alta",
                  urgent: "Urgente",
                };

                await resend.emails.send({
                  from: "MiauChat <noreply@chatfmo.lovable.app>",
                  to: [profile.email],
                  subject: `⏰ Tarefa vence em breve: ${task.title}`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: #333;">⏰ Alerta de Tarefa</h2>
                      <p>Olá ${profile.full_name},</p>
                      <p>A tarefa <strong>"${task.title}"</strong> está programada para vencer em breve:</p>
                      <ul style="list-style: none; padding: 0;">
                        <li>📅 <strong>Vencimento:</strong> ${formattedDate}</li>
                        ${task.category ? `<li>📂 <strong>Categoria:</strong> ${task.category.name}</li>` : ""}
                        <li>🔴 <strong>Prioridade:</strong> ${priorityLabels[task.priority] || task.priority}</li>
                      </ul>
                      <p>Acesse o sistema para mais detalhes.</p>
                      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                      <p style="color: #666; font-size: 12px;">Este é um email automático do MiauChat.</p>
                    </div>
                  `,
                });

                sent = true;
                console.log(`[process-task-due-alerts] Email sent to ${profile.email} for task ${task.id}`);
              } catch (emailError) {
                console.error(`Error sending email:`, emailError);
              }
            }

            if (channel === "whatsapp" && profile.phone) {
              // Get default WhatsApp instance for this law firm
              const { data: instance } = await supabase
                .from("whatsapp_instances")
                .select("id, instance_name, api_key")
                .eq("law_firm_id", settings.law_firm_id)
                .eq("status", "connected")
                .limit(1)
                .maybeSingle();

              if (instance) {
                const { data: evolutionConnection } = await supabase
                  .from("evolution_api_connections")
                  .select("base_url, global_api_key")
                  .eq("is_default", true)
                  .maybeSingle();

                if (evolutionConnection) {
                  try {
                    const dueDate = new Date(task.due_date);
                    const formattedDate = dueDate.toLocaleDateString("pt-BR");

                    const message = `⏰ *Alerta de Tarefa*\n\nOlá ${profile.full_name}!\n\nA tarefa *"${task.title}"* vence em breve!\n📅 Vencimento: ${formattedDate}\n\nAcesse o sistema para ver mais detalhes.`;

                    // Format phone number
                    let phone = profile.phone.replace(/\D/g, "");
                    if (!phone.startsWith("55")) {
                      phone = "55" + phone;
                    }

                    const response = await fetch(
                      `${evolutionConnection.base_url}/message/sendText/${instance.instance_name}`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          apikey: instance.api_key || evolutionConnection.global_api_key,
                        },
                        body: JSON.stringify({
                          number: phone,
                          text: message,
                        }),
                      }
                    );

                    if (response.ok) {
                      sent = true;
                      console.log(`[process-task-due-alerts] WhatsApp sent to ${phone} for task ${task.id}`);
                    } else {
                      console.error(`WhatsApp send failed:`, await response.text());
                    }
                  } catch (whatsappError) {
                    console.error(`Error sending WhatsApp:`, whatsappError);
                  }
                }
              }
            }

            if (sent) {
              // Log the sent alert
              await supabase.from("task_alert_logs").insert({
                task_id: task.id,
                user_id: profile.id,
                channel,
                law_firm_id: settings.law_firm_id,
              });
              totalAlertsSent++;
            }
          }
        }
      }
    }

    console.log(`[process-task-due-alerts] Complete. Total alerts sent: ${totalAlertsSent}`);

    return new Response(
      JSON.stringify({
        success: true,
        alerts_sent: totalAlertsSent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[process-task-due-alerts] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
