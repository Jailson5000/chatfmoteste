
# Implementação: Monitoramento e Lembretes de Trial

## Visão Geral

Implementar 3 funcionalidades relacionadas ao gerenciamento de trials:

1. **Indicador visual no Dashboard** - Mostrar empresas com trial expirando em 2 dias
2. **Email automático de lembrete** - Enviar aviso 2 dias antes do trial expirar
3. **Verificação do fluxo** - Testar se o bloqueio funciona corretamente

---

## 1. Indicador Visual no Dashboard

### Objetivo
Adicionar um card de alerta destacado no Dashboard do Global Admin mostrando empresas com trial expirando nos próximos 2 dias para acompanhamento proativo.

### Alterações no `src/hooks/useSystemMetrics.tsx`

Adicionar nova métrica `companiesTrialExpiringSoon` no cálculo:

```typescript
// Nova métrica a ser calculada
let companiesTrialExpiringSoon = 0;

// No forEach de companiesDetailResult.data
const trialEndsAt = new Date(company.trial_ends_at);
const daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

if (daysRemaining > 0 && daysRemaining <= 2) {
  companiesTrialExpiringSoon++;
}
```

### Alterações no `src/pages/global-admin/GlobalAdminDashboard.tsx`

Adicionar um **card de alerta** abaixo do header (antes dos stats cards) quando houver empresas expirando:

```tsx
{/* Alerta de Trials Expirando */}
{dashboardMetrics?.companiesTrialExpiringSoon > 0 && (
  <div 
    className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center gap-4 cursor-pointer hover:bg-orange-500/15 transition-colors"
    onClick={() => navigate("/global-admin/companies?trial=expiring_soon")}
  >
    <div className="p-3 rounded-full bg-orange-500/20">
      <AlertTriangle className="h-6 w-6 text-orange-400" />
    </div>
    <div className="flex-1">
      <p className="text-orange-400 font-semibold">
        {dashboardMetrics.companiesTrialExpiringSoon} empresa(s) com trial expirando em até 2 dias
      </p>
      <p className="text-white/50 text-sm">
        Clique para ver e tomar ação preventiva
      </p>
    </div>
    <ArrowUpRight className="h-5 w-5 text-orange-400" />
  </div>
)}
```

---

## 2. Email Automático de Lembrete (2 dias antes)

### Objetivo
Criar uma Edge Function que rode via cron job diariamente e envie emails de lembrete para empresas cujo trial expira em exatamente 2 dias.

### Nova Edge Function: `supabase/functions/process-trial-reminders/index.ts`

```typescript
// Lógica principal:
// 1. Buscar empresas com trial_ends_at entre hoje+1.5 dias e hoje+2.5 dias
// 2. Para cada empresa, verificar se já enviou lembrete (deduplicação)
// 3. Obter email do admin da empresa via profiles
// 4. Enviar email personalizado via Resend
// 5. Registrar log para evitar duplicatas
```

### Estrutura do Email

| Seção | Conteúdo |
|-------|----------|
| **Assunto** | `⏰ Seu período de trial expira em 2 dias - [Nome Empresa]` |
| **Corpo** | Aviso amigável, data de expiração, CTA para pagar, link de suporte |

### Tabela de Log (deduplicação)

Utilizar a tabela existente `admin_notification_logs` para registrar envios:
- `event_type`: `'TRIAL_REMINDER_2_DAYS'`
- `tenant_id`: ID da empresa
- `event_key`: `'trial_reminder_2d_{company_id}_{trial_ends_at}'`

### Configuração do Cron Job

Adicionar no Supabase via SQL (executa diariamente às 9h horário de Brasília):

```sql
SELECT cron.schedule(
  'process-trial-reminders-daily',
  '0 12 * * *',  -- 12:00 UTC = 9:00 BRT
  $$
  SELECT net.http_post(
    url := 'https://jiragtersejnarxruqyd.supabase.co/functions/v1/process-trial-reminders',
    headers := '{"Authorization": "Bearer ANON_KEY"}'::jsonb
  )
  $$
);
```

### Atualização do `supabase/config.toml`

```toml
[functions.process-trial-reminders]
verify_jwt = false
```

---

## 3. Verificação do Fluxo de Trial Expirado

### Teste Manual (Navegação)

1. Acessar `/global-admin/companies`
2. Localizar empresa em trial (ex: "Miau test" com 4 dias restantes)
3. Confirmar que badge mostra corretamente dias restantes

### Validação do Bloqueio

O bloqueio está implementado em `src/components/auth/ProtectedRoute.tsx`:

```typescript
// Linha 59-62 - Lógica de bloqueio
if (trial_type && trial_type !== 'none' && trial_expired) {
  console.log('[ProtectedRoute] Blocking: Trial expired at', trial_ends_at);
  return <TrialExpired trialEndsAt={trial_ends_at} planName={plan_name} />;
}
```

Para testar completamente seria necessário:
- Modificar temporariamente `trial_ends_at` de uma empresa para data no passado
- Fazer login como usuário dessa empresa
- Confirmar que é redirecionado para `TrialExpired.tsx`

---

## Arquivos a Modificar/Criar

| Arquivo | Ação |
|---------|------|
| `src/hooks/useSystemMetrics.tsx` | Adicionar métrica `companiesTrialExpiringSoon` |
| `src/pages/global-admin/GlobalAdminDashboard.tsx` | Adicionar card de alerta para trials expirando |
| `supabase/functions/process-trial-reminders/index.ts` | **Criar** - Edge function para envio de lembretes |
| `supabase/config.toml` | Adicionar configuração da nova função |

---

## Template do Email de Lembrete

```html
Assunto: ⏰ Seu período de trial expira em 2 dias - {empresa}

Olá {nome},

Seu período de teste do MiauChat expira em 2 dias ({data_expiracao}).

Após essa data, o acesso ao sistema será bloqueado automaticamente.

Para continuar usando todas as funcionalidades:
👉 [Botão: Assinar Agora]

Caso tenha dúvidas sobre os planos disponíveis, 
entre em contato com nosso suporte.

Atenciosamente,
Equipe MiauChat
```

---

## Fluxo Completo de Trial

```text
+----------------+      +-------------------+      +------------------+
| Cadastro       |  →   | Trial Ativo       |  →   | Lembrete Email   |
| (7 dias trial) |      | (acesso liberado) |      | (2 dias antes)   |
+----------------+      +-------------------+      +------------------+
                                                          ↓
                        +-------------------+      +------------------+
                        | Empresa Paga      |  ←   | Trial Expirado   |
                        | (acesso liberado) |      | (bloqueado)      |
                        +-------------------+      +------------------+
```

---

## Resultado Esperado

1. **Dashboard**: Card laranja visível quando há empresas com trial expirando em 2 dias, clicável para filtrar
2. **Email**: Enviado automaticamente às 9h (BRT) para admin de empresas com trial expirando
3. **Bloqueio**: Confirmado que empresas com trial expirado veem tela de pagamento
