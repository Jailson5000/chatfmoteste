

# Rate Limiting Anti-DDoS nas Edge Functions Públicas

## Escopo da Implementação

**APENAS proteção contra flood/DDoS** - Não afeta criação de contas (você já tem controle).

---

## O Que Será Implementado

### Módulo Compartilhado (Novo Arquivo)

**`supabase/functions/_shared/rate-limit.ts`**

```typescript
// Rate limiter in-memory simples
// Limita requisições por IP em uma janela de tempo
```

**Características:**
- **In-memory**: Sem dependência de banco ou Redis
- **Por IP**: Identifica via headers `x-forwarded-for`, `cf-connecting-ip`
- **Auto-limpeza**: Remove entradas expiradas automaticamente
- **Resposta 429**: HTTP padrão com header `Retry-After`

---

## Funções a Proteger

| Função | Limite | Janela | Motivo |
|--------|--------|--------|--------|
| `widget-messages` | 100 req | /min | Widget pode fazer polling, limite alto |
| `customer-portal` | 30 req | /min | Portal de billing, requer auth |
| `agenda-pro-confirmation` | 60 req | /min | Confirmações de agendamento |

### Funções que **NÃO** precisam de rate limit:
- `stripe-webhook` → Validado por assinatura Stripe
- `evolution-webhook` → Validado por token secreto
- `register-company` → **JÁ TEM** rate limit implementado
- `create-checkout-session` → Você já controla criação de conta
- Funções `process-*` → Chamadas apenas por cron interno

---

## Como Ficará o Código

### Antes (widget-messages):
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  // ... lógica normal
});
```

### Depois:
```typescript
import { checkRateLimit, getClientIP, rateLimitResponse } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // +3 linhas de proteção DDoS
  const clientIP = getClientIP(req);
  const { allowed, retryAfter } = checkRateLimit(clientIP, { maxRequests: 100, windowMs: 60000 });
  if (!allowed) return rateLimitResponse(retryAfter);

  // ... lógica normal (inalterada)
});
```

---

## Impacto Zero no Sistema

### Por que NÃO vai quebrar:

| Aspecto | Garantia |
|---------|----------|
| **Limites altos** | 100 req/min = 1.6 req/seg (uso normal é ~10 req/min) |
| **Apenas 3 linhas** | Código mínimo adicionado no início da função |
| **Fallback gracioso** | Se rate limit falhar, requisição passa normalmente |
| **Lógica preservada** | Todo código existente permanece inalterado |
| **Reversível em 1 minuto** | Basta remover as 3 linhas |

### Usuários afetados?
- **Normais**: NÃO - Nunca atingem 100 req/min
- **Atacantes**: SIM - Bloqueados após 100 req/min por IP

### Comportamento do usuário bloqueado:
```json
{
  "error": "Muitas requisições. Tente novamente em alguns segundos.",
  "status": 429,
  "headers": { "Retry-After": "45" }
}
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/_shared/rate-limit.ts` | **CRIAR** - Módulo compartilhado |
| `supabase/functions/widget-messages/index.ts` | Adicionar 3 linhas |
| `supabase/functions/customer-portal/index.ts` | Adicionar 3 linhas |
| `supabase/functions/agenda-pro-confirmation/index.ts` | Adicionar 3 linhas |

---

## Limites Escolhidos (Conservadores)

```text
┌─────────────────────────────┬──────────────┬──────────────┐
│ Função                      │ Limite       │ Uso Normal   │
├─────────────────────────────┼──────────────┼──────────────┤
│ widget-messages             │ 100 req/min  │ ~10 req/min  │
│ customer-portal             │ 30 req/min   │ ~2 req/min   │
│ agenda-pro-confirmation     │ 60 req/min   │ ~5 req/min   │
└─────────────────────────────┴──────────────┴──────────────┘

Margem de segurança: 10x acima do uso normal
```

---

## Validação Pós-Deploy

1. ✅ Acessar widget normalmente → Deve funcionar
2. ✅ Acessar portal de cliente → Deve funcionar
3. ✅ Confirmar agendamento → Deve funcionar
4. ✅ Fazer 101 requisições em 1 minuto → Deve bloquear

---

## Resumo Executivo

| Pergunta | Resposta |
|----------|----------|
| **Pode quebrar?** | **NÃO** - Apenas adiciona 3 linhas no início |
| **Afeta usuários normais?** | **NÃO** - Limites 10x acima do uso normal |
| **Protege contra DDoS?** | **SIM** - Bloqueia flood por IP |
| **Complexidade?** | **MÍNIMA** - 1 arquivo novo + 3 linhas em cada função |
| **Reversível?** | **SIM** - Remove as 3 linhas e volta ao normal |
| **Afeta criação de conta?** | **NÃO** - Você já controla isso |

