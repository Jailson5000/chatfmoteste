

# Correcao Completa: Mensagens Vazias + Nome/Foto + WhatsApp Popup

## Problema 1 (CRITICO): Mensagens nao aparecem no Instagram e Facebook

**Causa raiz confirmada nos logs (01:19:46 UTC):**
```
Could not find the 'external_id' column of 'messages' in the schema cache
```

A conversa e criada com sucesso, mas a insercao da **mensagem** falha porque o codigo tenta gravar na coluna `external_id` que **nao existe** na tabela `messages`. Por isso as conversas aparecem como "Sem mensagens".

**Correcao em 2 partes:**

1. **Migracao SQL**: Adicionar a coluna `external_id` na tabela `messages`:
```sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_id text;
```

2. **Resiliencia no codigo** (backup): No `meta-webhook/index.ts`, remover `external_id` da insercao direta e usar uma abordagem que nao quebre se a coluna nao existir. Isso evita que qualquer futuro schema cache issue bloqueie mensagens.

**Arquivos afetados:**
- Migracao SQL (nova)
- `supabase/functions/meta-webhook/index.ts` (linhas 401-408 e 607-615)

---

## Problema 2: Nomes genericos ("INSTAGRAM 5644", "FACEBOOK 6806")

**Causa:** Na funcao `processMessagingEntry` (linha 337), ao criar um novo cliente, o nome e definido como:
```
name: `${origin} ${remoteJid.slice(-4)}`
```

O webhook do Instagram/Facebook nao envia o nome do perfil no payload. Precisamos buscas via Graph API.

**Correcao:**
- Adicionar `access_token` ao `selectFields` da query de `meta_connections`
- Apos criar a conversa, fazer uma chamada `GET /{senderId}?fields=name,username&access_token=...` para buscar o nome real
- Usar o nome retornado para atualizar `clients.name` e `conversations.contact_name`
- Fallback: manter o nome generico se a API falhar

**Arquivo afetado:** `supabase/functions/meta-webhook/index.ts`

---

## Problema 3: Foto do perfil nao aparece

**Correcao:** Na mesma chamada Graph API do Problema 2, adicionar o campo `profile_pic` (Instagram) ou usar o endpoint de foto do Facebook. Salvar a URL da foto no campo `avatar_url` do cliente.

**Arquivo afetado:** `supabase/functions/meta-webhook/index.ts`

---

## Problema 4: WhatsApp Cloud - Popup bloqueado mesmo com permissao

**Diagnostico:** O screenshot mostra que o popup esta **permitido** nas configuracoes do navegador, mas o toast "Erro ao abrir popup" ainda aparece. Isso significa que `FB.login()` esta lancando uma excecao (caindo no `catch`), nao que o popup foi bloqueado.

**Causas provaveis:**
1. O FB SDK carrega de forma **assincrona** (`async defer`). Se o usuario clica rapido, `window.FB` pode existir mas `FB.login` pode nao estar pronto
2. O `FB.init` pode nao ter completado quando `FB.login` e chamado
3. O `sdkReady` pode estar `true` antes do SDK estar realmente operacional

**Correcao:**
- Adicionar `console.log` detalhado **antes** do `FB.login` para capturar o estado exato do SDK
- Verificar `window.FB.getLoginStatus` antes de chamar `FB.login` para confirmar que o SDK esta operacional
- Envolver o `FB.login` em uma verificacao mais robusta do estado do SDK
- Adicionar uma segunda tentativa automatica se o primeiro `FB.login` falhar
- Mudar a mensagem de erro para ser mais especifica sobre o que aconteceu

**Arquivo afetado:** `src/components/connections/NewWhatsAppCloudDialog.tsx`

---

## Resumo das alteracoes

| Arquivo | Mudanca |
|---------|---------|
| Migracao SQL | `ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_id text;` |
| `supabase/functions/meta-webhook/index.ts` | Buscar nome e foto de perfil via Graph API; adicionar `access_token` ao select da conexao |
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Melhorar verificacao do SDK, adicionar retry, logs detalhados |

## Ordem de implementacao

1. Executar migracao SQL para adicionar `external_id` (resolve "Sem mensagens" imediatamente)
2. Atualizar `meta-webhook` para buscar nome/foto via Graph API
3. Melhorar logica do popup no `NewWhatsAppCloudDialog`
4. Redeployar `meta-webhook`
5. Testar: enviar mensagem no Instagram e Facebook para verificar nome + conteudo
6. Testar: clicar em "Conectar com Facebook" no WhatsApp Cloud

