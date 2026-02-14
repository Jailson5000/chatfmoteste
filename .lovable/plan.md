

# Corrigir Conexao Instagram - Dados Incorretos e Webhook

## Problema

A conexao Instagram salva no banco esta com dados incorretos:
- `page_name`: "977414192123496 (@)" em vez de "MiauChat - Solucoes Digitais (@miau.chat)"
- `ig_account_id`: NULL em vez de "17841479677897649"

Isso acontece porque o passo "save" do `meta-oauth-callback` re-busca informacoes da pagina via Graph API usando o token descriptografado, mas essa segunda chamada falha silenciosamente. O resultado: `pageInfo.name` vem undefined, e o sistema usa o `pageId` numerico como nome.

O webhook do Instagram nao encontra a conexao porque busca por `ig_account_id` (que esta NULL) e depois por `page_id` (que tem o valor `977414192123496`, diferente do IG Account ID `17841479677897649` enviado pelo webhook).

## Causa raiz

O frontend (`InstagramPagePickerDialog`) ja tem todos os dados corretos vindos do passo `list_pages`:
- `igAccountId`: "17841479677897649"
- `igName`: "MiauChat - Solucoes Digitais"
- `igUsername`: "miau.chat"

Porem, o `handleSelectPage` no `InstagramIntegration.tsx` so envia `pageId` e `encryptedToken` para o backend. O backend tenta re-buscar os dados via Graph API (que falha), em vez de usar os dados ja disponoveis.

## Solucao

### 1. Frontend: `src/components/settings/integrations/InstagramIntegration.tsx`

Passar os dados enriquecidos (`igAccountId`, `igName`, `igUsername`) para o backend no passo "save", evitando que o backend precise re-buscar via Graph API:

```typescript
// No handleSelectPage, adicionar os campos:
body: {
  type: "instagram",
  step: "save",
  pageId: page.pageId,
  encryptedPageToken: page.encryptedToken,
  igAccountId: page.igAccountId,     // NOVO
  igName: page.igName,               // NOVO
  igUsername: page.igUsername,        // NOVO
  pageName: page.pageName,           // NOVO
}
```

### 2. Backend: `supabase/functions/meta-oauth-callback/index.ts`

No passo "save" (linha 73), usar os dados recebidos do frontend como primarios, e a re-busca via Graph API apenas como fallback:

```typescript
const { igAccountId: frontendIgAccountId, igName: frontendIgName, 
        igUsername: frontendIgUsername, pageName: frontendPageName } = body;

// Usar dados do frontend se disponiveis, senao buscar via API
const igBizId = frontendIgAccountId || pageInfo.instagram_business_account?.id;
const displayName = frontendIgName || igName || pageInfo.name || frontendPageName || pageId;
const displayUsername = frontendIgUsername || igUsername || igBizId || "";
```

### 3. Corrigir dados existentes (SQL)

Atualizar a conexao Instagram existente com os dados corretos para funcionar imediatamente:

```sql
UPDATE meta_connections 
SET ig_account_id = '17841479677897649',
    page_name = 'MiauChat - Soluções Digitais (@miau.chat)'
WHERE type = 'instagram' AND source = 'oauth' AND page_id = '977414192123496';
```

### 4. Deploy

- Redeployer `meta-oauth-callback`

## O que NAO muda

- Facebook (ja funciona perfeitamente)
- Webhook (`meta-webhook`) - a logica de lookup ja suporta `ig_account_id`, so precisava do dado correto no banco
- Fluxo de desconexao/reconexao

