

# Corrigir Nome e Foto de Perfil do Facebook Messenger

## Problema

Os logs mostram que a busca de perfil do Facebook falha com:
```
"Unsupported get request. Object with ID '7584297064950182' does not exist,
cannot be loaded due to missing permissions"
```

A API `GET /{PSID}?fields=first_name,last_name,profile_pic` requer que o app tenha a feature **"Business Asset User Profile Access"** aprovada no painel da Meta. Sem ela, o endpoint retorna erro mesmo com Page Access Token valido.

## Solucao

Usar uma abordagem alternativa que nao requer essa feature: buscar o nome do remetente via **Message ID** (`mid`) do webhook.

O endpoint `GET /{message_id}?fields=from` retorna o campo `from.name` do remetente, e funciona com as permissoes ja concedidas (`pages_messaging`).

## Alteracoes

### Arquivo: `supabase/functions/meta-webhook/index.ts`

1. **Capturar o `mid`** do payload do webhook (ja disponivel em `message.mid`)

2. **Alterar a logica de resolucao de perfil para Facebook**: Em vez de `GET /{PSID}?fields=first_name,last_name,profile_pic`, usar:

```typescript
// Facebook: use message ID to get sender name (doesn't require Business Asset User Profile Access)
if (origin === "FACEBOOK" && messageMid) {
  const midRes = await fetch(
    `https://graph.facebook.com/v22.0/${messageMid}?fields=from&access_token=${token}`
  );
  if (midRes.ok) {
    const midData = await midRes.json();
    resolvedName = midData.from?.name || null;
  }
}
```

3. **Manter o fluxo atual como fallback**: Se o `mid` approach falhar, tenta o endpoint original `/{PSID}` como fallback (para o caso da feature ser aprovada no futuro).

4. **Instagram continua inalterado**: Ja funciona com `graph.instagram.com/{senderId}?fields=name,profile_pic`.

### Limitacao

A abordagem via `mid` retorna apenas o **nome** do contato, nao a foto de perfil. Para obter `profile_pic` do Facebook Messenger, e necessario ativar a feature "Business Asset User Profile Access" no painel de desenvolvedores da Meta (requer revisao do app). Isso pode ser feito manualmente depois.

## Arquivo alterado

- `supabase/functions/meta-webhook/index.ts` (redeploy necessario)
