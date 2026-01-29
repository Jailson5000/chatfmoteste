
# Plano: Correção de Descrição ASAAS + Análise de Capacidade + Melhorias do Sistema

## Análise Detalhada das Questões

### 1. Problema: Descrição Não Atualiza no ASAAS

**Diagnóstico da imagem:**
A descrição mostra: `Assinatura MiauChat ENTERPRISE Inclui: +4 usuário(s) +3 WhatsApp - FMO Advogados`

Isso é o valor **inicial** quando a assinatura foi criada. Quando o admin atualiza os limites via "Atualizar Assinatura", a função `update-asaas-subscription` **NÃO atualiza a descrição** - apenas o valor:

```typescript
// Código atual em update-asaas-subscription (linha 142-145)
const updatePayload = {
  value: new_value,
  updatePendingPayments: true, // Apenas o valor!
};
// ❌ FALTA: description não é atualizado
```

**Solução:** Adicionar campo `description` ao payload de atualização, recalculando com base nos novos limites.

---

### 2. Análise de Capacidade Enterprise

**Dados Reais do Sistema:**

| Métrica | Valor |
|---------|-------|
| **Total de law_firms** | 18 |
| **Law firms COM company** | 7 |
| **Law firms SEM company (órfãos)** | 11 |
| **Companies aprovadas** | 6 |
| **Companies pendentes** | 1 |
| **Em trial ativo** | 1 |
| **Usuários (profiles)** | 12 |
| **WhatsApp instances** | 6 |
| **Conversas** | 157 |
| **Mensagens** | 2.692 |

**Empresas Enterprise Atuais:**

| Empresa | Max Users | Atual | Max Instances | Atual | Max Agents | Atual |
|---------|-----------|-------|---------------|-------|------------|-------|
| Jr | 10 | 2 | 6 | 0 | - | 0 |
| FMO Advogados | 16 (+6 addon) | 2 | 9 (+3 addon) | 2 | - | 5 |

**Limites do Plano Enterprise:**
- Max Users: 10 (base)
- Max Instances: 6 (base)
- Max AI Conversations: 600/mês
- Max TTS Minutes: 60/mês
- Preço: R$ 1.697,00

**Capacidade Estimada do Sistema:**
O Supabase Pro suporta ~500 conexões Realtime simultâneas. Com a arquitetura atual:
- **50-100 empresas Enterprise** podem ser suportadas
- **Atualmente**: 2 empresas Enterprise (2% da capacidade)
- O sistema está **muito abaixo** da capacidade máxima

---

### 3. Análise Geral ("Pente Fino")

**Issues Identificados:**

| Prioridade | Issue | Impacto | Solução |
|------------|-------|---------|---------|
| 🔴 ALTA | Descrição ASAAS não atualiza | Confusão no faturamento | Adicionar `description` ao update payload |
| 🟡 MÉDIA | 11 law_firms órfãos | Dados inconsistentes | Limpeza ou vinculação |
| 🟡 MÉDIA | Tabela `tray_customer_map` sem RLS policies | Segurança | Adicionar policies ou remover RLS |
| 🟢 BAIXA | TODOs no código (Stripe price IDs) | Funcionalidade incompleta | Configurar IDs reais |
| 🟢 BAIXA | Leaked Password Protection desabilitado | Segurança menor | Habilitar no Dashboard |

**Segurança:**
- ✅ 84 tabelas com RLS habilitado
- ✅ 210+ policies RLS
- ⚠️ 1 tabela (`tray_customer_map`) com RLS habilitado mas sem policies (está vazia)

---

## Alterações Propostas

### Parte 1: Corrigir Atualização de Descrição ASAAS

**Arquivo:** `supabase/functions/update-asaas-subscription/index.ts`

Modificar para:
1. Buscar dados da empresa e plano
2. Calcular descrição atualizada com base nos novos limites
3. Incluir `description` no payload de atualização

```typescript
// Adicionar à interface
interface UpdateRequest {
  company_id: string;
  new_value: number;
  reason?: string;
  description?: string;  // Permitir descrição customizada
}

// Antes de fazer o update, buscar dados da empresa
const { data: company } = await supabase
  .from("companies")
  .select(`
    name,
    max_users,
    max_instances,
    plan:plans!companies_plan_id_fkey(name, max_users, max_instances)
  `)
  .eq("id", company_id)
  .single();

// Calcular adicionais
const additionalUsers = Math.max(0, (company.max_users || 0) - (company.plan?.max_users || 0));
const additionalInstances = Math.max(0, (company.max_instances || 0) - (company.plan?.max_instances || 0));

// Gerar nova descrição
let descriptionParts = [`Assinatura MiauChat ${company.plan?.name || 'PLANO'}`];
if (additionalUsers > 0 || additionalInstances > 0) {
  descriptionParts.push("Inclui:");
  if (additionalUsers > 0) descriptionParts.push(`+${additionalUsers} usuário(s)`);
  if (additionalInstances > 0) descriptionParts.push(`+${additionalInstances} WhatsApp`);
}
descriptionParts.push(`- ${company.name}`);
const newDescription = descriptionParts.join(" ");

// Incluir no payload
const updatePayload = {
  value: new_value,
  description: newDescription,
  updatePendingPayments: true,
};
```

### Parte 2: Adicionar RLS Policy para `tray_customer_map`

**Via migração SQL:**

```sql
-- Tabela está vazia e com RLS habilitado mas sem policies
-- Adicionar policy básica para evitar warning do linter
CREATE POLICY "Tenant isolation for tray_customer_map" 
  ON public.tray_customer_map 
  FOR ALL 
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid())
    OR public.is_admin(auth.uid())
  );
```

### Parte 3: Atualizar Dashboard com Dados Precisos

**Já implementado** no commit anterior - cards mostram:
- Total: 7 empresas
- Ativas: 5 (approved sem trial)
- Em Trial: 1
- Pendentes: 1

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/update-asaas-subscription/index.ts` | Adicionar atualização de descrição |
| Migração SQL | Adicionar RLS policy para `tray_customer_map` |

---

## Sobre os Law Firms Órfãos

Existem **11 law_firms** sem company associada. Isso pode ter ocorrido por:
1. Fluxos de teste antigos
2. Registros incompletos
3. Dados de desenvolvimento

**Recomendação:** Criar um script de limpeza que pode ser executado manualmente no Admin Global, mas **não automatizar** para evitar exclusões acidentais.

---

## Resumo de Capacidade

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CAPACIDADE DO SISTEMA                                                   │
│                                                                          │
│  Conexões Realtime Supabase Pro: ~500 simultâneas                       │
│  Estimativa de empresas: 50-100 Enterprise com uso moderado            │
│                                                                          │
│  USO ATUAL:                                                              │
│  ├─ Empresas Enterprise: 2/100 (2%)                                     │
│  ├─ Usuários ativos: 12/~500 (2.4%)                                     │
│  ├─ WhatsApp instances: 6/~100 (6%)                                     │
│  └─ Conversas: 157 (sem limite definido)                                │
│                                                                          │
│  ✅ Sistema opera com folga para crescimento 50x                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Fluxo da Correção de Descrição

```
ANTES:
┌─────────────────────────────────────────────────────────┐
│ Admin aprova addon (+2 usuários)                        │
│         ↓                                               │
│ update-asaas-subscription                               │
│         ↓                                               │
│ Atualiza apenas { value: 1897 }                         │
│         ↓                                               │
│ ❌ Descrição continua antiga: "+4 usuários +3 WhatsApp" │
└─────────────────────────────────────────────────────────┘

DEPOIS:
┌─────────────────────────────────────────────────────────┐
│ Admin aprova addon (+2 usuários)                        │
│         ↓                                               │
│ update-asaas-subscription                               │
│         ↓                                               │
│ Busca dados atuais da empresa                           │
│         ↓                                               │
│ Calcula: +6 usuários +3 WhatsApp (valores atuais)       │
│         ↓                                               │
│ Atualiza { value: 1897, description: "...+6 usuários"}  │
│         ↓                                               │
│ ✅ Descrição atualizada no ASAAS                        │
└─────────────────────────────────────────────────────────┘
```

---

## Prevenção de Regressões

1. **Lógica aditiva:** Apenas adiciona campo `description` ao payload existente
2. **Fallback:** Se busca de empresa falhar, mantém lógica atual (só atualiza valor)
3. **Não modifica admin-create-asaas-subscription:** Essa função já gera descrição corretamente na criação
4. **Migração segura:** Policy para tabela vazia não afeta dados existentes
