

# Corrigir Instagram DM - Fluxo Antigo Ainda Ativo

## Diagnostico

Os logs do backend confirmam que a conexao atual da FMO usou o **fluxo antigo do Facebook** (nao o novo Instagram Business Login):

```
appId: "1237829051015100" (Facebook App - ERRADO)
type: "PAGE" (Page Access Token - ERRADO)
Erro: "(#3) Application does not have the capability to make this API call."
```

A conexao atual tem:
- `page_id: 119080757952130` (Facebook Page ID)
- Token: Page Access Token do Facebook

Para Instagram DM funcionar, precisamos de um **Instagram User Access Token** obtido via Instagram Business Login.

## Problemas Identificados

### 1. Escopos incompletos
O codigo atual solicita apenas 2 escopos:
```
instagram_business_basic,instagram_business_manage_messages
```
O painel da Meta exige 5:
```
instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights
```

### 2. Fluxo antigo do Facebook ainda existe no backend
O arquivo `meta-oauth-callback` tem dois caminhos para `type === "instagram"`:
- Linha 229: `flow === "instagram_login"` (NOVO - correto)
- Linha 462: `type === "instagram"` sem `flow` (ANTIGO - Facebook, nao funciona para DM)

Quando o usuario conectou, o fluxo antigo executou. Isso pode ter sido por cache do frontend ou por usar a URL do painel Meta diretamente.

### 3. Page Picker Dialog ainda existe
O componente `InstagramPagePickerDialog` faz parte do fluxo antigo (Facebook) e nao e necessario com Instagram Business Login (que retorna a conta diretamente).

## Correcoes

### Arquivo 1: `src/lib/meta-config.ts`
- Atualizar `INSTAGRAM_BUSINESS_SCOPES` para incluir todos os 5 escopos exigidos pelo painel Meta

### Arquivo 2: `supabase/functions/meta-oauth-callback/index.ts`
- Remover o fluxo antigo do Facebook para Instagram (linhas 462-630+)
- Remover o fluxo `step === "save"` com `encryptedPageToken` (linhas 73-226)
- Manter APENAS o fluxo `instagram_login` para type="instagram"
- Se alguem chamar type="instagram" sem `flow`, retornar erro orientando a reconectar

### Arquivo 3: `src/components/settings/integrations/InstagramIntegration.tsx`
- Remover handlers legados (`meta-oauth-success`, `meta-oauth-error`)
- Simplificar - so precisa do handler `meta-oauth-code`

### Arquivo 4: `src/components/settings/integrations/InstagramPagePickerDialog.tsx`
- Este componente nao e mais necessario (Instagram Business Login retorna a conta diretamente, sem picker de pagina)
- Pode ser mantido no codigo mas nao sera usado

## Acao Manual Necessaria

1. **Desconectar** o Instagram atual no sistema (a conexao existente usa token do Facebook que nao funciona)
2. **Reconectar** usando o botao "Conectar" -- agora usara o fluxo correto do Instagram Business Login
3. Verificar que "Permitir acesso a mensagens" esta ativado no app do Instagram

## Detalhes Tecnicos

### Escopos atualizados
```typescript
export const INSTAGRAM_BUSINESS_SCOPES = 
  "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights";
```

### Backend: remover fluxo antigo
O `meta-oauth-callback` para `type === "instagram"` tera APENAS o fluxo `instagram_login`:
1. Troca codigo em `api.instagram.com/oauth/access_token`
2. Obtem long-lived token em `graph.instagram.com/access_token`
3. Busca dados da conta em `graph.instagram.com/me`
4. Inscreve webhooks em `graph.instagram.com/{ig_user_id}/subscribed_apps`
5. Salva conexao com IG User Token

Qualquer chamada com `type === "instagram"` sem `flow === "instagram_login"` retornara erro 400 com instrucao para reconectar.

