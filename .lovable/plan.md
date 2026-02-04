
# Plano: Correção de Lógica de Acesso Pós-Pagamento + Preço do Plano

## Problemas Identificados

### 1. Cliente Pago Não Consegue Acessar
**Causa raiz:** A lógica no `ProtectedRoute` verifica se o trial expirou **ANTES** de verificar se a empresa está ativa/paga:

```typescript
// Linha 92-95 - PROBLEMA
if (trial_type && trial_type !== 'none' && trial_expired) {
  return <TrialExpired ... />;  // BLOQUEIA mesmo se status = 'active'
}
```

A empresa `miau-test-h99u` tem:
- `status: 'active'` ✅ (você deu baixa)
- `trial_ends_at: 2026-02-04 14:20:47` (já passou)
- `trial_type: 'manual'`

Como o trial expirou, o sistema bloqueia - ignorando que o status já é `active`.

**Solução:** Quando o `status` é `active`, **ignorar** a verificação de trial expirado. O trial só deve bloquear se o cliente ainda estiver em `status: 'trial'`.

### 2. Valor Errado no Botão "Pagar Agora"
**Causa raiz 1:** O `ProtectedRoute` não passa o `planPrice` para o componente `TrialExpired`:

```typescript
// Linha 94 - FALTANDO planPrice
return <TrialExpired trialEndsAt={...} planName={...} />;
// Deveria ser: planPrice={plan_price || undefined}
```

**Causa raiz 2:** O fallback hardcoded no `TrialExpired` está errado:

```typescript
// Linha 55 - INCORRETO
: "R$ 497,00"  // STARTER, não BASIC
```

O plano mais barato é BASIC (R$ 197), então o fallback deveria ser R$ 197 ou melhor, não ter fallback e mostrar apenas "Pagar Agora".

---

## Alterações Propostas

### 1. `ProtectedRoute.tsx` - Corrigir lógica de bloqueio

Alterar a verificação de trial expirado para **ignorar empresas ativas**:

```typescript
// ANTES (linha 92-95):
if (trial_type && trial_type !== 'none' && trial_expired) {
  return <TrialExpired ... />;
}

// DEPOIS:
// BLOCK: Trial expired (only if company is not yet active/paid)
if (trial_type && trial_type !== 'none' && trial_expired && company_status !== 'active') {
  console.log('[ProtectedRoute] Blocking: Trial expired at', trial_ends_at, 'and status is:', company_status);
  return <TrialExpired 
    trialEndsAt={trial_ends_at || undefined} 
    planName={plan_name || undefined} 
    planPrice={plan_price ?? undefined}  // Adicionar prop faltante
  />;
}
```

### 2. `TrialExpired.tsx` - Corrigir fallback de preço

```typescript
// ANTES (linha 53-55):
const formattedPrice = planPrice 
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(planPrice)
  : "R$ 497,00";

// DEPOIS:
const formattedPrice = planPrice 
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(planPrice)
  : null;

// E no botão (linha 92):
// ANTES:
Pagar Agora - {formattedPrice}/mês

// DEPOIS:
{formattedPrice ? `Pagar Agora - ${formattedPrice}/mês` : "Pagar Agora"}
```

---

## Fluxo Corrigido

```text
CENÁRIO 1: Cliente em Trial (status = 'trial')
1. Trial expira (trial_ends_at < now)
2. trial_expired = true
3. company_status = 'trial' (≠ 'active')
4. ProtectedRoute bloqueia → Mostra TrialExpired ✅

CENÁRIO 2: Cliente Pagou (status = 'active')
1. trial_ends_at < now (data antiga)
2. trial_expired = true
3. company_status = 'active'
4. Condição: trial_expired && company_status !== 'active' = FALSE
5. ProtectedRoute PERMITE acesso ✅

CENÁRIO 3: Cliente Suspenso (status = 'suspended')
1. company_status = 'suspended'
2. ProtectedRoute bloqueia na verificação de suspension (linha 86-89) ✅
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/auth/ProtectedRoute.tsx` | Adicionar condição `company_status !== 'active'` + passar `planPrice` |
| `src/pages/TrialExpired.tsx` | Remover fallback hardcoded, ajustar botão |

---

## Verificação Adicional

Após implementar, a empresa `miau-test-h99u` (status = 'active') deverá:
1. Não ser bloqueada pelo trial expirado
2. Ter acesso normal ao dashboard

---

## Benefícios

1. **Lógica correta**: Empresas pagas não são bloqueadas por trial expirado
2. **Preço correto**: Mostra o preço real do plano do cliente
3. **Sem regressão**: Clientes em trial continuam sendo bloqueados corretamente
4. **Compatibilidade**: Fluxo de suspensão por inadimplência permanece intacto

---

## Observação para o Admin Global

Ao dar baixa no pagamento de uma empresa, o sistema deveria:
1. Mudar `status` para `'active'` ✅ (já faz)
2. **Opcional**: Limpar ou atualizar `trial_type` e `trial_ends_at`

Com a correção proposta, apenas mudar o `status` para `'active'` já é suficiente para liberar o acesso.
