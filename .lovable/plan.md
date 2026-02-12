
# Solução: Corrigir OAuth Meta com Subdomínios - Configuração + Código

## O Problema

O sistema usa subdomínios dinâmicos (`suporte.miauchat.com.br`, `admin.miauchat.com.br`, etc), mas o Meta OAuth exige que **todos os domínios estejam explicitamente registrados** no Meta Developer Dashboard. Adicionar todos os subdomínios manualmente é impraticável.

**Erro na imagem**: "Não é possível carregar a URL" - O domínio do callback não está autorizado.

## A Solução de Dois Lados

### 1. CONFIGURAÇÃO META DEVELOPER DASHBOARD (você precisa fazer manualmente)

Em "Facebook Login for Business" > "Settings":

**App Domains** (campo principal):
```
miauchat.com.br
chatfmoteste.lovable.app
```

**Valid OAuth Redirect URIs** (deve ser exatamente):
```
https://miauchat.com.br/auth/meta-callback
https://chatfmoteste.lovable.app/auth/meta-callback
```

**OAuth Client Settings**:
- ✅ Client OAuth Login: Sim
- ✅ Web OAuth Login: Sim
- ✅ Enforce HTTPS: Sim
- ✅ Use Strict Mode for Redirect URIs: Sim
- ❌ OAuth Login in Embedded Browser: Não
- ❌ Force Web OAuth Reauthentication: Não

**IMPORTANTE**: Adicione APENAS os domínios RAIZ, não os subdomínios. O Meta aceita requisições de qualquer subdomínio do domínio raiz.

### 2. VERIFICAÇÃO E MELHORIAS DO CÓDIGO

**Arquivo `src/lib/meta-config.ts`**: ✅ Já está correto
- `getFixedRedirectUri()` retorna domínios fixos, não subdomínios dinâmicos
- Funciona para `miauchat.com.br` e `chatfmoteste.lovable.app`

**Arquivo `src/pages/MetaAuthCallback.tsx`**: ✅ Já está correto
- Usa `getFixedRedirectUri()` para garantir consistência
- Suporta popup com `postMessage`

**Arquivo `FacebookIntegration.tsx` e `InstagramIntegration.tsx`**: ✅ Já estão corretos
- Abrem popup (não navegação direta)
- Escutam `postMessage` para resultado

**Edge Function `meta-oauth-callback/index.ts`**: ✅ Já está correto
- Aceita `redirectUri` do frontend
- Usa esse valor para trocar o código

## Fluxo Final (Após Configuração)

1. Usuário em `suporte.miauchat.com.br` clica "Conectar com Instagram"
2. `buildMetaOAuthUrl()` retorna:
   ```
   https://www.facebook.com/v21.0/dialog/oauth?client_id=...&redirect_uri=https%3A%2F%2Fmiauchat.com.br%2Fauth%2Fmeta-callback&...
   ```
   (Note: `redirect_uri` é sempre `miauchat.com.br`, nunca o subdomínio)

3. Meta abre OAuth nesse domínio fixo → Valida ✅
4. Apos autenticação, redireciona para `/auth/meta-callback` em `miauchat.com.br`
5. O callback processa, avisa a janela original via `postMessage`
6. Popup fecha, conexão aparece em `suporte.miauchat.com.br`

## O que Você Precisa Fazer

**AGORA**: Ir ao Meta Developer Dashboard e atualizar os dois campos mencionados acima.

**Configuração é a chave** - o código já está preparado para lidar com subdomínios corretamente.

