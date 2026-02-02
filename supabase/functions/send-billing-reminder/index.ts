import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[BILLING-REMINDER] ${step}`, details ? JSON.stringify(details) : "");
};

interface BillingReminderRequest {
  invoice_id?: string;
  company_id?: string;
  custom_message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Initialize clients
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const resend = new Resend(resendKey);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Invalid token");

    // Check if user is global admin
    const { data: adminRole } = await supabaseAdmin
      .from("admin_user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (!adminRole) throw new Error("Only global admins can send billing reminders");
    logStep("Admin verified", { userId: userData.user.id, role: adminRole.role });

    // Parse request body
    const body: BillingReminderRequest = await req.json();
    const { invoice_id, company_id, custom_message } = body;

    if (!invoice_id && !company_id) {
      throw new Error("Either invoice_id or company_id is required");
    }

    let invoice: Stripe.Invoice | null = null;
    let customerEmail = "";
    let companyName = "";
    let planName = "";
    let invoiceAmount = 0;
    let dueDate = "";
    let daysOverdue = 0;
    let paymentUrl = "";

    // Fetch invoice data from Stripe
    if (invoice_id) {
      logStep("Fetching invoice from Stripe", { invoice_id });
      invoice = await stripe.invoices.retrieve(invoice_id);
      
      if (!invoice) throw new Error("Invoice not found");
      
      customerEmail = invoice.customer_email || "";
      invoiceAmount = (invoice.amount_due || 0) / 100;
      dueDate = invoice.due_date 
        ? new Date(invoice.due_date * 1000).toLocaleDateString("pt-BR")
        : new Date(invoice.created * 1000).toLocaleDateString("pt-BR");
      paymentUrl = invoice.hosted_invoice_url || "";
      
      // Calculate days overdue
      if (invoice.due_date) {
        const dueDateObj = new Date(invoice.due_date * 1000);
        const today = new Date();
        daysOverdue = Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Get customer details
      if (invoice.customer && typeof invoice.customer === "string") {
        const customer = await stripe.customers.retrieve(invoice.customer);
        if (!customer.deleted) {
          companyName = customer.name || customer.email || "Cliente";
          customerEmail = customerEmail || customer.email || "";
        }
      }

      // Get plan name from subscription
      if (invoice.subscription && typeof invoice.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        if (subscription.items.data.length > 0) {
          const priceId = subscription.items.data[0].price.id;
          const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
          if (price.product && typeof price.product !== "string") {
            planName = price.product.name || "Plano";
          }
        }
      }

      logStep("Invoice data fetched", { 
        customerEmail, 
        companyName, 
        planName, 
        invoiceAmount, 
        daysOverdue 
      });
    }

    // Fallback: fetch from company_id if no invoice
    if (!customerEmail && company_id) {
      logStep("Fetching company data from Supabase", { company_id });
      
      const { data: company, error: companyError } = await supabaseAdmin
        .from("companies")
        .select(`
          id,
          name,
          email,
          plan:plans!companies_plan_id_fkey(name, price)
        `)
        .eq("id", company_id)
        .single();

      if (companyError || !company) throw new Error("Company not found");

      companyName = company.name || "Cliente";
      customerEmail = company.email || "";
      
      // Handle plan as array (Supabase returns array for joins)
      const planData = Array.isArray(company.plan) ? company.plan[0] : company.plan;
      planName = planData?.name || "Plano";
      invoiceAmount = planData?.price || 0;
    }

    if (!customerEmail) {
      throw new Error("No email found for this customer/company");
    }

    // Format currency
    const formattedAmount = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(invoiceAmount);

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aviso de Pagamento Pendente</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                💳 Aviso de Pagamento Pendente
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Olá, <strong>${companyName}</strong>!
              </p>
              
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Identificamos uma pendência financeira em sua conta:
              </p>
              
              <!-- Payment Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Valor:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #dc2626; font-size: 18px; font-weight: 700; text-align: right;">
                          ${formattedAmount}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Plano:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">
                          ${planName}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Vencimento:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">
                          ${dueDate}
                        </td>
                      </tr>
                      ${daysOverdue > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Dias em atraso:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #dc2626; font-size: 14px; font-weight: 600; text-align: right;">
                          ${daysOverdue} dias
                        </td>
                      </tr>
                      ` : ""}
                    </table>
                  </td>
                </tr>
              </table>
              
              ${custom_message ? `
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 14px; line-height: 1.6; background-color: #f3f4f6; padding: 16px; border-radius: 8px; font-style: italic;">
                "${custom_message}"
              </p>
              ` : ""}
              
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Para continuar utilizando o sistema normalmente, regularize seu pagamento clicando no botão abaixo:
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      💳 Regularizar Pagamento Agora
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Caso já tenha efetuado o pagamento, por favor desconsidere este aviso.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
              
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Dúvidas? Entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Este é um email automático. Por favor, não responda diretamente.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email via Resend
    logStep("Sending email via Resend", { to: customerEmail });
    
    const emailResponse = await resend.emails.send({
      from: "Cobrança <noreply@miauchat.com.br>",
      to: [customerEmail],
      subject: `📋 Aviso de Pagamento Pendente — ${formattedAmount}`,
      html: emailHtml,
    });

    if (emailResponse.error) {
      throw new Error(`Resend error: ${emailResponse.error.message}`);
    }

    logStep("Email sent successfully", { emailId: emailResponse.data?.id });

    // Log the reminder in admin_notification_logs
    await supabaseAdmin.from("admin_notification_logs").insert({
      event_type: "billing_reminder",
      event_key: `reminder_${invoice_id || company_id}_${Date.now()}`,
      email_sent_to: customerEmail,
      company_name: companyName,
      metadata: {
        invoice_id,
        company_id,
        amount: invoiceAmount,
        days_overdue: daysOverdue,
        sent_by: userData.user.id,
        payment_url: paymentUrl,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        email_sent_to: customerEmail,
        payment_url: paymentUrl,
        invoice_amount: invoiceAmount,
        company_name: companyName,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
