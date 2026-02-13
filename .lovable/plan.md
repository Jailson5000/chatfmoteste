
# Corrigir envio de mensagens e erro no meta-test

## Problema 1: Mensagens nao chegam no WhatsApp (CRITICO)

**Causa raiz**: O numero de teste da Meta (`15551590933`) e um numero dos **Estados Unidos**. A Meta bloqueia esse numero de enviar mensagens para numeros do Brasil.

Todos os logs confirmam o mesmo erro:
```
code: 130497
"Business account is restricted from messaging users in this country."
```

O sistema envia corretamente para a API da Meta (recebe 200 + message ID), mas a Meta **rejeita a entrega** de forma assincrona.

**Solucao**: Voce precisa registrar um **numero brasileiro real** no Meta Business. O numero de teste americano serve apenas para demonstracao basica, nao para enviar mensagens a numeros brasileiros. Enquanto isso, para o App Review, voce pode:

1. Usar o numero de teste para enviar mensagens a um numero americano (se tiver um disponivel)
2. OU conectar seu numero brasileiro real via WhatsApp Cloud API no Meta Business Manager

**Nenhuma alteracao de codigo resolve esse problema** - e uma restricao da plataforma Meta.

---

## Problema 2: Erro `business_management` no meta-test

**Causa**: O token temporario gerado na pagina "API Setup" do WhatsApp geralmente nao inclui a permissao `business_management`. Essa permissao requer um token do tipo System User ou um token gerado via OAuth com escopo especifico.

**Solucao no codigo**: Alterar o `test_api` handler para retornar o body do erro da Graph API com status 200 (para o frontend exibir o erro em vez de mostrar "Edge Function returned a non-2xx status code").

**Arquivo:** `supabase/functions/meta-api/index.ts` (linha 477-479)

Mudar:
```typescript
return new Response(JSON.stringify(graphData), {
  status: graphRes.ok ? 200 : 502,
```
Para:
```typescript
return new Response(JSON.stringify(graphData), {
  status: 200, // Always 200 so frontend can display the error details
```

---

## Problema 3: Bug `msgContent is not defined`

**Causa**: Na ultima edicao, a variavel `msgContent` foi removida acidentalmente mas ainda e referenciada na linha 399.

**Arquivo:** `supabase/functions/meta-api/index.ts` (linha 399)

Substituir:
```typescript
content: msgContent,
```
Por:
```typescript
content: useTemplate
  ? `[template: ${templateName || "hello_world"}]`
  : (message || "Mensagem de teste do MiauChat"),
```

---

## Resumo

| Problema | Tipo | Solucao |
|----------|------|---------|
| Mensagens nao chegam | Restricao Meta | Registrar numero brasileiro real no Meta Business |
| `business_management` erro | Token sem permissao | Retornar status 200 com detalhes do erro |
| `msgContent` undefined | Bug de codigo | Restaurar definicao da variavel |

## Deploy

Deployar `meta-api` com as correcoes dos problemas 2 e 3.
