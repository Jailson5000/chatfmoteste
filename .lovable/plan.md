

# Corrigir Instagram - ID Errado na Inscricao de Webhook

## Problema

Os logs mostram dois IDs diferentes retornados pela API do Instagram:

```text
Token exchange -> user_id: 25982752248032036  (app-scoped user ID)
/me endpoint   -> user_id: 17841479677897649  (IGID - Instagram Graph API ID)
```

O codigo usa `tokenData.user_id` (app-scoped ID) para:
1. Inscrever webhooks em `graph.instagram.com/{id}/subscribed_apps`
2. Salvar como `page_id` e `ig_account_id` no banco

Porem, a API do Instagram requer o **IGID** (retornado por `/me`) para operacoes como webhook subscription e envio de mensagens. O app-scoped ID nao e reconhecido como um objeto valido na Graph API, gerando o erro:

```
"Object with ID '25982752248032036' does not exist, cannot be loaded due to missing permissions"
```

## Correcao

### Arquivo: `supabase/functions/meta-oauth-callback/index.ts`

Alterar a logica para usar `me.user_id` (IGID) em vez de `tokenData.user_id` (app-scoped ID) em todos os lugares:

**Linha 125** - Manter `tokenData.user_id` apenas como fallback inicial

**Apos buscar `/me` (linha 143)** - Reatribuir `igUserId` para `me.user_id || me.id`:

```typescript
// ANTES (errado):
const igUserId = String(tokenData.user_id);
// ... usado em tudo depois

// DEPOIS (correto):
const appScopedId = String(tokenData.user_id); // apenas para log
// ... apos /me:
const igUserId = String(me.user_id || me.id || appScopedId);
```

Isso corrige automaticamente:
- Webhook subscription (linha 155): usara o IGID correto
- `page_id` salvo no banco (linha 183): usara o IGID correto
- `ig_account_id` salvo no banco (linha 185): usara o IGID correto

### Impacto

Apos o deploy, o usuario deve **desconectar e reconectar** o Instagram para que a nova conexao seja salva com o IGID correto e a inscricao de webhook funcione.

## Detalhes Tecnicos

A API do Instagram retorna dois tipos de ID:
- **App-scoped ID** (`tokenData.user_id`): Unico por app, usado internamente pelo Instagram para identificar o usuario no contexto do app. NAO pode ser usado em chamadas da Graph API.
- **IGID** (`me.user_id` ou `me.id`): O ID real do usuario no Instagram Graph, usado para todas as operacoes da API (webhook, mensagens, etc).

A correcao e de uma linha: usar o ID correto retornado pelo `/me` em vez do ID retornado pela troca de token.

