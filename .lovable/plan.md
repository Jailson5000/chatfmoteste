

# Corrigir Nome e Foto de Perfil do Instagram

## Problema

Os logs mostram o erro:
```
"Invalid OAuth access token - Cannot parse access token"
```

O codigo atual busca perfis de contatos do Instagram em `graph.facebook.com`:
```
https://graph.facebook.com/v22.0/{senderId}?fields=name,profile_pic&access_token={token}
```

Porem, o token de Instagram Business Login e um **Instagram User Access Token**, que so funciona em `graph.instagram.com`. O Facebook nao reconhece esse token, gerando o erro.

## Correcao

### Arquivo: `supabase/functions/meta-webhook/index.ts` (linhas 402-446)

Alterar o bloco de resolucao de perfil para usar o endpoint correto por canal:

- **Instagram**: `https://graph.instagram.com/v22.0/{senderId}?fields=name,profile_pic&access_token={token}`
- **Facebook**: `https://graph.facebook.com/v22.0/{senderId}?fields=first_name,last_name,profile_pic&access_token={token}` (sem alteracao)

A mudanca e apenas na URL base usada para Instagram. O campo `name` e `profile_pic` continuam validos na API do Instagram.

### Tambem corrigir o fallback (linha 419-421)

O fallback tambem usa `graph.facebook.com` e precisa ser atualizado para usar `graph.instagram.com` quando o canal for Instagram.

### Detalhes Tecnicos

```typescript
// Determinar base URL por canal
const graphBase = origin === "INSTAGRAM" 
  ? "https://graph.instagram.com/v22.0" 
  : "https://graph.facebook.com/v22.0";

// Busca principal
const profileRes = await fetch(
  `${graphBase}/${senderId}?fields=${fields}&access_token=${token}`
);

// Fallback tambem usa graphBase
const fallbackRes = await fetch(
  `${graphBase}/${senderId}?fields=${fallbackField}&access_token=${token}`
);
```

### Clientes existentes

Os contatos que ja foram criados com nome generico (ex: "INSTAGRAM 6179") serao atualizados automaticamente na proxima mensagem recebida, pois o codigo ja detecta nomes genericos e tenta resolver novamente (linha 376-379).

