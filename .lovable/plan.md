

# Corrigir envio e recebimento de mensagens WhatsApp Cloud

## Diagnostico

Analisando os logs do backend, a Meta **aceitou** a mensagem (HTTP 200, `message_status: "accepted"`). Porem, a mensagem nao chegou no WhatsApp fisico. Ha dois problemas identificados:

### Problema 1: Versao da API desatualizada
- O curl de referencia do painel da Meta usa `v22.0`
- Nosso codigo usa `v21.0`
- Isso pode causar incompatibilidade com o numero de teste da Meta

### Problema 2: Conversa sem vinculo com a meta_connection
- A conversa foi criada com `whatsapp_instance_id = NULL`
- Ela nao tem vinculo com nenhuma conexao, por isso aparece o banner vermelho "WhatsApp sem conexao"
- Quando voce tenta responder pela interface, o sistema nao sabe qual conexao usar para enviar

### Problema 3: Webhook nao esta recebendo nada
- Nenhum log no `meta-webhook` - as respostas do destinatario nao estao chegando
- Pode ser que o webhook nao esteja configurado no painel da Meta, ou o verify_token esteja errado

## Alteracoes

### 1. Atualizar versao da API para v22.0

**Arquivo:** `supabase/functions/meta-api/index.ts`
- Mudar `GRAPH_API_VERSION` de `"v21.0"` para `"v22.0"`

**Arquivo:** `src/lib/meta-config.ts`
- Mudar `META_GRAPH_API_VERSION` de `"v21.0"` para `"v22.0"`

### 2. Vincular conversa a meta_connection para permitir envio/recebimento

**Arquivo:** `supabase/functions/meta-api/index.ts`

Na action `send_test_message`, ao criar/encontrar a conversa:
- Salvar `origin_metadata.connection_id` na conversa (ja faz isso)
- Garantir que o fluxo de envio normal (action padrao de send message) consiga usar a `connection_id` da `origin_metadata` para buscar o token e enviar

### 3. Corrigir o fluxo de envio normal para conversas WHATSAPP_CLOUD

**Arquivo:** `supabase/functions/meta-api/index.ts`

O fluxo principal de envio de mensagem (que a tela de Conversas usa) precisa:
- Verificar se a conversa tem `origin = 'WHATSAPP_CLOUD'`
- Buscar a `connection_id` do `origin_metadata`
- Usar essa conexao para enviar via Graph API
- Isso permitira responder mensagens diretamente pela interface

### 4. Verificar e logar o webhook

**Arquivo:** `supabase/functions/meta-webhook/index.ts`
- Adicionar logs mais detalhados para debug
- Garantir que o webhook aceita GET (verificacao) e POST (mensagens)
- Verificar se o `verify_token` esta correto

## Resultado esperado

1. Mensagem enviada pelo teste chega no WhatsApp fisico
2. Resposta do destinatario chega via webhook e aparece na conversa
3. E possivel responder pela interface de Conversas sem o banner vermelho
4. Fluxo completo de envio e recebimento funciona para o video do App Review

