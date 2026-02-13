

# Correcao: WhatsApp Cloud Embedded Signup - FB.login() falhando

## Diagnostico

O erro **"O Facebook SDK nao respondeu corretamente"** ocorre porque `FB.login()` lanca uma excecao no `catch` (linha 228 do `NewWhatsAppCloudDialog.tsx`). Isso acontece **mesmo com popups permitidos**.

Baseado na analise do artigo da ZDG e do codigo atual, identifiquei **2 causas**:

### Causa 1: Dominios nao configurados na Meta (3 lugares)

O artigo da ZDG e bem claro: para o popup do Embedded Signup funcionar, os dominios precisam estar cadastrados em **3 lugares diferentes** no Meta Developer Console:

1. **Login com o Facebook > Configuracoes** - URIs de redirecionamento do OAuth validas
   - Adicionar: `https://miauchat.com.br`, `https://suporte.miauchat.com.br`
   
2. **Configuracoes > Basica** - Dominios do aplicativo
   - Adicionar: `miauchat.com.br`

3. **Cadastro Incorporado > Gerenciamento de dominios**
   - Adicionar: `miauchat.com.br`, `suporte.miauchat.com.br`, `chatfmoteste.lovable.app`

Sem essas configuracoes, o SDK bloqueia a chamada `FB.login()` e lanca uma excecao.

### Causa 2: Inicializacao do SDK com race condition

O SDK carrega via `<script async defer>` no `index.html`. O `useEffect` no componente tenta `FB.init()` apenas uma vez no mount. Se o SDK ainda nao carregou quando o componente monta, define `window.fbAsyncInit`. Porem, se o SDK ja carregou ANTES do React montar (cached pelo browser), `fbAsyncInit` nunca e chamado porque o SDK ja disparou esse callback.

Alem disso, o `useEffect` depende de `[META_APP_ID]` que e uma constante - entao so roda uma vez. Se `window.FB` nao existia nesse momento, `sdkReady` fica `false` para sempre (botao desabilitado) ou, em alguns cenarios, `window.FB` existe mas `FB.init` nao completou.

---

## Plano de Correcao

### Parte 1: Correcao robusta do carregamento do SDK (codigo)

**Arquivo:** `src/components/connections/NewWhatsAppCloudDialog.tsx`

Substituir a logica de inicializacao do SDK por uma abordagem mais robusta:

- Usar um **polling** com `setInterval` que verifica `window.FB` a cada 500ms por ate 15 segundos
- Quando encontrar `window.FB`, chamar `FB.init()` e depois `FB.getLoginStatus()` para confirmar
- Adicionar logs detalhados em cada etapa para diagnosticar problemas futuros
- No `FB.login()`, capturar o **erro real** (`fbErr.message`) e mostrar no toast em vez da mensagem generica
- Adicionar `scope: "whatsapp_business_management,whatsapp_business_messaging,business_management"` ao `FB.login()` conforme recomendado pela ZDG

### Parte 2: Configuracoes manuais no Meta Developer Console (voce faz)

Voce precisa acessar `developers.facebook.com/apps/1237829051015100` e configurar:

**2.1 - Login com o Facebook > Configuracoes:**
- URIs de redirecionamento OAuth validas: 
  - `https://miauchat.com.br/auth/meta-callback`
  - `https://chatfmoteste.lovable.app/auth/meta-callback`

**2.2 - Configuracoes > Basica:**
- Dominios do aplicativo: `miauchat.com.br`, `lovable.app`

**2.3 - Casos de uso > WhatsApp > Cadastro Incorporado > Gerenciamento de dominios:**
- Adicionar: `miauchat.com.br`, `suporte.miauchat.com.br`, `chatfmoteste.lovable.app`

**2.4 - Verificar permissoes no Cadastro Incorporado:**
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management`

### Parte 3: Token de Usuario do Sistema (para enviar/receber mensagens)

Conforme o artigo da ZDG, para enviar e receber mensagens via WhatsApp Cloud API, voce precisa de um **System User Token** (token permanente):

1. No Business Manager (`business.facebook.com`), va em **Usuarios > Usuarios do sistema**
2. Crie um usuario Admin (ou use existente)
3. Gere um token com expiracao **Nunca** e as permissoes:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`  
   - `business_management`
4. Esse token sera usado pelo `meta-oauth-callback` para salvar na conexao

**Importante:** O token gerado pelo Embedded Signup (OAuth) tem validade de 60 dias. Para producao, o ideal e usar o System User Token. Porem, o fluxo Embedded Signup ja funciona para testes iniciais.

---

## Resumo das alteracoes de codigo

| Arquivo | Mudanca |
|---------|---------|
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Polling robusto para SDK, scope no FB.login, erro detalhado no toast |

## Configuracoes manuais (Meta Developer Console)

| Local | O que configurar |
|-------|-----------------|
| Login com Facebook > Config | URIs de redirect |
| Config > Basica | Dominios do app |
| Cadastro Incorporado | Dominios permitidos |
| Business Manager | System User Token (opcional para teste) |

## Resultado esperado

1. O SDK carrega de forma confiavel em qualquer cenario de cache
2. O `FB.login()` abre o popup do Embedded Signup sem excecoes
3. Se houver erro, a mensagem mostra a causa real (nao mensagem generica)
4. Apos configurar os dominios, o fluxo completo funciona: popup abre > usuario configura WABA > conexao e salva

