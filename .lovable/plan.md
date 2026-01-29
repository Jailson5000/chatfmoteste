
# Plano de Correção: Add-ons e Geração de Fatura

## Problemas Identificados

### Problema 1: Add-ons Aprovados Não Aparecem no Resumo

**Causa Raiz**: A função SQL `approve_addon_request` usa valores hardcoded como fallback:
```sql
_new_max_users := COALESCE(_company.max_users, 5) + _request.additional_users;
```

Quando `max_users` é NULL (primeira solicitação), usa `5` ao invés do limite do **plano**.

**Dados Atuais da FMO**:
- Plano ENTERPRISE: `max_users = 10`, `max_instances = 6`
- Empresa atual: `max_users = 9`, `max_instances = 5`
- Resultado: `9 - 10 = -1` → 0 adicionais (ERRADO!)

**Esperado** (após 3 aprovações: +4 users, +3 instances):
- `max_users = 10 + 4 = 14`
- `max_instances = 6 + 3 = 9`

### Problema 2: Erro ao Copiar Link de Pagamento

**Causa**: `navigator.clipboard.writeText()` falha quando o documento perde foco.

**Erro**: `Failed to execute 'writeText' on 'Clipboard': Document is not focused`

---

## Solução

### Parte 1: Corrigir Função de Aprovação

Atualizar `approve_addon_request` para buscar limites do plano como baseline:

```sql
DECLARE
  _plan_max_users integer;
  _plan_max_instances integer;
BEGIN
  -- Buscar limites do plano
  SELECT max_users, max_instances INTO _plan_max_users, _plan_max_instances
  FROM plans WHERE id = _company.plan_id;
  
  -- Usar limite do plano como base quando max_users/instances é NULL
  _new_max_users := COALESCE(_company.max_users, _plan_max_users, 5) + _request.additional_users;
  _new_max_instances := COALESCE(_company.max_instances, _plan_max_instances, 2) + _request.additional_instances;
END;
```

### Parte 2: Corrigir Dados da FMO Advogados

Executar SQL para corrigir os limites atuais baseado nos add-ons aprovados:

```sql
-- FMO tem 3 add-ons aprovados: +4 users, +3 instances
-- Plano Enterprise: max_users=10, max_instances=6
UPDATE companies 
SET 
  max_users = 10 + 4,  -- 14
  max_instances = 6 + 3  -- 9
WHERE id = '08370f53-1f7c-4e72-91bc-425c8da3613b';
```

### Parte 3: Corrigir Cópia para Clipboard

Usar try-catch com fallback e exibir link no toast:

```typescript
try {
  await navigator.clipboard.writeText(paymentUrl);
  toast.success(`Link copiado! ${paymentUrl}`, { duration: 15000 });
} catch (clipboardError) {
  // Fallback: exibir link clicável no toast
  toast.success(
    `Link gerado: ${paymentUrl}`,
    { 
      duration: 30000,
      action: {
        label: "Copiar",
        onClick: () => navigator.clipboard.writeText(paymentUrl)
      }
    }
  );
}
```

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| Migration SQL | Atualizar função `approve_addon_request` para buscar limites do plano |
| Migration SQL | Corrigir dados da FMO Advogados |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Adicionar try-catch no clipboard + exibir link no toast |

---

## Fluxo Corrigido

```text
┌─────────────────────────┐
│ Cliente solicita        │
│ +2 usuários, +1 WhatsApp│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Admin aprova solicitação│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ approve_addon_request:                          │
│                                                 │
│ 1. Busca plano: max_users=10, max_instances=6   │
│ 2. Usa COALESCE(company.max_users, plan.max_users)│
│ 3. Novo max_users = 10 + 2 = 12                 │
│ 4. Novo max_instances = 6 + 1 = 7              │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ calculateAdditionalCosts:                       │
│                                                 │
│ additionalUsers = 12 - 10 = 2 → R$ 95,80        │
│ additionalInstances = 7 - 6 = 1 → R$ 79,90      │
│ TOTAL = R$ 1.697 + R$ 175,70 = R$ 1.872,70      │
└─────────────────────────────────────────────────┘
```

---

## Benefícios

1. **Cálculo Correto**: Add-ons baseados no limite do plano, não em valores hardcoded
2. **Resumo Mensal Correto**: Cliente verá breakdown de adicionais
3. **Faturamento Correto**: ASAAS receberá valor incluindo adicionais
4. **UX Melhorada**: Link de pagamento sempre acessível, mesmo se clipboard falhar
