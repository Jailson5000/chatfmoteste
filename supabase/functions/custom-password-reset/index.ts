import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Custom Password Reset
 * 
 * Sends password reset emails via Resend from suporte@miauchat.com.br
 * instead of using Supabase's default email provider.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResetRequest {
  email: string;
  redirect_to?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  if (!resendApiKey) {
    console.error('[custom-password-reset] RESEND_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Serviço de email não configurado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { email, redirect_to }: ResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[custom-password-reset] Processing reset for: ${email}`);

    // Determine the correct redirect URL.
    // Prefer the tenant subdomain (keeps the user session on the correct origin),
    // and only accept an explicit redirect_to when it points to a miauchat.com.br URL.
    let productionRedirect = 'https://www.miauchat.com.br/reset-password';

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('law_firm_id')
        .eq('email', email)
        .maybeSingle();

      if (profile?.law_firm_id) {
        const { data: lawFirm } = await supabase
          .from('law_firms')
          .select('subdomain')
          .eq('id', profile.law_firm_id)
          .maybeSingle();

        if (lawFirm?.subdomain) {
          productionRedirect = `https://${lawFirm.subdomain}.miauchat.com.br/reset-password`;
        }
      }
    } catch (err) {
      console.warn('[custom-password-reset] Failed to resolve tenant redirect:', err);
    }

    if (redirect_to) {
      try {
        const u = new URL(redirect_to);
        const isMiauDomain =
          u.hostname === 'miauchat.com.br' ||
          u.hostname === 'www.miauchat.com.br' ||
          u.hostname.endsWith('.miauchat.com.br');

        if (isMiauDomain && u.pathname.startsWith('/reset-password')) {
          productionRedirect = redirect_to;
        }
      } catch {
        // Ignore invalid URLs
      }
    }
    
    // Generate password reset link using Supabase Admin API
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: productionRedirect,
      },
    });

    if (error) {
      console.error('[custom-password-reset] Generate link error:', error.message);
      // Don't reveal if user exists or not
      return new Response(
        JSON.stringify({ success: true, message: 'Se o email existir, você receberá um link de recuperação.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!data?.properties?.action_link && !(data as any)?.properties?.hashed_token) {
      console.log('[custom-password-reset] No token generated (user may not exist)');
      return new Response(
        JSON.stringify({ success: true, message: 'Se o email existir, você receberá um link de recuperação.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // IMPORTANT: we prefer a first-party reset link pointing directly to the app.
    // This avoids issues where email clients/security scanners prefetch the /verify link,
    // consuming the one-time token before the user opens it.
    const hashedToken = (data as any)?.properties?.hashed_token as string | undefined;

    let resetLink = data?.properties?.action_link;

    if (hashedToken) {
      const u = new URL(productionRedirect);
      u.searchParams.set('token_hash', hashedToken);
      u.searchParams.set('type', 'recovery');
      resetLink = u.toString();
    }

    if (!resetLink) {
      console.log('[custom-password-reset] No reset link generated');
      return new Response(
        JSON.stringify({ success: true, message: 'Se o email existir, você receberá um link de recuperação.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userName = data.user?.user_metadata?.full_name || email.split('@')[0];

    // Send email via Resend
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recuperação de Senha — MiauChat</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🔐 Recuperação de Senha</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
        Olá, <strong>${userName}</strong>!
      </p>
      
      <p style="color: #1f2937; font-size: 16px; margin-bottom: 24px;">
        Recebemos uma solicitação para redefinir a senha da sua conta no MiauChat.
        Clique no botão abaixo para criar uma nova senha:
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Redefinir Senha
        </a>
      </div>
      
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #92400e; margin: 0; font-size: 14px;">
          ⚠️ Este link é válido por 1 hora. Após esse período, será necessário solicitar um novo.
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        Se você não solicitou esta recuperação de senha, pode ignorar este email com segurança.
        Sua senha permanecerá inalterada.
      </p>
      
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0;">
          Caso o botão não funcione, copie e cole o link abaixo no navegador:
        </p>
        <p style="color: #1f2937; font-size: 12px; margin: 0; word-break: break-all;">
          ${resetLink}
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

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MiauChat <suporte@miauchat.com.br>',
        to: [email],
        subject: '🔐 Recuperação de Senha — MiauChat',
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('[custom-password-reset] Resend error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Falha ao enviar email. Tente novamente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResult = await emailResponse.json();
    console.log('[custom-password-reset] Email sent successfully:', emailResult.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Email de recuperação enviado com sucesso!' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[custom-password-reset] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
