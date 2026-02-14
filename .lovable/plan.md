
# Corrigir "Invalid platform app" no Instagram OAuth

## Problema identificado

Analisando as imagens e o erro:

1. No Meta Dashboard, a URI de redirecionamento cadastrada para Instagram Business Login e: `https://miauchat.com.br/`
2. Voce esta acessando o app pela URL de preview: `chatfmoteste.lovable.app`
3. O codigo envia `redirect_uri=https://chatfmoteste.lovable.app/auth/meta-callback`
4. Essa URI NAO esta registrada no Meta -> erro "Invalid platform app"

O Instagram exige que a `redirect_uri` enviada na requisicao seja EXATAMENTE igual a uma das URIs cadastradas no dashboard.

## Solucao (2 partes)

### Parte 1 - Codigo: Forcar redirect_uri fixa para Instagram

Alterar `getFixedRedirectUri()` em `src/lib/meta-config.ts` para SEMPRE usar `https://miauchat.com.br/auth/meta-callback` para o fluxo Instagram, independente de qual dominio o usuario esta acessando. O popup do OAuth vai abrir no dominio correto e o `postMessage` funciona cross-origin.

```text
ANTES:
  Se esta em chatfmoteste.lovable.app -> retorna chatfmoteste.lovable.app/auth/meta-callback
  Se esta em miauchat.com.br -> retorna miauchat.com.br/auth/meta-callback

DEPOIS:
  Sempre retorna https://miauchat.com.br/auth/meta-callback (para Instagram)
  Para Facebook, mantem o comportamento atual
```

Isso garante que a redirect_uri SEMPRE bate com o que esta no Meta.

### Parte 2 - Meta Dashboard: Atualizar a URI

Voce precisa alterar a URI no campo "URIs de redirecionamento do OAuth" nas configuracoes do login da empresa:

**Trocar** `https://miauchat.com.br/` **por** `https://miauchat.com.br/auth/meta-callback`

Esta e a unica alteracao manual necessaria. Sem isso, o Instagram rejeita a requisicao porque a URI nao bate.

## Alteracoes no codigo

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Criar funcao `getInstagramRedirectUri()` que sempre retorna `https://miauchat.com.br/auth/meta-callback`, e usar no `buildMetaOAuthUrl` para Instagram |
| `src/pages/MetaAuthCallback.tsx` | Usar a mesma URI fixa ao enviar para o backend |

## Resumo da alteracao no Meta Dashboard

Na modal "Configuracoes do login da empresa" que aparece no seu screenshot:
1. Remover `https://miauchat.com.br/`
2. Adicionar `https://miauchat.com.br/auth/meta-callback`
3. Salvar
