

# Plano: Sincronização de Limites com ASAAS ao Editar Empresa

## Problema Identificado

Quando você edita os limites de uma empresa em **Configurações > Empresas** (aba "Editar"), o sistema:

1. ✅ Atualiza os limites no banco de dados (`companies` table)
2. ❌ **NÃO** atualiza o valor da assinatura no ASAAS
3. ❌ **NÃO** atualiza a descrição da fatura no ASAAS

Isso causa:
- Descompasso entre o que está no sistema vs o que é cobrado
- Se você reduz limites, os "adicionais" desaparecem porque `limites - plano = 0 ou negativo`
- Cliente vê uma cobrança diferente do que o sistema mostra

## Como o Addon Request Funciona (Correto)

```text
┌──────────────────────────────────────────────────────────────────┐
│ FLUXO ADDON REQUEST (funciona corretamente)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Usuário solicita] → [Admin aprova] → [approve_addon_request]   │
│                                              │                   │
│                                              ▼                   │
│                                    ┌──────────────────────┐      │
│                                    │ 1. Atualiza BD       │      │
│                                    │ 2. Chama ASAAS API   │◄──── │ ✅
│                                    └──────────────────────┘      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Como Editar Empresa Funciona (Incorreto)

```text
┌──────────────────────────────────────────────────────────────────┐
│ FLUXO EDITAR EMPRESA (quebrado)                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Admin edita limites] → [handleUpdate] → [UPDATE companies]     │
│                                                                  │
│                            ⚠️ NÃO CHAMA ASAAS!                   │
│                                                                  │
│  Resultado: BD atualizado, ASAAS desatualizado                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Solução Proposta

### 1. Modificar `handleUpdate` em GlobalAdminCompanies.tsx

Após atualizar a empresa no banco, calcular o novo valor mensal e chamar `update-asaas-subscription`:

```typescript
const handleUpdate = async () => {
  if (!editingCompany) return;
  
  // 1. Buscar plano para calcular valor
  const selectedPlan = plans.find(p => p.id === formData.plan_id);
  
  // 2. Calcular novo valor mensal
  let newMonthlyValue = selectedPlan?.price || 0;
  if (formData.use_custom_limits && selectedPlan) {
    const additionalUsers = Math.max(0, formData.max_users - selectedPlan.max_users);
    const additionalInstances = Math.max(0, formData.max_instances - selectedPlan.max_instances);
    newMonthlyValue += (additionalUsers * 47.90) + (additionalInstances * 79.90);
  }
  
  // 3. Atualizar no banco
  await updateCompany.mutateAsync({ id: editingCompany, ...updateData });
  
  // 4. Sincronizar com ASAAS (se houve mudança de limites)
  if (formData.use_custom_limits || limitsChanged) {
    await supabase.functions.invoke('update-asaas-subscription', {
      body: {
        company_id: editingCompany,
        new_value: newMonthlyValue,
        reason: "Limites atualizados pelo admin"
      }
    });
  }
};
```

### 2. Adicionar Confirmação Visual

Antes de salvar, mostrar ao admin o impacto financeiro:
- Valor atual no ASAAS
- Novo valor calculado
- Diferença (aumento ou redução)

### 3. Melhorar a UX do CompanyLimitsEditor

Adicionar badge de alerta quando limites são reduzidos abaixo do plano base:

```text
⚠️ Limite abaixo do plano: max_users = 3, mas plano inclui 5
    Isso zera os adicionais e reduz a cobrança.
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Chamar `update-asaas-subscription` em `handleUpdate` |
| `src/components/global-admin/CompanyLimitsEditor.tsx` | Adicionar alerta quando limite < plano |
| `src/hooks/useCompanies.tsx` | Opcional: mover lógica ASAAS para hook |

## Fluxo Corrigido

```text
┌──────────────────────────────────────────────────────────────────┐
│ FLUXO EDITAR EMPRESA (corrigido)                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Admin edita limites] → [handleUpdate]                          │
│                               │                                  │
│                               ▼                                  │
│                    ┌────────────────────┐                        │
│                    │ 1. Calcular valor  │                        │
│                    │ 2. UPDATE companies│                        │
│                    │ 3. CALL ASAAS API  │◄── ✅ NOVO             │
│                    └────────────────────┘                        │
│                                                                  │
│  Resultado: BD + ASAAS sincronizados                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Caso de Redução de Limites

Quando limites são reduzidos para igual ou abaixo do plano:

1. Sistema calcula: `adicionais = max(0, limites - plano) = 0`
2. Novo valor = apenas preço do plano base
3. ASAAS atualiza descrição: "Assinatura MiauChat STARTER - Empresa X" (sem adicionais)
4. Próxima fatura vem apenas com valor do plano

**Importante**: Isso é o comportamento esperado se o admin conscientemente reduz os limites. Mas precisamos confirmar com ele antes de aplicar.

## Confirmação de Impacto

Adicionar dialog de confirmação quando houver mudança de valor:

```
┌───────────────────────────────────────────────────┐
│  ⚠️ Atualização de Cobrança                       │
├───────────────────────────────────────────────────┤
│                                                   │
│  Valor atual:     R$ 644,70/mês                   │
│  Novo valor:      R$ 497,00/mês                   │
│  Diferença:       -R$ 147,70 (↓ redução)          │
│                                                   │
│  Isso atualizará a assinatura no ASAAS e a       │
│  próxima fatura terá o novo valor.               │
│                                                   │
│  [Cancelar]              [Confirmar Alteração]   │
│                                                   │
└───────────────────────────────────────────────────┘
```

## Checklist de Validação

- [ ] Editar limites para cima → ASAAS atualiza com valor maior
- [ ] Editar limites para baixo → ASAAS atualiza com valor menor
- [ ] Manter limites iguais ao plano → ASAAS mostra apenas plano base
- [ ] Desativar limites customizados → ASAAS volta ao valor do plano
- [ ] Empresa sem assinatura ASAAS → Mostra mensagem "será aplicado quando assinar"
- [ ] Toast/notificação mostra resultado da sincronização

