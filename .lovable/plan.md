
# Corrigir exibicao de erros no meta-test e guia para envio em ambiente de teste

## Problema: "[object Object]" em todos os testes

**Causa raiz**: No `callMetaApi` (linha 81 de `MetaTestPage.tsx`):
```typescript
if (data?.error) throw new Error(data.error);
```

A Meta retorna erros como objetos: `{error: {message: "...", type: "OAuthException", code: 190}}`. Quando se passa um objeto para `new Error()`, o JavaScript converte para `[object Object]`.

**Correcao no arquivo `src/pages/admin/MetaTestPage.tsx`** (linha 76-85):

Mudar o `callMetaApi` para tratar a resposta da Meta corretamente -- se a resposta contiver um campo `error`, mostrar os dados completos da resposta em vez de converter para string:

```typescript
const { data, error } = await supabase.functions.invoke("meta-api", {
  body: { action: "test_api", connectionId: connection.id, endpoint },
});
if (error) throw error;
if (data?.error) {
  // Meta Graph API retorna erros como objetos - exibir o JSON completo
  const errMsg = typeof data.error === 'object' 
    ? JSON.stringify(data.error, null, 2) 
    : String(data.error);
  setTestResult(key, { status: "error", error: errMsg });
  return;
}
setTestResult(key, { status: "success", data });
```

---

## Enviar mensagens em ambiente de teste (App Review)

Para gravar o video de demonstracao do App Review em modo de desenvolvimento, voce tem duas opcoes:

### Opcao A: Enviar para numero americano (rapido)
O numero de teste da Meta (`15551590933`) so pode enviar para numeros dos EUA. Se voce tiver acesso a um numero americano, adicione-o na lista de teste e envie normalmente.

### Opcao B: Registrar numero brasileiro real (recomendado)
1. No **Meta Business Manager**, va em **WhatsApp > Numeros de Telefone**
2. Adicione um numero brasileiro real (ex: seu proprio celular)
3. Complete a verificacao por SMS/ligacao
4. No meta-test, atualize o **Phone Number ID** e **WABA ID** com os valores do novo numero
5. Gere um novo token temporario para esse numero
6. Adicione o numero de destino na lista de teste em **WhatsApp > API Setup > To**

Com o numero brasileiro registrado, voce consegue enviar mensagens para qualquer numero brasileiro que esteja na lista de teste.

---

## Resumo das alteracoes de codigo

| Arquivo | O que muda |
|---------|------------|
| `src/pages/admin/MetaTestPage.tsx` (linha 76-85) | Tratar `data.error` como objeto, exibir JSON em vez de `[object Object]` |

Apenas 1 arquivo precisa ser editado. O problema de envio e uma configuracao no painel da Meta, nao no codigo.
