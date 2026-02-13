
# Corrigir deploy do meta-webhook e fluxo completo de mensagens

## Problema raiz

O **meta-webhook nao esta deployado** (retorna 404). Isso significa:
- A Meta nao consegue verificar o webhook (GET com challenge)
- Nenhuma mensagem recebida chega ao sistema
- O subscribe de "messages" no painel Meta nao adianta se o endpoint nao existe

A causa e o import `esm.sh` na linha 1 do arquivo, que gera timeout no bundle (mesmo bug ja corrigido no `meta-api`).

## Alteracoes

### 1. Corrigir import do meta-webhook

**Arquivo:** `supabase/functions/meta-webhook/index.ts` (linha 1)

Mudar:
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```
Para:
```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
```

### 2. Deployar o meta-webhook

Apos a correcao do import, fazer o deploy da funcao. Isso tornara o endpoint disponivel em:
```
https://jiragtersejnarxruqyd.supabase.co/functions/v1/meta-webhook
```

### 3. Testar o webhook via curl

Fazer uma chamada GET de teste para verificar que o endpoint responde corretamente a verificacao da Meta.

## O que voce precisa fazer no painel Meta (manual)

1. Ir em **WhatsApp > Configuration > Webhook**
2. Colocar a URL: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/meta-webhook`
3. Colocar o **Verify Token** (o mesmo valor configurado no secret `META_WEBHOOK_VERIFY_TOKEN`)
4. Clicar "Verificar e salvar"
5. O campo **messages** ja esta assinado (conforme sua imagem)

## Sobre os tokens no Global Admin

**Nao precisa criar campos extras.** A arquitetura esta correta:
- Tokens globais (`META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`) sao da plataforma - ja estao nos secrets
- Tokens por cliente sao gerados automaticamente pelo OAuth e salvos na tabela `meta_connections` criptografados
- Apos o App Review, o fluxo OAuth funciona para qualquer cliente sem intervencao manual

## Resultado esperado

1. Webhook responde a verificacao da Meta (GET com challenge)
2. Mensagens enviadas pelo WhatsApp chegam ao sistema via webhook (POST)
3. Fluxo completo: enviar pelo sistema -> chega no WhatsApp -> resposta volta ao sistema
