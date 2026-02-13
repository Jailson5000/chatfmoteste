

# Corrigir permissoes OAuth do Instagram (API antiga vs nova)

## Problema raiz

O codigo atual solicita os scopes **antigos** da API do Instagram no OAuth:
- `instagram_basic`
- `instagram_manage_messages`

Porem, o app no Meta Developers esta configurado com a **nova API Instagram Business**, que exige:
- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments` (opcional, para comentarios)

Resultado: o token OAuth nao recebe as permissoes corretas para enviar/receber mensagens.

Alem disso, o backend (`meta-oauth-callback`) usa Graph API **v21.0** enquanto o frontend usa **v22.0** -- isso pode causar inconsistencias.

## Alteracoes

### 1. `src/lib/meta-config.ts` - Atualizar scopes do Instagram

```
ANTES:
instagram: "instagram_basic,instagram_manage_messages,pages_show_list"

DEPOIS:
instagram: "instagram_business_basic,instagram_business_manage_messages,pages_show_list"
```

Isso faz com que o popup OAuth solicite as permissoes corretas da nova API.

### 2. `supabase/functions/meta-oauth-callback/index.ts` - Alinhar versao da API

Linha 5: Mudar de `v21.0` para `v22.0` para consistencia com o resto do sistema.

### 3. `src/pages/admin/MetaTestPage.tsx` - Corrigir testes de permissoes

Os testes do Messenger (linhas 196-201) ainda referenciam `instagram_basic` e `instagram_manage_messages`. Atualizar para os nomes corretos das novas permissoes para que os testes reflitam o que o app realmente usa.

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Trocar scopes antigos por `instagram_business_basic` + `instagram_business_manage_messages` |
| `supabase/functions/meta-oauth-callback/index.ts` | Atualizar Graph API de v21.0 para v22.0 |
| `src/pages/admin/MetaTestPage.tsx` | Atualizar nomes das permissoes nos testes |

**Importante**: Apos a correcao, sera necessario **reconectar o Instagram** (desconectar e conectar novamente) para que o novo token seja gerado com as permissoes corretas.
