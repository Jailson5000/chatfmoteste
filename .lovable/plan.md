
# Corrigir: Mensagem de Teste deve aparecer no Chat

## Problema

A action `send_test_message` envia a mensagem pela Graph API mas **nao cria nenhum registro no banco de dados** (nem conversa, nem mensagem). Por isso a mensagem nao aparece na tela de Conversas.

## Solucao

Alterar a action `send_test_message` no backend para, apos enviar com sucesso pela Graph API, tambem:
1. Buscar ou criar o **cliente** pelo numero de telefone
2. Buscar ou criar a **conversa** (origin: `WHATSAPP_CLOUD`, remote_jid: numero do destinatario)
3. Inserir a **mensagem** enviada no banco (sender_type: `agent`, is_from_me: `true`)
4. Atualizar o `last_message_at` da conversa

Isso espelha exatamente o que o fluxo normal de envio faz (linhas 514-538 do `meta-api`), mas criando a conversa caso nao exista.

## Alteracoes

### Arquivo: `supabase/functions/meta-api/index.ts`

Na action `send_test_message` (linhas 238-324), **apos** o envio bem-sucedido pela Graph API (linha 317), adicionar:

1. **Buscar ou criar cliente**:
   - Buscar em `clients` por `phone = recipientPhone` e `law_firm_id`
   - Se nao existir, criar com `name = recipientPhone`

2. **Buscar ou criar conversa**:
   - Buscar em `conversations` por `remote_jid = recipientPhone`, `origin = 'WHATSAPP_CLOUD'`, `law_firm_id`
   - Se nao existir, criar com:
     - `remote_jid`: numero do destinatario
     - `contact_name`: numero do destinatario
     - `contact_phone`: numero do destinatario
     - `origin`: `WHATSAPP_CLOUD`
     - `origin_metadata`: `{ phone_number_id: conn.page_id, connection_type: "whatsapp_cloud" }`
     - `client_id`: ID do cliente criado/encontrado
     - `status`: `novo_contato`
     - `current_handler`: `human`
   - Se existir, atualizar `last_message_at`

3. **Inserir mensagem**:
   - `conversation_id`: ID da conversa
   - `law_firm_id`: tenant do usuario
   - `content`: texto da mensagem ou "[template: hello_world]" para templates
   - `sender_type`: `agent`
   - `is_from_me`: `true`
   - `message_type`: `text`
   - `external_id`: message_id retornado pela Graph API (`data.messages?.[0]?.id`)

4. **Retornar** o `conversationId` na resposta para que o frontend possa redirecionar

### Arquivo: `src/pages/admin/MetaTestPage.tsx`

Apos envio bem-sucedido:
- Exibir o `conversationId` retornado
- Adicionar um botao/link "Ver conversa" que navega para `/conversations?id={conversationId}` para facilitar a demonstracao no video

## Resultado esperado

1. Enviar mensagem de teste pela MetaTestPage
2. Mensagem aparece imediatamente na tela de Conversas (enviada pelo agente)
3. Destinatario recebe no WhatsApp e responde
4. Resposta chega via `meta-webhook` e aparece na mesma conversa
5. Video mostra o fluxo completo de envio e recebimento
