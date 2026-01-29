
# Plano: Corrigir Inconsistência no Cálculo de Dias de Trial

## Problema Identificado

O badge de "dias de trial restantes" mostra valores diferentes dependendo de onde é exibido:
- **Dashboard** (CompanyUsageTable.tsx): Mostra "Trial 5d"
- **Empresas** (GlobalAdminCompanies.tsx): Mostra "6 dias restantes"

### Causa Raiz

Os dois arquivos usam métodos diferentes para calcular os dias restantes:

| Local | Método | Resultado |
|-------|--------|-----------|
| Dashboard | `differenceInDays(trialEnd, now)` | 5 dias (dias **completos**) |
| Empresas | `Math.ceil((trialEnd - now) / (1000*60*60*24))` | 6 dias (arredonda **para cima**) |

Quando faltam 5 dias e 12 horas para o trial expirar:
- `differenceInDays` do date-fns retorna `5` (só conta dias completos passados)
- `Math.ceil` retorna `6` (arredonda 5.5 para cima)

## Solução

Padronizar o cálculo usando `Math.ceil` em ambos os lugares. Isso é mais intuitivo para o usuário, pois:
- Se falta 1 hora, ainda mostra "1 dia restante" (não 0)
- Reflete melhor a expectativa do cliente sobre quando o trial expira

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/global-admin/CompanyUsageTable.tsx` | Alterar de `differenceInDays` para `Math.ceil` |

## Detalhes da Correção

### Antes (CompanyUsageTable.tsx - linha 144)
```typescript
const daysLeft = differenceInDays(new Date(company.trial_ends_at), new Date());
```

### Depois
```typescript
const trialEnd = new Date(company.trial_ends_at);
const now = new Date();
const diffTime = trialEnd.getTime() - now.getTime();
const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
```

## Resultado Esperado

Após a correção:
- Dashboard mostrará: "Trial **6d**"
- Empresas mostrará: "**6 dias** restantes"

Ambos os locais exibirão o mesmo número de dias, eliminando a confusão.

## Benefícios

1. **Consistência**: Mesmo valor em todo o sistema
2. **Intuitivo**: Arredondar para cima faz mais sentido para o usuário
3. **Simples**: Mantém lógica idêntica à já existente em GlobalAdminCompanies

## Checklist de Validação

- [ ] Dashboard e Empresas mostram mesmo número de dias
- [ ] Trial com horas restantes mostra pelo menos "1 dia"
- [ ] Trial expirado continua mostrando "Expirado"
- [ ] Cores dos badges mantêm consistência (azul > 2d, laranja ≤ 2d, vermelho expirado)
