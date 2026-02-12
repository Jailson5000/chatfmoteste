
# Correções Criticas -- Meta Integration Bugs

## Resumo

A analise completa revelou 3 bugs criticos que precisam ser corrigidos antes do deploy no VPS. As paginas de Conversas e Kanban estao visualmente corretas (icones diferenciados funcionando), mas o backend tem problemas que vao causar falhas silenciosas.

---

## Bug 1: Coluna `access_token_encrypted` nao existe (CRITICO)

**Onde:** `meta-webhook/index.ts` (linha 415) e `NewWhatsAppCloudDialog.tsx` (linha 62)

**Problema:** O codigo referencia `access_token_encrypted`, mas a coluna real na tabela `meta_connections` se chama `access_token`. Isso causa:
- O webhook nao consegue ler o token para baixar midias (retorna `null`)
- O dialog de criacao tenta gravar em coluna inexistente (erro de insert)

**Correcao:**
- No `meta-webhook/index.ts`: trocar `.select("... access_token_encrypted ...")` por `.select("... access_token ...")`  e `connection.access_token_encrypted` por `connection.access_token`
- No `NewWhatsAppCloudDialog.tsx`: trocar `access_token_encrypted: encryptedToken` por `access_token: encryptedToken`

---

## Bug 2: Acao `encrypt_token` inexistente na `meta-api` (CRITICO)

**Onde:** `NewWhatsAppCloudDialog.tsx` (linha 50)

**Problema:** O dialog chama `supabase.functions.invoke("meta-api", { body: { action: "encrypt_token", token: accessToken } })`, mas a edge function `meta-api` nao tem handler para essa acao -- ela so processa envio de mensagens. O resultado e que o try/catch usa o fallback `encData?.encrypted || accessToken`, salvando o token em texto puro.

**Correcao:** Em vez de chamar uma edge function para encriptar, fazer a encriptacao diretamente no `meta-webhook` ao receber a primeira mensagem, ou salvar o token como esta (ja que `meta-api` e `meta-oauth-callback` ja usam `access_token` direto com `decryptToken` do shared). A abordagem mais simples e: adicionar a acao `encrypt_token` na `meta-api` usando o utilitario `encryptToken` que ja existe em `_shared/encryption.ts`.

---

## Bug 3: Bucket `chat-media` e privado (MEDIO)

**Onde:** Migracao SQL que criou o bucket

**Problema:** O bucket foi criado com `public = false`, mas o codigo usa `getPublicUrl()` para gerar URLs de midia. URLs publicas de buckets privados retornam 400/403, e as imagens/audios/videos nao serao exibidos no chat.

**Correcao:** Atualizar o bucket para `public = true` via SQL: `UPDATE storage.buckets SET public = true WHERE id = 'chat-media'`

---

## Analise de Conversas e Kanban (OK)

- `ConversationSidebarCard.tsx`: Icones corretos para Instagram (rosa), Facebook (azul), WhatsApp Cloud (verde), WhatsApp normal (Phone), Widget (Globe). Sem regressao.
- `KanbanCard.tsx`: Mesma logica de icones, funcionando corretamente. Sem regressao.
- `useConversationMapping.tsx`: Campo `origin` e `originMetadata` ja mapeados. OK.
- `KanbanChatPanel.tsx`: Roteamento por origin para `meta-api` vs `evolution-api` ja implementado. OK.

---

## Secao Tecnica

### Arquivos a modificar:

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/meta-webhook/index.ts` | Trocar `access_token_encrypted` por `access_token` (linhas 415 e 430) |
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Trocar `access_token_encrypted` por `access_token` e remover chamada `encrypt_token` |
| `supabase/functions/meta-api/index.ts` | Adicionar handler para acao `encrypt_token` |
| Migracao SQL | `UPDATE storage.buckets SET public = true WHERE id = 'chat-media'` |

### Ordem de execucao:

1. Migracao SQL (bucket publico)
2. meta-webhook (corrigir nome da coluna)
3. meta-api (adicionar acao encrypt_token)
4. NewWhatsAppCloudDialog (corrigir nome da coluna)
5. Re-deploy das edge functions
