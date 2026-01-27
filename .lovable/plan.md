
# Plano de Implementação: Sistema de Trial Flexível

## 📋 Resumo Executivo

Este plano implementa dois cenários de trial sem quebrar funcionalidades existentes:

1. **Trial Automático + Plano (Toggle LIGADO)**: Cliente escolhe plano → 7 dias grátis → cobra automaticamente no 8º dia → bloqueia se não pagar
2. **Trial Manual (Toggle DESLIGADO)**: Admin aprova → marca como trial → 7 dias a partir da marcação → depois cobra

---

## 🔧 Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SISTEMA DE TRIAL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐     ┌──────────────────────────────────────────┐  │
│  │  GlobalAdminSettings │     │           companies (tabela)              │  │
│  │  ────────────────────│     │  ─────────────────────────────────────── │  │
│  │                      │     │  + trial_type: 'none'|'auto_plan'|       │  │
│  │  [x] Trial Auto+Plano│────▶│              'manual'                    │  │
│  │      (toggle global) │     │  + trial_started_at: timestamp           │  │
│  │                      │     │  + trial_ends_at: timestamp              │  │
│  └──────────────────────┘     │  + trial_plan_id: uuid (plano durante    │  │
│                               │               trial)                      │  │
│                               └────────────────────────────────────────┘  │
│                                           │                                │
│                                           ▼                                │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                       ProtectedRoute                                 │  │
│  │  ─────────────────────────────────────────────────────────────────  │  │
│  │  1. Verifica trial_type                                             │  │
│  │  2. Se trial_type != 'none' E now() > trial_ends_at                 │  │
│  │     → Mostra tela de "Trial Expirado"                               │  │
│  │     → Bloqueia acesso até pagamento                                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Fluxos de Trabalho

### Cenário A: Trial Automático + Plano (Toggle LIGADO)

```text
Cliente              Landing Page           Backend              Admin
   │                      │                    │                   │
   │──[Escolhe Plano]────▶│                    │                   │
   │                      │──[Registra]───────▶│                   │
   │                      │                    │                   │
   │                      │   status: pending  │                   │
   │                      │   trial_type: auto │                   │
   │                      │   trial_ends_at:   │                   │
   │                      │     NOW()+7 dias   │                   │
   │                      │                    │                   │
   │◀─[Email Confirmação]─│                    │                   │
   │                      │                    │                   │
   │                      │                    │──[Notifica]──────▶│
   │                      │                    │                   │
   │                      │                    │◀─[Aprova]─────────│
   │                      │                    │                   │
   │◀─[Email Acesso]──────│                    │   trial_started:  │
   │                      │                    │     NOW()         │
   │                      │                    │   trial_ends:     │
   │                      │                    │     NOW()+7 dias  │
   │                      │                    │                   │
   │──[Usa sistema]──────▶│                    │                   │
   │   (7 dias)           │                    │                   │
   │                      │                    │                   │
   │──[Dia 8]────────────▶│                    │                   │
   │                      │   trial expirado   │                   │
   │◀─[BLOQUEADO]─────────│                    │                   │
   │                      │                    │                   │
   │──[Paga Plano]───────▶│                    │                   │
   │                      │   trial_type:none  │                   │
   │◀─[Acesso liberado]───│                    │                   │
```

### Cenário B: Trial Manual (Toggle DESLIGADO)

```text
Cliente              Landing Page           Backend              Admin
   │                      │                    │                   │
   │──[Cadastra]─────────▶│                    │                   │
   │                      │──[Registra]───────▶│                   │
   │                      │   status: pending  │                   │
   │                      │   trial_type: none │                   │
   │                      │                    │                   │
   │◀─[Email Confirmação]─│                    │                   │
   │                      │                    │──[Notifica]──────▶│
   │                      │                    │                   │
   │                      │                    │◀─[Aprova +       ─│
   │                      │                    │   Marca Trial]    │
   │                      │                    │                   │
   │                      │                    │   trial_type:     │
   │                      │                    │     manual        │
   │                      │                    │   trial_started:  │
   │                      │                    │     NOW()         │
   │                      │                    │   trial_ends:     │
   │                      │                    │     NOW()+7 dias  │
   │                      │                    │                   │
   │◀─[Email Acesso]──────│                    │                   │
   │                      │                    │                   │
   │──[Usa sistema]──────▶│                    │                   │
   │   (7 dias)           │                    │                   │
```

---

## 🗃️ Mudanças no Banco de Dados

### Fase 1: Migração da Tabela `companies`

```sql
-- Adicionar novas colunas para controle de trial
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS trial_type text DEFAULT 'none' 
    CHECK (trial_type IN ('none', 'auto_plan', 'manual')),
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_plan_id uuid REFERENCES public.plans(id);

-- Comentários para documentação
COMMENT ON COLUMN companies.trial_type IS 
  'Tipo de trial: none=sem trial, auto_plan=automático com plano, manual=aprovado manualmente';
COMMENT ON COLUMN companies.trial_started_at IS 
  'Data de início do período de trial';
COMMENT ON COLUMN companies.trial_ends_at IS 
  'Data de fim do período de trial (já existe)';
COMMENT ON COLUMN companies.trial_plan_id IS 
  'Plano selecionado durante o trial (para cobrança futura)';
```

### Fase 2: Setting Global para Toggle

```sql
-- Inserir setting para controle global do trial automático
INSERT INTO public.system_settings (key, value, category, description)
VALUES (
  'auto_trial_with_plan_enabled', 
  'false', 
  'billing', 
  'Quando ativo, clientes que selecionam plano automaticamente recebem 7 dias de trial'
)
ON CONFLICT (key) DO NOTHING;
```

---

## 💻 Mudanças no Frontend

### 1. GlobalAdminSettings.tsx
**Adicionar toggle "Trial Automático + Plano"**

- Novo card na seção de Faturamento
- Toggle liga/desliga o trial automático
- Descrição explicativa do comportamento

### 2. GlobalAdminCompanies.tsx (Tela de Aprovação)
**Adicionar checkbox "Marcar como Trial" na aprovação manual**

- Checkbox visível quando toggle global está DESLIGADO
- Ao marcar, define `trial_type='manual'` e calcula `trial_ends_at`
- Badge visual mostrando status do trial nas empresas

### 3. useCompanyApproval.tsx
**Adicionar campos de trial no retorno**

```typescript
interface CompanyApprovalStatus {
  // ... campos existentes
  trial_type: 'none' | 'auto_plan' | 'manual' | null;
  trial_ends_at: string | null;
  trial_expired: boolean;
}
```

### 4. ProtectedRoute.tsx
**Adicionar verificação de trial expirado**

```typescript
// Após verificar approval_status
if (trial_type !== 'none' && trial_ends_at) {
  const isExpired = new Date() > new Date(trial_ends_at);
  if (isExpired) {
    return <TrialExpired planId={trial_plan_id} />;
  }
}
```

### 5. Nova Página: TrialExpired.tsx
**Tela exibida quando trial expira**

- Mensagem amigável: "Seu período de teste terminou"
- Botão para contratar plano
- Link para contato com suporte

---

## ⚙️ Mudanças no Backend

### 1. approve-company/index.ts
**Adicionar lógica de trial na aprovação**

```typescript
interface ApproveRequest {
  // ... campos existentes
  enable_trial?: boolean;  // Para trial manual
}

// Na aprovação:
if (action === 'approve') {
  // Buscar setting global
  const { data: autoTrialSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'auto_trial_with_plan_enabled')
    .single();
  
  const autoTrialEnabled = autoTrialSetting?.value === 'true';
  
  // Calcular trial_ends_at
  const trialDays = 7;
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  
  // Definir trial_type baseado no cenário
  let trialType = 'none';
  let trialStartedAt = null;
  let trialEndsAtValue = null;
  
  if (autoTrialEnabled && company.plan_id) {
    // Cenário A: Trial automático com plano
    trialType = 'auto_plan';
    trialStartedAt = new Date().toISOString();
    trialEndsAtValue = trialEndsAt.toISOString();
  } else if (body.enable_trial) {
    // Cenário B: Trial manual
    trialType = 'manual';
    trialStartedAt = new Date().toISOString();
    trialEndsAtValue = trialEndsAt.toISOString();
  }
  
  // Atualizar empresa
  await supabase
    .from('companies')
    .update({
      // ... campos existentes
      trial_type: trialType,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAtValue,
      trial_plan_id: company.plan_id,
    })
    .eq('id', company_id);
}
```

### 2. register-company/index.ts (Opcional)
**Pre-configurar trial_type baseado no toggle global**

- Se toggle LIGADO e plano selecionado → `trial_type='auto_plan'`
- Caso contrário → `trial_type='none'`

---

## 📋 Sequência de Implementação

| Fase | Descrição | Risco |
|------|-----------|-------|
| 1 | Migração do banco (novas colunas) | Baixo - apenas ADD COLUMN |
| 2 | Setting global no system_settings | Baixo - INSERT simples |
| 3 | UI GlobalAdminSettings (toggle) | Baixo - novo card |
| 4 | UI GlobalAdminCompanies (checkbox trial) | Médio - alteração na aprovação |
| 5 | useCompanyApproval (campos trial) | Baixo - campos adicionais |
| 6 | ProtectedRoute (verificação trial) | Médio - nova lógica de bloqueio |
| 7 | TrialExpired page | Baixo - nova página |
| 8 | approve-company (lógica trial) | Médio - alteração no backend |

---

## ✅ Garantias de Não-Regressão

1. **Default Seguro**: `trial_type` default é `'none'` - empresas existentes não são afetadas
2. **Toggle Desligado**: Por padrão o toggle vem desligado - comportamento atual é mantido
3. **Migração Aditiva**: Apenas ADD COLUMN, nenhuma alteração em dados existentes
4. **Backward Compatible**: Hook useCompanyApproval retorna valores null-safe
5. **Testes Incrementais**: Cada fase pode ser testada isoladamente

---

## 🎯 Resultado Esperado

**Cenário A (Toggle LIGADO)**:
1. Cliente acessa landing → escolhe plano Basic
2. Cadastra → recebe email de confirmação
3. Admin aprova → cliente recebe acesso
4. Usa 7 dias grátis → no 8º dia é bloqueado
5. Paga → acesso liberado definitivamente

**Cenário B (Toggle DESLIGADO)**:
1. Cliente acessa landing → cadastra sem plano
2. Recebe email de confirmação
3. Admin aprova E marca checkbox "Trial de 7 dias"
4. Cliente recebe acesso → usa 7 dias
5. No 8º dia é bloqueado → admin define plano e cobra
