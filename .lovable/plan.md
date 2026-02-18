

# Corrigir Recebimento de Mensagens do Instagram

## Problema

Mensagens enviadas para o Instagram da FMO (@fmoadvbr) nao chegam ao sistema, apesar da conexao mostrar "Conectado". O webhook funciona corretamente para outras contas (MiauChat), mas zero eventos chegam para a conta da FMO.

## Causa Raiz

Bug no arquivo `supabase/functions/meta-oauth-callback/index.ts`, linha 150:

A variavel `GRAPH_API_BASE_LOCAL` e definida dentro do bloco `if (!igBizId)` (linha 92), mas e usada fora dele na linha 150 para fazer a inscricao no webhook (`subscribed_apps`). Quando o frontend envia o `igAccountId` (que e o caso no fluxo do page picker), o bloco condicional e pulado, `GRAPH_API_BASE_LOCAL` fica `undefined`, e a chamada `subscribed_apps` falha silenciosamente dentro do `try/catch` vazio.

Resultado: a pagina nunca e inscrita para receber eventos de webhook, e mensagens do Instagram nunca chegam.

## Solucao

### Arquivo: `supabase/functions/meta-oauth-callback/index.ts`

1. **Usar a constante global `GRAPH_API_BASE`** (ja definida na linha 6) em vez de `GRAPH_API_BASE_LOCAL` na chamada do `subscribed_apps` (linha 150)

2. **Adicionar log do resultado** da inscricao para diagnostico futuro, removendo o `catch {}` vazio

### Codigo corrigido (linhas 148-158):

```typescript
// Subscribe page to webhooks for Instagram messaging
try {
  const subRes = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: "messages,messaging_postbacks,messaging_optins",
      access_token: pageAccessToken,
    }),
  });
  const subData = await subRes.json();
  console.log("[meta-oauth] Instagram webhook subscription result:", JSON.stringify(subData));
} catch (subErr) {
  console.error("[meta-oauth] Instagram webhook subscription error:", subErr);
}
```

### Acao adicional apos deploy

Apos o deploy, sera necessario **reconectar o Instagram da FMO** (desconectar e conectar novamente) para que a inscricao do webhook seja executada com a correcao. Alternativamente, podemos adicionar uma acao "resubscribe" para evitar a reconexao.

## Arquivos Alterados

1. `supabase/functions/meta-oauth-callback/index.ts` - corrigir referencia a variavel e adicionar logs

## Impacto

- Corrige o bug que impede a inscricao de webhook para novas conexoes Instagram
- Nao afeta conexoes existentes que ja funcionam
- Baixo risco: apenas corrige uma referencia de variavel incorreta
