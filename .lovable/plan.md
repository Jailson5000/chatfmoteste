

# Plano: Ativar Webhooks Instagram, Facebook e WhatsApp Cloud API

## Resumo

Precisamos configurar 3 secrets no projeto e depois registrar o webhook no painel do Meta Developers. Nao ha mudancas de codigo necessarias -- a Edge Function `meta-webhook` ja esta pronta e publicada.

---

## Etapa 1 -- Salvar os 3 Secrets no Projeto

| Secret | Onde obter | Descricao |
|--------|-----------|-----------|
| `META_APP_ID` | Meta Developers > Settings > Basic > App ID | Identificador numerico do seu App |
| `META_APP_SECRET` | Meta Developers > Settings > Basic > App Secret (clicar "Show") | Chave secreta do App |
| `META_WEBHOOK_VERIFY_TOKEN` | Voce escolhe uma string segura (ex: `miauchat_meta_2026`) | Token de verificacao do handshake webhook |

---

## Etapa 2 -- Configurar Webhook no Meta Developers

### 2.1 Instagram (Objeto: Instagram)

1. Abrir **Meta Developers** > seu App > **Products** > **Webhooks**
2. Selecionar objeto **Instagram**
3. Clicar **Subscribe to this object**
4. Preencher:
   - **Callback URL:** `https://jiragtersejnarxruqyd.supabase.co/functions/v1/meta-webhook`
   - **Verify Token:** o mesmo valor salvo em `META_WEBHOOK_VERIFY_TOKEN`
5. Clicar **Verify and Save**
6. Subscribir nos campos: `messages`, `messaging_postbacks`

### 2.2 Facebook Messenger (Objeto: Page)

1. No mesmo painel de Webhooks, selecionar objeto **Page**
2. Clicar **Subscribe to this object**
3. Preencher a mesma Callback URL e Verify Token
4. Subscribir nos campos: `messages`, `message_deliveries`, `message_reads`, `messaging_postbacks`
5. Em **Pages** do App, vincular a Page do Facebook e assinar os webhooks

### 2.3 WhatsApp Cloud API (Objeto: WhatsApp Business Account)

1. Selecionar objeto **WhatsApp Business Account**
2. Clicar **Subscribe to this object**
3. Preencher a mesma Callback URL e Verify Token
4. Subscribir no campo: `messages`

### 2.4 Site URL (evitar erro 418)

- Em **Settings > Basic > Site URL**, colocar `https://chatfmoteste.lovable.app` (URL publica do Lovable)
- Isso resolve o erro de "URL quebrada" que o Meta mostrava antes

---

## Etapa 3 -- Permissoes do App

No painel do Meta, garantir que estas permissoes estejam ativadas:

- `instagram_basic`
- `instagram_manage_messages`
- `pages_messaging`
- `pages_manage_metadata`
- `whatsapp_business_management` (para WhatsApp Cloud)
- `whatsapp_business_messaging` (para WhatsApp Cloud)

---

## Etapa 4 -- Teste de Verificacao

Apos salvar os secrets e configurar no Meta:

1. O Meta fara um GET para a Callback URL com `hub.mode=subscribe`, `hub.verify_token` e `hub.challenge`
2. A Edge Function `meta-webhook` compara o token e retorna o challenge
3. Se tudo estiver correto, o Meta mostrara "Verified" em verde

Tambem podemos testar manualmente chamando:
```text
GET https://jiragtersejnarxruqyd.supabase.co/functions/v1/meta-webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=test123
```
Resposta esperada: `test123` com status 200

---

## Secao Tecnica

### O que ja esta pronto (nao precisa de mudancas de codigo)

- Edge Function `meta-webhook` com GET (verificacao) e POST (recebimento de mensagens)
- Edge Function `meta-api` para envio de mensagens
- Edge Function `meta-oauth-callback` para fluxo OAuth
- `config.toml` com `verify_jwt = false` para meta-webhook
- Tabela `meta_connections` com RLS

### O que sera feito neste plano

1. Salvar `META_WEBHOOK_VERIFY_TOKEN` com valor escolhido pelo usuario
2. Salvar `META_APP_ID` com valor fornecido pelo usuario
3. Salvar `META_APP_SECRET` com valor fornecido pelo usuario

### Pendente para proxima iteracao (nao faz parte deste plano)

- Roteamento de envio em `Conversations.tsx` e `KanbanChatPanel.tsx` para os novos origins
- Adicionar novos origins ao `VALID_SOURCES` em `ai-chat/index.ts`
- Pagina `/auth/meta-callback` no React Router

