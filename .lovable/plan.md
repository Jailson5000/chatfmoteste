

# Corrigir Instagram OAuth - Redirect URI e Scopes

## Problema 1: Redirect URI invalida

O erro "Invalid redirect_uri" acontece porque o Instagram Business Login tem suas proprias configuracoes de redirect URI, separadas do Facebook Login. No dashboard Meta, a URI configurada e `https://miauchat.com.br/`, mas o codigo envia `https://miauchat.com.br/auth/meta-callback`.

### Solucao (2 partes):

**Parte A - No Meta Dashboard (voce faz manualmente):**

1. Ir em "Configuracoes do login da empresa" (botao na secao 4 do screenshot)
2. Adicionar estas URIs como "Valid OAuth Redirect URIs":
   - `https://miauchat.com.br/auth/meta-callback`
   - `https://chatfmoteste.lovable.app/auth/meta-callback`
3. Salvar

**Parte B - No codigo (eu faco):**

Criar uma funcao `getInstagramRedirectUri()` separada que retorna a URI correta para o fluxo Instagram, garantindo que bate com o que esta registrado no Meta.

## Problema 2: Scopes incorretos para modo teste

O dashboard mostra apenas 3 permissoes aprovadas:
- `instagram_business_basic`
- `instagram_manage_comments` (NAO `instagram_business_manage_comments`)
- `instagram_business_manage_messages`

O codigo pede 5 scopes, incluindo `instagram_business_content_publish` e `instagram_business_manage_insights` que podem nao estar aprovados. Em modo teste, pedir scopes nao aprovados pode causar erro.

### Solucao:

Atualizar `META_SCOPES.instagram` para usar apenas os 3 scopes aprovados, com o nome correto (`instagram_manage_comments` em vez de `instagram_business_manage_comments`).

## Alteracoes no codigo

### `src/lib/meta-config.ts`

| O que muda | De | Para |
|------------|-----|------|
| Scopes Instagram | `instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights` | `instagram_business_basic,instagram_business_manage_messages,instagram_manage_comments` |

Apenas a correcao dos scopes. A URL do endpoint e o App ID ja estao corretos.

### Nenhuma alteracao no backend

O backend (`meta-oauth-callback`) ja esta correto -- a funcao `handleInstagramBusiness` usa o `redirectUri` que vem do body da request, entao vai funcionar com qualquer URI desde que bata com a registrada no Meta.

## Passos para voce (no Meta Dashboard)

1. Abrir o app no Meta Developers
2. Ir em "API do Instagram" > "Configuracao da API com login d..."
3. Clicar em "Configuracoes do login da empresa" (secao 4)
4. Adicionar estas Redirect URIs:
   - `https://miauchat.com.br/auth/meta-callback`
   - `https://chatfmoteste.lovable.app/auth/meta-callback`
5. Salvar

## Resultado esperado

1. Usuario clica "Conectar" no card Instagram
2. Popup abre em `instagram.com/oauth/authorize` com scopes corretos
3. Instagram reconhece a redirect_uri como valida
4. Usuario autoriza (usando conta de teste do app)
5. Redirect para callback, backend troca code por token
6. Conexao salva, popup fecha

