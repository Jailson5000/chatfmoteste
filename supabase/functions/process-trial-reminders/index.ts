import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyTrialData {
  company_id: string;
  company_name: string;
  trial_ends_at: string;
  admin_email: string;
  admin_name: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[process-trial-reminders] Starting trial reminder processing...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('[process-trial-reminders] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Calculate the date range for trials expiring in ~2 days
    // We look for trials ending between 1.5 and 2.5 days from now
    const now = new Date();
    const minDate = new Date(now.getTime() + (1.5 * 24 * 60 * 60 * 1000)); // 1.5 days from now
    const maxDate = new Date(now.getTime() + (2.5 * 24 * 60 * 60 * 1000)); // 2.5 days from now

    console.log(`[process-trial-reminders] Looking for trials ending between ${minDate.toISOString()} and ${maxDate.toISOString()}`);

    // Find companies with trials expiring in ~2 days
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select(`
        id,
        name,
        trial_ends_at,
        trial_type,
        law_firm_id
      `)
      .not('trial_type', 'is', null)
      .neq('trial_type', 'none')
      .gte('trial_ends_at', minDate.toISOString())
      .lte('trial_ends_at', maxDate.toISOString());

    if (companiesError) {
      console.error('[process-trial-reminders] Error fetching companies:', companiesError);
      throw companiesError;
    }

    console.log(`[process-trial-reminders] Found ${companies?.length || 0} companies with expiring trials`);

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No companies with trials expiring in 2 days',
          processed: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const company of companies) {
      try {
        // Check if reminder was already sent for this company and trial period
        const eventKey = `trial_reminder_2d_${company.id}_${company.trial_ends_at}`;
        
        const { data: existingLog } = await supabase
          .from('admin_notification_logs')
          .select('id')
          .eq('event_key', eventKey)
          .eq('event_type', 'TRIAL_REMINDER_2_DAYS')
          .single();

        if (existingLog) {
          console.log(`[process-trial-reminders] Reminder already sent for company ${company.id}, skipping`);
          skippedCount++;
          continue;
        }

        // Get the admin user (first user of the law_firm with admin role)
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .eq('law_firm_id', company.law_firm_id)
          .limit(1)
          .single();

        if (!adminProfile || !adminProfile.email) {
          console.log(`[process-trial-reminders] No admin email found for company ${company.id}`);
          continue;
        }

        // Format expiration date in Brazilian format
        const expirationDate = new Date(company.trial_ends_at);
        const formattedDate = expirationDate.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });

        // Send reminder email
        console.log(`[process-trial-reminders] Sending reminder to ${adminProfile.email} for company ${company.name}`);

        const emailResult = await resend.emails.send({
          from: 'MiauChat <noreply@miauchat.com.br>',
          to: [adminProfile.email],
          subject: `⏰ Seu período de trial expira em 2 dias - ${company.name}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px 20px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px;">⏰ Trial Expirando em Breve</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 30px 20px;">
                  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Olá <strong>${adminProfile.full_name || 'Administrador'}</strong>,
                  </p>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    O período de teste da sua empresa <strong>${company.name}</strong> no MiauChat está chegando ao fim.
                  </p>
                  
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                    <p style="color: #92400e; margin: 0; font-weight: 600;">
                      📅 Data de expiração: ${formattedDate}
                    </p>
                  </div>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    <strong>Após essa data, o acesso ao sistema será bloqueado automaticamente.</strong>
                  </p>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Para continuar usando todas as funcionalidades do MiauChat sem interrupção, clique no botão abaixo para escolher seu plano:
                  </p>
                  
                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://miauchat.com.br/settings?tab=meu-plano" 
                       style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);">
                      ✨ Assinar Agora
                    </a>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    Precisa de ajuda ou tem dúvidas sobre os planos? Entre em contato com nosso suporte:
                    <a href="mailto:suporte@miauchat.com.br" style="color: #3b82f6;">suporte@miauchat.com.br</a>
                  </p>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    Este email foi enviado automaticamente pelo MiauChat.<br>
                    © ${new Date().getFullYear()} MiauChat. Todos os direitos reservados.
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        console.log(`[process-trial-reminders] Email sent successfully:`, emailResult);

        // Log the notification to prevent duplicates
        await supabase.from('admin_notification_logs').insert({
          event_type: 'TRIAL_REMINDER_2_DAYS',
          event_key: eventKey,
          tenant_id: company.id,
          company_name: company.name,
          email_sent_to: adminProfile.email,
          metadata: {
            trial_ends_at: company.trial_ends_at,
            admin_name: adminProfile.full_name,
            email_id: emailResult.data?.id
          }
        });

        sentCount++;
        console.log(`[process-trial-reminders] Successfully processed company ${company.name}`);

      } catch (companyError: unknown) {
        const errorMessage = companyError instanceof Error ? companyError.message : 'Unknown error';
        console.error(`[process-trial-reminders] Error processing company ${company.id}:`, companyError);
        errors.push(`Company ${company.id}: ${errorMessage}`);
      }
    }

    console.log(`[process-trial-reminders] Completed. Sent: ${sentCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Trial reminders processed`,
        sent: sentCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : undefined
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-trial-reminders] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
