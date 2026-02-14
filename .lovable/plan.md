
# Corrigir Instagram OAuth + Campos de Token Separados para Cada Canal

## Problemas Identificados

### 1. Instagram OAuth quebrado
O erro "Invalid Scopes: instagram_business_basic, instagram_business_manage_messages" acontece porque o app na Meta ainda nao tem essas permissoes aprovadas. Precisamos **reverter** para os scopes antigos que o app ja possui: `instagram_basic` e `instagram_manage_messages`.

### 2. Falta campos de token manual para Facebook e Instagram
Atualmente, a pagina de testes so tem campo para colar token do WhatsApp. Como cada canal gera um token diferente no painel da Meta, precisamos de campos separados para:
- **WhatsApp Cloud**: Token + Phone Number ID + WABA ID (ja existe)
- **Facebook Messenger**: Token + Page ID
- **Instagram DM**: Token + Page ID + IG Account ID

### 3. Backend so salva conexao manual para WhatsApp
A action `save_test_connection` no `meta-api` so cria conexoes do tipo `whatsapp_cloud`. Precisa aceitar um parametro `connectionType` para salvar tambem `facebook` e `instagram`.

## Alteracoes

### 1. `src/lib/meta-config.ts` - Reverter scopes do Instagram

Voltar para os scopes que o app ja tem aprovados:
```
instagram: "instagram_basic,instagram_manage_messages,pages_show_list"
```

### 2. `src/pages/admin/MetaTestPage.tsx` - Adicionar campos para Facebook e Instagram

Adicionar duas novas secoes de conexao manual:

**Facebook Messenger:**
- Campo: Token (da pagina Configuracoes da API do Messenger)
- Campo: Page ID (ID da pagina do Facebook)

**Instagram DM:**
- Campo: Token (da pagina Configuracoes do Instagram)
- Campo: Page ID
- Campo: IG Account ID

Cada secao tera um botao "Salvar Conexao" que chama `save_test_connection` com o tipo correto.

### 3. `supabase/functions/meta-api/index.ts` - Aceitar tipo de conexao no save_test_connection

Modificar a action `save_test_connection` para aceitar `connectionType` (padrao: `whatsapp_cloud`), `pageId` e `igAccountId`, permitindo salvar conexoes de qualquer canal.

### 4. `src/pages/admin/MetaTestPage.tsx` - Reverter nomes de permissoes nos testes

Voltar os nomes das permissoes do Messenger para `instagram_manage_messages` e `instagram_basic` (os que o app realmente usa).

## Resumo de arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Reverter scopes para `instagram_basic,instagram_manage_messages` |
| `src/pages/admin/MetaTestPage.tsx` | Adicionar campos de token manual para Facebook e Instagram; reverter nomes de permissoes |
| `supabase/functions/meta-api/index.ts` | Aceitar `connectionType`, `pageId`, `igAccountId` no `save_test_connection` |

Deploy: `meta-api`
