
## Atualizar limites de WhatsApp nos planos BASIC e STARTER

### O que sera feito
Atualizar o campo `max_instances` (numero de conexoes WhatsApp) nos planos:

| Plano | Antes | Depois |
|-------|-------|--------|
| PRIME | 1 | 1 (sem mudanca) |
| BASIC | 1 | **2** |
| STARTER | 2 | **3** |
| PROFESSIONAL | 4 | 4 (sem mudanca) |
| ENTERPRISE | 6 | 6 (sem mudanca) |

### Verificacao de consistencia
Apos revisar o codigo, os seguintes locais ja renderizam `max_instances` dinamicamente a partir do banco, portanto **nao precisam de alteracao no codigo**:

- **Landing Page** (`LandingPage.tsx`): exibe "{plan.max_instances} conexoes WhatsApp" nos cards
- **Global Admin Planos** (`GlobalAdminPlans.tsx`): exibe "{plan.max_instances} conexoes WhatsApp" e permite edicao
- **Global Admin Empresas** (`GlobalAdminCompanies.tsx`): preenche automaticamente `max_instances` ao selecionar um plano
- **Hook usePlans**: busca os dados direto da tabela `plans`

### Implementacao
Um unico UPDATE SQL na tabela `plans` para alterar `max_instances` dos planos BASIC e STARTER.

```text
BASIC:  max_instances = 2
STARTER: max_instances = 3
```

Nenhuma alteracao de codigo frontend e necessaria.
