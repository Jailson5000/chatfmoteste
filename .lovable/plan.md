
# Corrigir Instagram DM, Botoes e Nome/Foto do Facebook

## Problemas Encontrados

### 1. Instagram nao recebe mensagens (CAUSA RAIZ ENCONTRADA)
O log do deploy mostra claramente o erro:
```
Instagram account subscription result: {"error":{"message":"Invalid OAuth access token - Cannot parse access token","type":"OAuthException","code":190}}
```

O codigo usa `graph.instagram.com` para inscrever a conta IG, mas esse endpoint requer um **Instagram User Access Token** (obtido via Instagram Business Login). O sistema usa **Facebook Login**, que gera **Page Access Tokens** -- esses tokens so funcionam em `graph.facebook.com`.

A documentacao oficial da Meta diz que a inscricao de contas Instagram deve ser feita em:
```
POST graph.facebook.com/{ig-user-id}/subscribed_apps
```
E NAO em `graph.instagram.com`. O dominio correto e o mesmo `graph.facebook.com`, so muda o ID (usa o `ig_account_id` em vez do `page_id`).

### 2. Botao "Configuracoes" nao funciona
O componente `InstagramIntegration` nao passa a prop `onSettings` para o `IntegrationCard`. Quando o usuario clica, nada acontece porque o handler e `undefined`.

### 3. Botao Toggle (liga/desliga) 
O codigo do toggle parece correto (RLS policies estao OK, mutation esta correta). Porem, ao ativar, o resubscribe automatico tambem usa `graph.instagram.com` (que falha), podendo causar confusao. Vamos corrigir o endpoint para garantir que funcione.

### 4. Facebook nao puxa nome e foto
O log mostra:
```
Profile fallback also failed: 400 "Object with ID does not exist, cannot be loaded due to missing permissions"
```
O Messenger Platform exige a feature "Business Asset User Profile Access" para acessar `name`, `first_name`, `last_name` e `profile_pic`. Sem essa feature aprovada no painel Meta, os campos retornam erro 400.Alem disso, o codigo usa `name` que pode nao estar disponivel -- o correto para Messenger e `first_name,last_name,profile_pic`.

---

## Correcoes

### Arquivo 1: `supabase/functions/meta-oauth-callback/index.ts`
- **Corrigir endpoint de inscricao Instagram**: Trocar `graph.instagram.com` por `graph.facebook.com` (usando a constante `GRAPH_API_BASE` ja existente)
- Manter o `subscribed_fields: "messages"` e o Page Access Token (que e correto para `graph.facebook.com`)

### Arquivo 2: `supabase/functions/meta-api/index.ts`
- **Corrigir resubscribe**: Mesma correcao -- trocar `graph.instagram.com` por `GRAPH_API_BASE` (que aponta para `graph.facebook.com`)

### Arquivo 3: `supabase/functions/meta-webhook/index.ts`
- **Corrigir fetch de perfil do Facebook**: Usar `first_name,last_name,profile_pic` em vez de `name,profile_pic`
- Construir o nome completo a partir de `first_name` + `last_name`
- Manter fallback com `first_name` apenas

### Arquivo 4: `src/components/settings/integrations/InstagramIntegration.tsx`
- **Adicionar handler `onSettings`**: Passar prop `onSettings` para `IntegrationCard` mostrando informacoes da conexao (similar ao Facebook que mostra toast com nome da pagina)

---

## Detalhes Tecnicos

### Correcao do endpoint Instagram (meta-oauth-callback e meta-api)

De:
```typescript
await fetch(
  `https://graph.instagram.com/${GRAPH_API_VERSION}/${igBizId}/subscribed_apps`,
  ...
);
```

Para:
```typescript
await fetch(
  `${GRAPH_API_BASE}/${igBizId}/subscribed_apps`,
  ...
);
```

### Correcao do perfil Facebook (meta-webhook)

De:
```typescript
const fields = "name,profile_pic";
```

Para:
```typescript
const fields = origin === "FACEBOOK" ? "first_name,last_name,profile_pic" : "name,profile_pic";
// ...
resolvedName = profile.first_name && profile.last_name
  ? `${profile.first_name} ${profile.last_name}`
  : profile.name || profile.first_name || null;
```

### Adicionar onSettings no Instagram

```typescript
onSettings={() => {
  toast.info(`Pagina: ${connection.page_name}\nIG Account: ${(connection as any).ig_account_id || "N/A"}`);
}}
```

---

## Acao Manual Necessaria

1. **Apos o deploy**: Desconectar e reconectar o Instagram da FMO para disparar a nova inscricao (agora no endpoint correto)
2. **Para nome/foto do Facebook**: Verificar no painel Meta Developer se a feature "Business Asset User Profile Access" esta aprovada. Sem ela, o Facebook nao retorna nome/foto de usuarios do Messenger.
3. **Instagram "Permitir acesso a mensagens"**: O dono da conta @fmoadvbr deve verificar em Instagram > Configuracoes > Mensagens > Ferramentas conectadas que esta ativado.
