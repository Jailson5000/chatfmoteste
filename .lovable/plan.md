

# Corrigir Nome e Foto de Contatos do Instagram

## Problema

Quando um contato novo envia mensagem pelo Instagram, o sistema nao consegue buscar o nome real nem a foto de perfil. O contato aparece como "INSTAGRAM 5644" com o ID numerico em vez do nome e avatar.

Os logs do backend mostram o erro:

```
Profile fetch failed with fields: name,profile_pic - retrying with name only
Profile fallback also failed: 400 "Any of the pages_read_engagement, pages_manage_metadata,
pages_read_user_content, pages_manage_ads, pages_show_list or
pages_messaging permission(s) must be granted"
```

## Causa

Os escopos OAuth do Instagram nao incluem `pages_messaging`, que e uma das permissoes exigidas pela Graph API da Meta para buscar perfis de usuarios via Instagram Messaging API. O escopo atual `pages_show_list` nao e suficiente para esse tipo de chamada.

## Solucao

### 1. Adicionar `pages_messaging` aos escopos do Instagram

**Arquivo:** `src/lib/meta-config.ts`

Alterar os escopos de Instagram de:
```
pages_show_list,instagram_basic,instagram_manage_messages
```
Para:
```
pages_show_list,pages_messaging,instagram_basic,instagram_manage_messages
```

O escopo `pages_messaging` permite ao token de pagina buscar perfis de usuarios que interagem via mensagens, incluindo nome e foto.

### 2. Reconectar o Instagram

Apos a alteracao de escopo, sera necessario **desconectar e reconectar** o Instagram na aba de Integracoes (Configuracoes). Isso e necessario porque o token existente foi obtido sem o escopo `pages_messaging` e nao pode ser atualizado retroativamente.

## Impacto

- 1 linha alterada em 1 arquivo (`meta-config.ts`)
- O backend (webhook) ja tem a logica correta para buscar nome e foto -- so precisa de um token com as permissoes certas
- Apos reconectar, novos contatos terao nome e foto preenchidos automaticamente

## Risco

Baixo. Apenas adiciona um escopo extra ao fluxo OAuth. Nao altera nenhuma logica de backend.

