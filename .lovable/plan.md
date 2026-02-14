
# Corrigir Facebook e Instagram OAuth

## Problema 1: Facebook conecta mas aparece desconectado

**Causa raiz**: O backend salva a conexao do Facebook SEM o campo `source: "oauth"`. O valor padrao da coluna e `"manual_test"`. O frontend filtra conexoes com `.eq("source", "oauth")`, entao nunca encontra a conexao salva.

**Evidencia**: A consulta ao banco mostra a conexao Facebook com `source: "manual_test"` apesar de ter vindo do fluxo OAuth.

**Correcao**: Adicionar `source: "oauth"` no upsert do Facebook na edge function `meta-oauth-callback`.

## Problema 2: Instagram erro de redirect_uri

**Causa raiz**: O erro "Error validating verification code" do Instagram pode significar:
- redirect_uri diferente (ja verificamos que e identico)
- App Secret incorreto (Instagram retorna erro enganoso de redirect_uri quando o secret esta errado)
- Codigo ja expirado ou usado

O `META_INSTAGRAM_APP_SECRET` no backend usa fallback para `META_APP_SECRET` (o secret do Facebook). Se o Instagram App tem um secret diferente do Facebook App, a troca do token vai falhar com esse erro enganoso.

**Correcao**: Adicionar log do `appSecret` (primeiros 4 caracteres) para confirmar qual secret esta sendo usado, e logar se esta usando o fallback ou um secret dedicado.

## Alteracoes tecnicas

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/meta-oauth-callback/index.ts` | 1. Adicionar `source: "oauth"` no upsert do Facebook (linha ~222). 2. Logar se `META_INSTAGRAM_APP_SECRET` esta configurado ou se esta usando fallback do `META_APP_SECRET`. 3. Logar primeiros 4 chars do secret usado para diagnostico |

## Correcao do registro existente

Alem da correcao no codigo, a conexao Facebook ja salva no banco (id: `04857f90-...`) precisa ter o `source` atualizado de `"manual_test"` para `"oauth"` via migracao SQL.

Deploy: `meta-oauth-callback`
