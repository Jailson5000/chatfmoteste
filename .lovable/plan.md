
# ✅ Instagram DM - Migração Concluída

## O que foi feito

### 1. Escopos atualizados (`src/lib/meta-config.ts`)
- `INSTAGRAM_BUSINESS_SCOPES` agora inclui todos os 5 escopos exigidos:
  `instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights`

### 2. Frontend simplificado (`InstagramIntegration.tsx`)
- Removidos handlers legados (`meta-oauth-success`, `meta-oauth-error`)
- Mantido apenas o handler `meta-oauth-code` que chama `flow: "instagram_login"`

### 3. Backend limpo (`meta-oauth-callback/index.ts`)
- Removido fluxo `step === "save"` com `encryptedPageToken` (155 linhas)
- Removido fluxo antigo do Facebook para Instagram (167 linhas)
- Mantido APENAS o fluxo `instagram_login` para `type === "instagram"`
- Chamadas legadas retornam erro 400 orientando a reconectar

### 4. Anteriormente implementado
- `meta-api`: resubscribe e envio via `graph.instagram.com` para conexões nativas
- `meta-webhook`: redeployado com correção do Facebook profile

## Ação Manual Necessária

1. **Desconectar** o Instagram atual no sistema
2. **Reconectar** usando o botão "Conectar" (agora usa Instagram Business Login nativo)
3. Verificar que "Permitir acesso a mensagens" está ativado no app do Instagram
