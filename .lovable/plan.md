

# Correção: Sincronização Automática do Valor da Assinatura ASAAS ao Aprovar Adicionais

## Problema Identificado

Existe uma **desconexão** entre o "Resumo Mensal" calculado no frontend e as faturas reais no ASAAS:

| Local | Valor | Fonte |
|-------|-------|-------|
| Resumo Mensal (frontend) | R$ 1.756,80 | Calculado localmente (plano + adicionais) |
| Faturas ASAAS (modal) | R$ 1.697,00 | API do ASAAS (valor da assinatura) |

**Causa**: Quando os adicionais (+2 usuários) foram aprovados, a assinatura no ASAAS NÃO foi atualizada automaticamente para incluir o valor dos adicionais (R$ 59,80).

---

## Fluxo Atual (COM PROBLEMA)

```text
Admin Global aprova addon request
        ↓
Função approve_addon_request() (SQL)
        ↓
Atualiza max_users/max_instances na tabela companies
        ↓
✗ NÃO atualiza valor no ASAAS!
        ↓
Faturas continuam com valor antigo
```

---

## Solução

### Opção A: Correção Manual Imediata (Este Caso Específico)

O Admin Global pode acessar o painel Global Admin > Empresas > FMO ADV e clicar em "Sincronizar Cobrança" para atualizar o valor da assinatura no ASAAS para R$ 1.756,80.

### Opção B: Correção Sistêmica (Recomendada)

Modificar o fluxo de aprovação de adicionais para:

1. **Alterar a edge function `invite-team-member` ou criar nova edge function `approve-addon`** que:
   - Aprova o addon request no banco
   - Calcula o novo valor total (plano + adicionais)
   - Chama `update-asaas-subscription` automaticamente

2. **Ou modificar a função SQL `approve_addon_request`** para registrar que a sincronização ASAAS é necessária, e criar um job que processa essas atualizações pendentes.

---

## Alterações Técnicas Propostas

### 1. Nova Edge Function `approve-addon-request`

Substituir a chamada direta à função SQL por uma edge function que:

```typescript
// 1. Aprovar no banco (via RPC)
await supabase.rpc('approve_addon_request', { _request_id: requestId });

// 2. Buscar empresa e calcular novo valor
const company = await getCompanyWithPlan(companyId);
const newValue = company.plan.price + calculateAdditionalCosts(...);

// 3. Atualizar assinatura no ASAAS
await supabase.functions.invoke('update-asaas-subscription', {
  body: { 
    company_id: companyId, 
    new_value: newValue,
    reason: 'Addon request approved' 
  }
});
```

### 2. Atualizar Frontend (GlobalAdminCompanies ou componente de addons)

Quando o Admin Global aprova um addon:

```typescript
// Em vez de chamar apenas o RPC
await supabase.rpc('approve_addon_request', { _request_id: requestId });

// Chamar a nova edge function que faz tudo
await supabase.functions.invoke('approve-addon-request', {
  body: { request_id: requestId }
});
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/approve-addon-request/index.ts` | **NOVO** - Edge function que aprova + sincroniza ASAAS |
| `src/hooks/useAddonRequests.tsx` | Chamar edge function em vez de RPC direto |
| `src/components/global-admin/AddonRequestsSection.tsx` | Atualizar handlers para usar nova edge function |

---

## Correção Imediata para FMO ADV

Para resolver o caso específico do cliente FMO ADV agora:

1. Acessar **Global Admin > Empresas**
2. Encontrar **FMO ADV**
3. Clicar em **Editar** ou **Sincronizar Cobrança**
4. O sistema chamará `update-asaas-subscription` com o valor correto (R$ 1.756,80)
5. Próximas faturas serão geradas com o valor correto

---

## Notas Importantes

1. **Faturas já geradas**: As faturas que já existem com R$ 1.697,00 NÃO serão alteradas automaticamente. O ASAAS permite definir `updatePendingPayments: true` na API, o que atualiza faturas pendentes.

2. **Recálculo automático**: O `update-asaas-subscription` já usa `updatePendingPayments: true`, então faturas PENDENTES serão atualizadas quando o valor for sincronizado.

3. **Consistência**: Após a correção, o valor das faturas pendentes passará de R$ 1.697,00 para R$ 1.756,80, ficando consistente com o Resumo Mensal.

