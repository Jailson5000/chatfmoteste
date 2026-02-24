

# Corrigir QR Code nao aparecendo para instancias uazapi

## Problema Encontrado

Quando o frontend faz polling via `get_qrcode`, o backend chama `provider.connect()` no uazapi, mas:

1. **Sem logs de debug**: O resultado do `connect()` nao e logado, entao nao sabemos o que a API retorna
2. **Possivel campo diferente**: O QR code pode vir em um campo que o `connect()` nao extrai (ex: `data.data.qrcode`, `data.image`, etc.)
3. **Estado da instancia**: O DB mostra status `disconnected` apos criacao, o que indica que a etapa 2 (connect) da criacao tambem nao retornou QR code

## Diagnostico

Os logs mostram:
- `Step 1: init` -- OK (token obtido)
- `Step 2: connect` -- chamado, mas nao ha log do resultado
- `get_qrcode` -- chamado repetidamente (~10s intervalo), mas nenhum log de resultado

O polling funciona, mas o `connect()` retorna `qrCode: null` silenciosamente.

## Solucao

### 1. Adicionar logs de debug no connect e get_qrcode (diagnostico)

**Arquivo:** `supabase/functions/_shared/whatsapp-provider.ts`

No metodo `connect()` do UazapiProvider (linha ~597):
- Logar o body da resposta: `console.log("[UazapiProvider] connect response:", JSON.stringify(data).slice(0, 500))`
- Expandir a extracao do QR code para cobrir mais campos possiveis

No metodo `createInstance()` (linha ~775):
- Logar o body da resposta do Step 2: `console.log("[UazapiProvider] Step 2 response:", JSON.stringify(connectData).slice(0, 500))`

### 2. Adicionar logs no get_qrcode do evolution-api

**Arquivo:** `supabase/functions/evolution-api/index.ts`

No case `get_qrcode` para uazapi (linha ~878-891):
- Logar o resultado do connect: `console.log("[Evolution API] uazapi get_qrcode result:", JSON.stringify(result).slice(0, 500))`

### 3. Expandir extracao de QR code no connect()

**Arquivo:** `supabase/functions/_shared/whatsapp-provider.ts`

Atualizar a linha de extracao do QR code no `connect()` para cobrir mais formatos possiveis:

```
const qrCode = data?.qrcode || data?.base64 || data?.qr || 
               data?.data?.qrcode || data?.data?.base64 || 
               data?.image || data?.data?.image || null;
```

Mesma logica no `createInstance()` Step 2.

## Resumo das Alteracoes

| Arquivo | O que muda |
|---|---|
| `supabase/functions/_shared/whatsapp-provider.ts` | Adicionar logs de debug + expandir extracao de QR code nos metodos `connect()` e `createInstance()` |
| `supabase/functions/evolution-api/index.ts` | Adicionar log do resultado no `get_qrcode` para uazapi |

## Resultado Esperado

Com os logs adicionados, poderemos ver exatamente o que a API uazapi retorna e ajustar a extracao. A expansao dos campos de QR code deve resolver o problema caso o QR venha em um campo diferente do esperado.

