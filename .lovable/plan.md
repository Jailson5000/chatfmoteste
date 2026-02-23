
# Corrigir extracao de QR Code da resposta do /instance/create

## Diagnostico

Os logs mostram claramente o problema:

```
Level 3 - Create response keys: instance,hash,webhook,websocket,rabbitmq,nats,sqs,settings,qrcode
```

O campo `qrcode` EXISTE na resposta, mas a extracao falha porque `qrcode.base64` retorna `undefined`. A estrutura real do objeto `qrcode` na v2.3.3 e diferente do esperado - mas o codigo nunca loga o conteudo real desse campo, entao nao sabemos a estrutura exata.

Alem disso, o `/instance/connect/{name}` continua retornando `{"count":0}`, confirmando que esse endpoint nao funciona de forma confiavel na v2.3.3.

## Solucao em 2 partes

### 1. Adicionar debug log do campo qrcode

Em TODOS os pontos que fazem `/instance/create`, logar `JSON.stringify(recreateData.qrcode).slice(0, 500)` para ver a estrutura real.

### 2. Expandir a funcao de extracao para cobrir todas as estruturas possiveis

Criar uma funcao `extractQrFromCreateResponse(data)` que tenta todas as combinacoes possiveis:

```text
data.qrcode.base64
data.qrcode.qrcode          (qrcode aninhado)
data.qrcode (se for string)
data.base64
data.code
data.qrcode.code             (texto do QR, nao imagem)
```

E aplica-la em 5 pontos do codigo:
- `create_instance` (linha 662)
- `get_qrcode` 404-recreate (linha 805)
- Level 3 recovery (linha 1371)
- `global_create_instance` (linha 3885)
- `global_recreate_instance` (linha 3990)

## Detalhes tecnicos

### Arquivo: `supabase/functions/evolution-api/index.ts`

1. **Nova funcao helper** (adicionar perto da linha 1188, junto ao `extractQrFromResponse` existente):

```typescript
function extractQrFromCreateResponse(data: any): string | null {
  // Try qrcode.base64 (expected format)
  if (data?.qrcode?.base64) return data.qrcode.base64;
  // Try qrcode.qrcode (nested)
  if (typeof data?.qrcode?.qrcode === "string" && data.qrcode.qrcode.length > 10) return data.qrcode.qrcode;
  // Try qrcode as string
  if (typeof data?.qrcode === "string" && data.qrcode.length > 10) return data.qrcode;
  // Try top-level base64
  if (data?.base64) return data.base64;
  // Try top-level code
  if (typeof data?.code === "string" && data.code.length > 10) return data.code;
  // Try qrcode.code (text QR value - can be used to generate image)
  if (typeof data?.qrcode?.code === "string" && data.qrcode.code.length > 10) return data.qrcode.code;
  return null;
}
```

2. **Debug logs** em cada ponto de criacao: logar o campo `qrcode` completo para diagnosticar a estrutura exata

3. **Substituir** todas as 5 instancias de extracao manual por chamadas a `extractQrFromCreateResponse(createData)`

### Escopo

- 1 arquivo modificado: `supabase/functions/evolution-api/index.ts`
- 1 nova funcao helper (~12 linhas)
- 5 blocos de extracao substituidos
- 5 debug logs adicionados
- Deploy automatico da edge function
