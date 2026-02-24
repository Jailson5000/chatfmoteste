

# Corrigir deteccao de status "connected" para uazapi

## Problema Raiz (confirmado pelos logs)

A API uazapi retorna o status de conexao em um formato diferente do esperado pelo codigo. Os logs mostram claramente:

```text
raw: {
  "connected": true,           // <-- campo booleano no topo
  "instance": {
    "status": "connected",     // <-- status dentro de "instance"
    "qrcode": "",              // <-- vazio porque ja conectou
    ...
  }
}
```

Mas o `connect()` procura `data.status` e `data.state` no nivel raiz, que nao existem. Resultado: `state = "unknown"` e entao `status = "awaiting_qr"` -- **errado**.

O backend retorna `{ status: "awaiting_qr" }` para o frontend, que nunca detecta a conexao e fica preso no dialog.

## Solucao

### Arquivo: `supabase/functions/_shared/whatsapp-provider.ts`

No metodo `connect()` do UazapiProvider (~linha 626), expandir a extracao de estado para incluir os campos reais que uazapi retorna:

**Antes:**
```typescript
const state = data?.status || data?.state || "unknown";
```

**Depois:**
```typescript
const state = data?.instance?.status || data?.status || data?.state || 
              (data?.connected === true ? "connected" : "unknown");
```

Isso garante que:
1. `data.instance.status` ("connected") e verificado primeiro
2. `data.connected` (boolean true) serve como fallback final
3. A logica existente para Evolution API nao e afetada

### Arquivo: `supabase/functions/evolution-api/index.ts`

No case `get_qrcode` para uazapi (~linha 885), adicionar a mesma verificacao do campo `connected`:

**Antes:**
```typescript
const uazapiStatus = result.status === 'connected' ? 'connected' : (result.qrCode ? 'awaiting_qr' : 'disconnected');
```

**Depois:**
```typescript
const uazapiStatus = (result.status === 'connected' || result.raw?.connected === true || result.raw?.instance?.status === 'connected') 
  ? 'connected' 
  : (result.qrCode ? 'awaiting_qr' : 'disconnected');
```

Isso adiciona uma segunda camada de seguranca: mesmo que o `connect()` falhe na extracao, o `get_qrcode` handler verifica os dados brutos.

## Resultado Esperado

Quando a instancia uazapi esta conectada, o backend retornara `{ status: "connected" }`. O frontend detectara isso e:
1. Mostrara "Conectado!" por 1 segundo
2. Fechara o dialog automaticamente
3. Atualizara a lista de instancias

## Arquivos Alterados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/_shared/whatsapp-provider.ts` | Expandir extracao de estado no `connect()` para cobrir `data.instance.status` e `data.connected` |
| `supabase/functions/evolution-api/index.ts` | Adicionar fallback no `get_qrcode` verificando `result.raw` |

