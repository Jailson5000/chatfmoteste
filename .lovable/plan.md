

# Corrigir erros de OAuth do Instagram e Facebook

## Diagnostico

Analisei os logs e o codigo em detalhe. Existem **2 problemas distintos**:

### Problema 1: Erro generico no frontend (afeta TODOS os canais)

O `MetaAuthCallback.tsx` trata erros assim:
```typescript
if (response.error) {
  throw new Error(response.error.message || "Falha ao processar autenticacao");
}
```

Quando o Supabase retorna non-2xx, `response.error.message` e sempre o texto generico **"Edge Function returned a non-2xx status code"**. O erro REAL esta dentro de `response.error.context` (um objeto Response que precisa ser lido com `.json()`). Isso explica porque voce ve a mesma mensagem generica tanto para Instagram quanto Facebook - o erro real esta sendo engolido.

### Problema 2: Instagram redirect_uri mismatch

Os logs confirmam que o `redirect_uri` enviado na troca do token e identico ao usado na URL de autorizacao (`https://miauchat.com.br/auth/meta-callback`). Mesmo assim, o Instagram rejeita.

Possiveis causas:
- O **Instagram App Secret** configurado no secret pode estar incorreto (o Instagram retorna erro enganoso de "redirect_uri" quando o secret e invalido)
- O codigo pode ter expirado entre a autorizacao e a troca (improvavel mas possivel)

## Solucao

### 1. Corrigir tratamento de erros no MetaAuthCallback

Extrair o erro real do `response.error.context` para que o toast mostre a mensagem util em vez do generico "non-2xx". Usar a funcao `getFunctionErrorMessage` que ja existe em `src/lib/supabaseFunctionError.ts`.

### 2. Melhorar logging no backend

Adicionar log do status HTTP e corpo da resposta do Instagram na troca de token para diagnosticar se o problema e realmente o redirect_uri ou o app secret.

### 3. Verificar META_INSTAGRAM_APP_SECRET

Apos o fix de erro, o toast mostrara a mensagem real do Instagram, permitindo diagnostico preciso.

## Alteracoes tecnicas

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/MetaAuthCallback.tsx` | Importar `getFunctionErrorMessage` e usa-la para extrair o erro real do `response.error.context` antes de mostrar no toast |
| `supabase/functions/meta-oauth-callback/index.ts` | Logar `tokenRes.status` e corpo da resposta do Instagram antes de checar erro, para diagnostico completo |

Deploy: `meta-oauth-callback`

## Resultado esperado

Apos essas mudancas:
1. O toast mostrara a mensagem de erro REAL (ex: "Error validating verification code..." ou "Invalid client_secret") em vez de "Edge Function returned a non-2xx status code"
2. Os logs mostrarao o status HTTP exato e corpo da resposta do Instagram
3. Poderemos identificar se o problema e o secret ou o redirect_uri
4. Se for o secret, sera necessario reconfigura-lo com o valor correto do Instagram App Dashboard

