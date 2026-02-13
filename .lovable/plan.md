
# Resolver envio e recebimento de mensagens WhatsApp Cloud

## Problema 1: Mensagens enviadas nao chegam no WhatsApp

A Meta retorna `"message_status": "accepted"` mas **nao entrega** a mensagem. O log mostra:
- Input: `5563984622450` -> Meta resolveu para `wa_id: 556384622450` (removeu o 9)
- Isso indica que o numero esta correto, mas o app em **modo de desenvolvimento** so entrega para numeros cadastrados como "destinatarios de teste"

**Solucao**: Voce precisa adicionar o numero destinatario na lista de teste:
1. Meta Developers > WhatsApp > API Setup > "To" field
2. Adicionar o numero `+55 63 98462-2450` como destinatario de teste
3. O destinatario vai receber um codigo de verificacao no WhatsApp e precisa confirmar

## Problema 2: Webhook nao recebe respostas (verify token errado)

O log mostra `tokenMatch: false` - o token configurado no painel Meta nao bate com o secret `META_WEBHOOK_VERIFY_TOKEN`.

**Solucao em 2 passos:**

### Passo 1: Atualizar o secret para um valor conhecido
Vou atualizar o secret `META_WEBHOOK_VERIFY_TOKEN` para o valor: `miauchat_webhook_2026`

Voce pode escolher outro valor se preferir - o importante e que seja o MESMO no secret e no painel Meta.

### Passo 2: Configurar no painel Meta
1. Meta Developers > WhatsApp > Configuration > Webhook
2. Callback URL: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/meta-webhook`
3. Verify Token: `miauchat_webhook_2026` (exatamente este valor)
4. Clicar "Verificar e salvar"

## Alteracao tecnica

### Atualizar secret
- Atualizar `META_WEBHOOK_VERIFY_TOKEN` com o novo valor

### Adicionar logs de debug no webhook
**Arquivo:** `supabase/functions/meta-webhook/index.ts`
- No GET de verificacao: logar os primeiros 4 caracteres do token recebido e do esperado para facilitar debug
- No POST de mensagens: logar o payload completo para confirmar que mensagens estao chegando

### Deploy
- Deployar `meta-webhook` com os logs adicionais

## Checklist completo para funcionar

1. Atualizar o secret (eu faco)
2. Adicionar numero de teste no painel Meta - API Setup (voce faz)
3. Configurar webhook URL e verify token no painel Meta - Configuration (voce faz)
4. Enviar mensagem de teste pelo sistema
5. Responder pelo WhatsApp fisico e verificar se aparece no sistema

## Resultado esperado

1. Mensagem enviada pelo sistema chega no WhatsApp do destinatario
2. Resposta do destinatario chega no sistema via webhook
3. Conversa bidirecional funciona
