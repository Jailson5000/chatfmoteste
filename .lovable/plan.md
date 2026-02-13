

# Correcao: WhatsApp Cloud - Remover dependencia do FB JS SDK

## Problema

O erro "O dominio do host JSSDK e desconhecido" ocorre porque o Facebook JS SDK exige que **cada subdominio** (ex: `suporte.miauchat.com.br`, `empresa1.miauchat.com.br`, etc.) esteja cadastrado em "Dominios permitidos para o SDK do JavaScript". Num SaaS com subdominios dinamicos, isso e inviavel.

## Solucao

Voce confirmou que a URL direta funciona:
```
https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1237829051015100&config_id=1461954655333752&extras=...
```

A solucao e **substituir o FB.login() por um popup com a URL OAuth direta do Facebook**. Isso nao usa o JS SDK e nao tem restricao de dominio.

## Fluxo corrigido

```text
Usuario clica "Conectar"
        |
        v
Abre popup com URL OAuth do Facebook
(facebook.com/v21.0/dialog/oauth?client_id=...&config_id=...&redirect_uri=...&response_type=code)
        |
        v
Usuario completa Embedded Signup no popup
        |
        v
Facebook redireciona para /auth/meta-callback com ?code=...
        |
        v
MetaAuthCallback.tsx processa o codigo,
chama meta-oauth-callback no backend,
envia postMessage para a janela pai
        |
        v
NewWhatsAppCloudDialog recebe postMessage de sucesso,
mostra toast e fecha
```

## Alteracoes

### Arquivo 1: `src/components/connections/NewWhatsAppCloudDialog.tsx`

Reescrever completamente a logica de conexao:

- **Remover**: toda a logica de inicializacao do FB SDK (`useEffect` com polling, `sdkReady`, `FB.init`, `FB.login`)
- **Adicionar**: funcao `handleConnect` que:
  1. Constroi a URL OAuth: `https://www.facebook.com/v21.0/dialog/oauth?client_id={META_APP_ID}&config_id={META_CONFIG_ID}&redirect_uri={getFixedRedirectUri()}&response_type=code&override_default_response_type=true&scope=whatsapp_business_management,whatsapp_business_messaging,business_management&state={"type":"whatsapp_cloud"}`
  2. Abre a URL num `window.open()` (popup 700x800)
  3. Escuta `window.addEventListener("message", ...)` para receber o resultado do `MetaAuthCallback`
  4. Ao receber `meta-oauth-success`, mostra toast de sucesso e fecha
  5. Ao receber `meta-oauth-error`, mostra toast de erro
  6. Timeout de 3 minutos como fallback
- **Remover**: botao desabilitado por `sdkReady` (agora sempre habilitado)
- **Remover**: `window.FB` e `fbAsyncInit` referencias

### Arquivo 2: `src/pages/MetaAuthCallback.tsx`

Ja esta pronto! O callback ja:
- Detecta `type: "whatsapp_cloud"` do parametro `state`
- Chama `meta-oauth-callback` com `type: "whatsapp_cloud"` e `code`
- Envia `postMessage` para o opener com sucesso ou erro
- Fecha a janela automaticamente

### Arquivo 3: `supabase/functions/meta-oauth-callback/index.ts`

Ja esta pronto! O backend ja:
- Recebe `code` e `type: "whatsapp_cloud"`
- Troca o code por token de longa duracao
- Auto-descobre WABA e numeros de telefone via `handleWhatsAppCloud()`
- Salva a conexao no banco

**Nenhuma alteracao necessaria no backend.**

## Vantagens

1. **Zero dependencia do FB JS SDK** para WhatsApp - elimina o erro de dominio
2. **Funciona em qualquer subdominio** sem cadastrar cada um na Meta
3. **Codigo mais simples** - sem polling, retry, FB.init, etc.
4. **Reutiliza** o `MetaAuthCallback` que ja existe e funciona
5. O FB SDK continua carregando no `index.html` para Instagram/Facebook (que usam outro fluxo)

## Resumo

| Arquivo | Mudanca |
|---------|---------|
| `NewWhatsAppCloudDialog.tsx` | Substituir FB.login() por popup com URL OAuth direta |
| `MetaAuthCallback.tsx` | Nenhuma (ja funciona) |
| `meta-oauth-callback/index.ts` | Nenhuma (ja funciona) |

