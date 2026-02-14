

# Corrigir OAuth do Instagram - Usar mesmo fluxo do Facebook

## Problema

O erro "Invalid platform app" acontece porque o endpoint `instagram.com/oauth/authorize` so funciona para apps configurados como plataforma "Instagram" no Meta Developers. O seu app usa "Facebook Login for Business", entao o Instagram **tambem deve usar o dialog do Facebook** (`facebook.com/dialog/oauth`), igual ao Facebook Messenger.

O fluxo correto e: usuario faz login pelo Facebook, autoriza a pagina, e o backend detecta a conta Instagram Professional vinculada a essa pagina.

## Alteracoes

### 1. `src/lib/meta-config.ts` - Reverter endpoint e scopes do Instagram

O Instagram deve usar o **mesmo endpoint OAuth do Facebook** (`facebook.com/dialog/oauth`), apenas com scopes diferentes que incluem acesso ao Instagram:

```
ANTES (quebrado):
instagram: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish"
+ endpoint separado instagram.com/oauth/authorize

DEPOIS (correto):
instagram: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish,pages_show_list"
+ mesmo endpoint facebook.com/dialog/oauth
```

Remover o `if (type === "instagram")` que redireciona para `instagram.com`. Ambos os tipos usam o mesmo endpoint do Facebook. A unica diferenca sao os scopes solicitados.

### 2. `supabase/functions/meta-oauth-callback/index.ts` - Manter flow do Instagram via Facebook Pages

O backend ja tem a logica correta para Instagram quando vem pelo Facebook OAuth:
- Troca code por token (mesmo endpoint do Facebook)
- Busca `me/accounts` com `instagram_business_account`
- Detecta a conta IG vinculada a pagina
- Salva conexao

O handler `handleInstagramBusiness` (que usa `api.instagram.com`) deve ser removido ou mantido apenas como fallback, pois nao se aplica ao fluxo atual. O flow principal do Facebook OAuth ja trata `type === "instagram"` corretamente (linhas que buscam `instagram_business_account` das pages).

Remover o early return para `type === "instagram"` que desvia para `handleInstagramBusiness`, deixando o fluxo principal tratar o Instagram igual ao Facebook.

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Remover endpoint separado do Instagram; usar mesmo dialog do Facebook; adicionar `pages_show_list` aos scopes do Instagram |
| `supabase/functions/meta-oauth-callback/index.ts` | Remover early return para `handleInstagramBusiness`; deixar fluxo principal (via Facebook Pages) tratar Instagram |

Deploy: `meta-oauth-callback`

## Resultado esperado

1. Usuario clica "Conectar" no card do Instagram
2. Popup abre no **facebook.com/dialog/oauth** (mesmo do Facebook)
3. Usuario escolhe a pagina do Facebook que tem Instagram vinculado
4. Backend detecta a conta Instagram Professional da pagina
5. Salva conexao, popup fecha, card mostra "Conectado"

Esse e o mesmo fluxo que funcionava antes e que e filmavel para o App Review.
