import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Send Auth Email Hook
 * 
 * This function intercepts all Supabase Auth emails and sends them via Resend
 * from suporte@miauchat.com.br to maintain consistent branding.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuthEmailPayload {
  user: {
    email: string;
    user_metadata?: {
      full_name?: string;
      company_name?: string;
    };
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change' | 'email_change_new';
    site_url?: string;
    confirmation_url?: string;
  };
}

function getEmailContent(payload: AuthEmailPayload, supabaseUrl: string) {
  const { user, email_data } = payload;
  const userName = user.user_metadata?.full_name || user.email.split('@')[0];
  const { email_action_type, token_hash, redirect_to } = email_data;
  
  // Build the action URL
  let actionUrl = '';
  if (token_hash) {
    const baseRedirect = redirect_to || `${supabaseUrl.replace('supabase.co', 'miauchat.com.br')}/auth/callback`;
    actionUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(baseRedirect)}`;
  }

  const templates: Record<string, { subject: string; heading: string; message: string; buttonText: string }> = {
    recovery: {
      subject: '🔐 Recuperação de Senha — MiauChat',
      heading: 'Recuperação de Senha',
      message: `Olá, ${userName}!<br><br>Recebemos uma solicitação para redefinir a senha da sua conta no MiauChat.<br><br>Clique no botão abaixo para criar uma nova senha:`,
      buttonText: 'Redefinir Senha',
    },
    signup: {
      subject: '✅ Confirme seu email — MiauChat',
      heading: 'Confirme seu Email',
      message: `Olá, ${userName}!<br><br>Obrigado por se cadastrar no MiauChat. Para ativar sua conta, confirme seu email clicando no botão abaixo:`,
      buttonText: 'Confirmar Email',
    },
    invite: {
      subject: '📧 Você foi convidado — MiauChat',
      heading: 'Convite para MiauChat',
      message: `Olá!<br><br>Você foi convidado para participar do MiauChat. Clique no botão abaixo para aceitar o convite e configurar sua senha:`,
      buttonText: 'Aceitar Convite',
    },
    magiclink: {
      subject: '🔗 Link de Acesso — MiauChat',
      heading: 'Acesso Rápido',
      message: `Olá, ${userName}!<br><br>Clique no botão abaixo para acessar sua conta no MiauChat:`,
      buttonText: 'Acessar Conta',
    },
    email_change: {
      subject: '📧 Alteração de Email — MiauChat',
      heading: 'Confirme a Alteração',
      message: `Olá, ${userName}!<br><br>Recebemos uma solicitação para alterar o email da sua conta. Confirme clicando no botão abaixo:`,
      buttonText: 'Confirmar Alteração',
    },
    email_change_new: {
      subject: '📧 Confirme seu Novo Email — MiauChat',
      heading: 'Confirme seu Novo Email',
      message: `Olá, ${userName}!<br><br>Este é seu novo email no MiauChat. Confirme clicando no botão abaixo:`,
      buttonText: 'Confirmar Novo Email',
    },
  };

  const template = templates[email_action_type] || templates.recovery;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${template.subject}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${template.heading}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 24px;">
        ${template.message}
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${actionUrl}" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          ${template.buttonText}
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        Se você não solicitou esta ação, pode ignorar este email com segurança.
      </p>
      
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0;">
          Caso o botão não funcione, copie e cole o link abaixo no navegador:
        </p>
        <p style="color: #1f2937; font-size: 12px; margin: 0; word-break: break-all;">
          ${actionUrl}
        </p>
      </div>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">
        — MIAUCHAT
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Multiplataforma de Inteligência Artificial Unificada
      </p>
    </div>
  </div>
</body>
</html>
  `;

  return { subject: template.subject, html };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

  if (!resendApiKey) {
    console.error('[send-auth-email] RESEND_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Email service not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload: AuthEmailPayload = await req.json();
    const { user, email_data } = payload;

    console.log(`[send-auth-email] Sending ${email_data.email_action_type} email to ${user.email}`);

    const { subject, html } = getEmailContent(payload, supabaseUrl);

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MiauChat <suporte@miauchat.com.br>',
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('[send-auth-email] Resend error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await emailResponse.json();
    console.log('[send-auth-email] Email sent successfully:', result.id);

    return new Response(
      JSON.stringify({ success: true, message_id: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-auth-email] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
