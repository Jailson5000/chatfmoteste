
# Corrigir timestamp do uazapi-webhook

## Problema

Os logs mostram o erro:
```
time zone displacement out of range: "+058119-04-30T10:50:00.000Z"
```

O uazapi envia `messageTimestamp` em **milissegundos** (ex: `1771901609000`), mas o codigo assume que e em **segundos** (como a Evolution API) e multiplica por 1000, gerando uma data no ano 58119.

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts` (linha 360-362)

Detectar automaticamente se o timestamp esta em segundos ou milissegundos. Timestamps em segundos tem ~10 digitos; em milissegundos, ~13 digitos.

**Antes:**
```typescript
const timestamp = msg.messageTimestamp 
  ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
  : new Date().toISOString();
```

**Depois:**
```typescript
const rawTs = Number(msg.messageTimestamp);
let timestamp: string;
if (!msg.messageTimestamp || isNaN(rawTs) || rawTs <= 0) {
  timestamp = new Date().toISOString();
} else if (rawTs > 1e12) {
  // Already in milliseconds
  timestamp = new Date(rawTs).toISOString();
} else {
  // In seconds, convert to ms
  timestamp = new Date(rawTs * 1000).toISOString();
}
```

Isso cobre ambos os formatos de forma segura. Valores acima de `1e12` (1 trilhao) sao claramente milissegundos; abaixo disso, sao segundos.

## Resultado

As mensagens recebidas via uazapi terao timestamps validos, permitindo que conversas e mensagens sejam criadas corretamente no banco de dados.

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Corrigir parsing de timestamp para suportar ms e s |
