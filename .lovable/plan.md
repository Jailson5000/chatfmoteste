
# Plano: Limite de Cadastros de Trial por Dia

## Problema

Com a aprovação automática de trial ativada, atacantes podem criar múltiplas contas em massa. É necessário limitar o número de cadastros automáticos por dia e forçar aprovação manual após atingir esse limite.

## Solução

Adicionar uma configuração `max_daily_auto_trials` no `system_settings` que:
1. Define quantos trials podem ser auto-aprovados por dia
2. Quando o limite é atingido, novos cadastros vão para aprovação manual
3. O contador reseta automaticamente a cada dia (00:00 UTC)

## Arquitetura

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CADASTRO COM LIMITE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Cadastro Trial]                                                   │
│        │                                                            │
│        ▼                                                            │
│  ┌──────────────────┐    ┌──────────────────────────────┐          │
│  │ auto_approve     │ NO │ Cadastro vai para            │          │
│  │ trial_enabled?   │───►│ aprovação manual             │          │
│  └──────────────────┘    └──────────────────────────────┘          │
│        │ YES                                                        │
│        ▼                                                            │
│  ┌──────────────────┐                                               │
│  │ Contar cadastros │                                               │
│  │ auto-aprovados   │                                               │
│  │ HOJE             │                                               │
│  └──────────────────┘                                               │
│        │                                                            │
│        ▼                                                            │
│  ┌──────────────────┐    ┌──────────────────────────────┐          │
│  │ count >=         │YES │ Cadastro vai para            │          │
│  │ max_daily_auto   │───►│ aprovação manual             │          │
│  │ _trials?         │    │ (mas usuário vê msg normal)  │          │
│  └──────────────────┘    └──────────────────────────────┘          │
│        │ NO                                                         │
│        ▼                                                            │
│  ┌──────────────────────────────┐                                   │
│  │ Auto-aprovar e provisionar   │                                   │
│  │ + enviar email de acesso     │                                   │
│  └──────────────────────────────┘                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementação

### 1. Nova Configuração (system_settings)

| Key | Value | Descrição |
|-----|-------|-----------|
| `max_daily_auto_trials` | `10` | Limite de trials auto-aprovados por dia |

### 2. Modificar Edge Function register-company

**Arquivo:** `supabase/functions/register-company/index.ts`

Após verificar `auto_approve_trial_enabled`, adicionar:

```typescript
// Check daily limit for auto-approve trials
let todayAutoApprovedCount = 0;
let maxDailyTrials = 10; // default

if (autoApproveEnabled) {
  // Get max daily limit from settings
  const { data: maxDailySetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'max_daily_auto_trials')
    .single();
  
  if (maxDailySetting?.value) {
    maxDailyTrials = parseInt(String(maxDailySetting.value), 10) || 10;
  }
  
  // Count today's auto-approved trials
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  
  const { count } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('approval_status', 'approved')
    .gte('created_at', todayStart.toISOString())
    .not('trial_ends_at', 'is', null); // só trials
  
  todayAutoApprovedCount = count || 0;
  
  // If limit reached, switch to manual approval
  if (todayAutoApprovedCount >= maxDailyTrials) {
    console.log(`[register-company] Daily auto-trial limit reached (${todayAutoApprovedCount}/${maxDailyTrials})`);
    autoApproveEnabled = false; // Force manual approval
  }
}
```

### 3. UI no GlobalAdminSettings

**Arquivo:** `src/pages/global-admin/GlobalAdminSettings.tsx`

Adicionar campo numérico logo abaixo do switch de "Aprovação Automática de Trial":

- Input type="number" para `max_daily_auto_trials`
- Valor padrão: 10
- Min: 1, Max: 1000
- Descrição: "Limite de cadastros automáticos por dia. Após atingir, novos cadastros vão para aprovação manual."

### 4. Mostrar Contador no Admin

Na mesma seção, exibir:
- Cadastros auto-aprovados hoje: X / Y
- Barra de progresso visual

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/register-company/index.ts` | Adicionar lógica de limite diário |
| `src/pages/global-admin/GlobalAdminSettings.tsx` | Adicionar campo de limite + contador |

## Experiência do Usuário

**Quando o limite é atingido:**
- Usuário continua vendo "Cadastro realizado com sucesso"
- Recebe email de "Cadastro em análise" (não de trial ativado)
- Admin recebe notificação de novo cadastro pendente
- Nenhuma mensagem de erro é exibida (evita revelar proteção)

## Benefícios de Segurança

1. **Anti-abuso:** Limita criação massiva de contas
2. **Invisível:** Atacantes não sabem que existe limite
3. **Flexível:** Admin pode ajustar limite conforme demanda
4. **Auditável:** Logs mostram quando limite foi atingido

## Checklist de Validação

- [ ] Campo de limite aparece no Global Admin Settings
- [ ] Limite é respeitado na Edge Function
- [ ] Cadastros após limite vão para aprovação manual
- [ ] Contador de "hoje" é exibido corretamente
- [ ] Logs registram quando limite é atingido
- [ ] Reset automático à meia-noite UTC funciona
