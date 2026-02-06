

# Plano: Corrigir Agendamento pela IA (Constraint de Source)

## Problema Identificado

A IA está tentando criar agendamentos mas está falhando com o seguinte erro nos logs:

```
new row for relation "agenda_pro_appointments" violates check constraint 
"agenda_pro_appointments_source_check"
```

### Causa Raiz
O código em `supabase/functions/ai-chat/index.ts` linha 1380 está inserindo:
```typescript
source: "ai_chat"
```

Mas o constraint da tabela `agenda_pro_appointments` só aceita estes valores:
```sql
CHECK ((source = ANY (ARRAY['manual', 'public_booking', 'whatsapp', 'phone', 'api', 'online'])))
```

O valor `ai_chat` **não está na lista permitida**, causando a falha de inserção.

---

## Solução

Alterar o valor de `source` de `"ai_chat"` para `"api"`, que é um valor válido e semanticamente correto para agendamentos feitos via API/IA.

### Arquivo: `supabase/functions/ai-chat/index.ts`

**Linha 1380 - Alteração:**
```typescript
// ANTES:
source: "ai_chat",

// DEPOIS:
source: "api",
```

---

## Detalhes Técnicos

| Item | Antes | Depois |
|------|-------|--------|
| Valor do source | `ai_chat` | `api` |
| Constraint válido | Não | Sim |
| Inserção funciona | Não | Sim |

O valor `api` é apropriado porque:
- Representa agendamentos feitos programaticamente
- Está na lista de valores permitidos pelo constraint
- Diferencia de `manual` (feito por humano na interface)
- Diferencia de `public_booking` (feito pelo cliente no link público)

---

## Resumo das Alterações

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `supabase/functions/ai-chat/index.ts` | 1380 | Alterar `source: "ai_chat"` para `source: "api"` |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| IA tenta criar agendamento | Erro de constraint | Agendamento criado com sucesso |
| Cliente recebe confirmação | Não | Sim |
| Profissional vê no sistema | Não | Sim |

---

## Risco de Quebra

**Muito Baixo**
- Alteração de uma única linha
- Valor `api` já é usado em outros contextos
- Não afeta lógica de negócio, apenas o campo de identificação da origem
- Outros fluxos de agendamento (manual, público) não são afetados

