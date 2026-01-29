
# Plano: Contabilização e Cobrança de Adicionais

## Problema Identificado

Quando um Global Admin aprova uma solicitação de adicionais:
1. ✅ A tabela `companies` é atualizada (`max_users`, `max_instances`, `use_custom_limits`)
2. ✅ O cálculo de `calculateAdditionalCosts` já funciona corretamente
3. ✅ O cliente vê o novo valor em "Meu Plano" (Resumo Mensal)
4. ✅ O admin vê o valor correto em `CompanyUsageTable`
5. ❌ **O ASAAS NÃO É ATUALIZADO** - A próxima cobrança continua com o valor antigo

## Solução Proposta

### Parte 1: Atualizar Subscription no ASAAS Após Aprovação

Modificar a função `approve_addon_request` para chamar uma Edge Function que:
1. Calcula o novo valor total (plano base + adicionais)
2. Atualiza a subscription existente no ASAAS com o novo valor
3. Registra a alteração em `company_subscriptions`

#### Nova Edge Function: `update-asaas-subscription`
```typescript
// Recebe: company_id, new_value
// 1. Busca asaas_subscription_id da tabela company_subscriptions
// 2. Chama ASAAS API PUT /subscriptions/{id} com o novo valor
// 3. Registra em audit_logs
```

#### Fluxo Técnico
```text
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ Admin clica Aprovar │ →  │ approve_addon_request│ →  │ Atualiza companies  │
│ em AddonRequests    │    │ (RPC existente)      │    │ max_users/instances │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                      │
                                      ▼
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ Cliente recebe      │ ←  │ update-asaas-        │ ←  │ Frontend chama EF   │
│ cobrança atualizada │    │ subscription (EF)    │    │ após aprovar        │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

### Parte 2: Exibir Histórico de Adicionais Aprovados

#### No Global Admin (`CompanyUsageTable` / Details Panel)
- Exibir breakdown dos adicionais aprovados:
  - Usuários extras: X
  - Conexões extras: X
  - Valor adicional: R$ X

#### Na aba "Meu Plano" do Cliente
- Já exibe corretamente (verificado no código)
- Garantir que "Histórico de Solicitações" mostra status aprovado

### Parte 3: Feedback Visual Após Aprovação

Modificar `AddonRequestsSection`:
1. Após aprovar, mostrar toast com o novo valor total
2. Exibir confirmação de que ASAAS foi atualizado

---

## Detalhes Técnicos

### Arquivos a Criar
| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/update-asaas-subscription/index.ts` | Atualiza valor da subscription no ASAAS |

### Arquivos a Modificar
| Arquivo | Modificação |
|---------|-------------|
| `src/hooks/useAddonRequests.tsx` | Chamar Edge Function após aprovar |
| `src/components/global-admin/AddonRequestsSection.tsx` | Feedback visual melhorado |
| `src/components/global-admin/CompanyUsageTable.tsx` | Exibir breakdown de adicionais no painel de detalhes |

### API ASAAS para Atualizar Subscription
```http
PUT /v3/subscriptions/{subscription_id}
Content-Type: application/json

{
  "value": 624.70,  // Novo valor = plano + adicionais
  "updatePendingPayments": true
}
```

### Cálculo do Novo Valor
```typescript
// Usa a função existente calculateAdditionalCosts
const planLimits = { max_users: 5, max_instances: 2, ... }
const effectiveLimits = { max_users: 7, max_instances: 3, use_custom_limits: true, ... }
const basePlanPrice = 497

const { totalMonthly } = calculateAdditionalCosts(planLimits, effectiveLimits, basePlanPrice)
// totalMonthly = 497 + (2 * 47.90) + (1 * 79.90) = 672.70
```

---

## Benefícios

1. **Cobrança Automática Atualizada**: O ASAAS cobra o valor correto automaticamente
2. **Transparência**: Admin e cliente veem exatamente o que está sendo cobrado
3. **Rastreabilidade**: Histórico completo de aprovações e alterações
4. **Consistência**: O valor exibido no sistema é o mesmo cobrado

## Considerações Importantes

1. **Subscriptions Inativas**: Se a empresa não tem subscription ativa no ASAAS, mostrar aviso ao admin
2. **Rollback**: Se a atualização no ASAAS falhar, fazer rollback dos limites aprovados
3. **Próxima Cobrança**: O ASAAS aplica o novo valor na próxima fatura automática
