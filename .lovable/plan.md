
## Correção: Sincronização Stripe falhando com "Invalid time value"

### Causa raiz

A função `sync-stripe-subscriptions` está retornando status 200 mas **todas as 7 assinaturas falham** com o erro `"Invalid time value"`.

O problema está nas linhas 79-80 do edge function:
```
const currentPeriodStart = new Date(stripeSub.current_period_start * 1000).toISOString();
const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
```

A versão da API do Stripe usada (`2025-08-27.basil`) retorna `current_period_start` e `current_period_end` como **timestamps Unix (números inteiros em segundos)**, mas dependendo da versão do SDK esm.sh, esses valores podem vir como strings ISO ou como números. Multiplicar uma string por 1000 gera `NaN`, e `new Date(NaN)` causa "Invalid time value".

### Solução

Alterar a conversão de datas para ser segura em ambos os formatos (Unix timestamp ou string ISO):

**Arquivo: `supabase/functions/sync-stripe-subscriptions/index.ts`**

Criar uma função auxiliar que detecta se o valor é número (Unix timestamp) ou string (ISO date):

```typescript
function toISODate(value: any): string {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  throw new Error(`Unexpected date format: ${typeof value} = ${value}`);
}
```

Substituir as linhas 79-80 por:
```typescript
const currentPeriodStart = toISODate(stripeSub.current_period_start);
const currentPeriodEnd = toISODate(stripeSub.current_period_end);
```

Adicionalmente, melhorar o toast no frontend (`GlobalAdminCompanies.tsx`) para mostrar os erros quando todas as sincronizações falham (hoje mostra "sucesso" mesmo com 7 falhas pois o status HTTP e 200).

### Impacto

- Corrige a sincronizacao para funcionar com qualquer formato de data retornado pelo Stripe
- Sem alteracao em banco de dados ou RLS
- Sem risco de quebrar outras funcionalidades
- Apos o fix, basta clicar "Sincronizar Stripe" novamente para popular as datas de vencimento
