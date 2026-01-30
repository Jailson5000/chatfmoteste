

# Análise e Melhorias do Sistema de Alertas de Instâncias Desconectadas

## Situação Atual

O sistema de alertas está funcional e bem estruturado:

| Componente | Status | Observação |
|------------|--------|------------|
| Edge Function `check-instance-alerts` | ✅ OK | Roda via CRON cada 5 minutos |
| Threshold de alerta | 5 min (disconnected), 10 min (connecting) | Adequado |
| Flag `alert_sent_for_current_disconnect` | ✅ Implementado | Evita alertas duplicados |
| Reset da flag no webhook | ✅ Implementado | Linha 3532 do evolution-webhook |
| Log de alertas | ✅ Implementado | `admin_notification_logs` |

### Dados do Banco

```
CRON: check-instance-alerts-every-5min → Ativo ✅
Alertas de desconexão enviados: 0 recentes (histórico vazio recente)
Instâncias conectadas: 4
Instâncias desconectadas: 2 (ambas com awaiting_qr=true)
```

---

## Problemas Identificados

### 1. Alerta NÃO é enviado quando `awaiting_qr=true`

**Problema:** Instâncias que precisam de QR Code ficam **silenciadas** - o cliente não recebe alerta porque o sistema filtra `awaiting_qr=true`.

**Exemplo Real:**
- `inst_s10r2qh8` (FMOADV) está desconectada desde **16/Jan** (14 dias!)
- Tem `alert_sent_for_current_disconnect: true` mas `awaiting_qr: true`
- Isso significa que o alerta foi enviado UMA vez, mas nunca mais lembrou o cliente

**Impacto:** Cliente pode ficar semanas sem saber que precisa reconectar.

### 2. Falta de Alerta Recorrente (Lembrete)

O sistema envia apenas **UM** alerta por ciclo de desconexão. Se o cliente não viu o e-mail ou esqueceu, ficará offline indefinidamente sem novas notificações.

### 3. Não há Notificação ao Admin Global

Quando uma instância fica desconectada por muito tempo (ex: >24h), o admin global não é notificado. Apenas o cliente recebe o alerta.

### 4. Tipo de Evento Inconsistente

O código salva como `INSTANCE_DISCONNECTION_ALERT` mas a UI procura por `INSTANCE_DISCONNECTED_ALERT` (com "ED" no final). Isso faz com que os alertas não apareçam corretamente na tela de histórico.

---

## Melhorias Propostas

### Melhoria 1: Alerta Lembrete para Instâncias Offline Prolongado

Enviar um **lembrete** após 24h se a instância ainda estiver desconectada:

```typescript
// Nova lógica: Alerta inicial após 5min, lembrete após 24h
const REMINDER_THRESHOLD_HOURS = 24;

// Adicionar condição para re-alertar após 24h mesmo se awaiting_qr=true
if (instance.awaiting_qr && 
    instance.last_alert_sent_at && 
    hoursSinceLastAlert >= REMINDER_THRESHOLD_HOURS) {
  // Enviar lembrete
}
```

### Melhoria 2: Notificar Admin Global em Desconexões Prolongadas

Se uma instância ficar offline por mais de 48h, notificar também o admin global:

```typescript
const ADMIN_ESCALATION_HOURS = 48;

// Se offline > 48h, incluir admin global no alerta
if (hoursDisconnected >= ADMIN_ESCALATION_HOURS) {
  const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");
  // Enviar cópia para admin global
}
```

### Melhoria 3: Corrigir Tipo de Evento para Consistência

Alterar de `INSTANCE_DISCONNECTION_ALERT` para `INSTANCE_DISCONNECTED_ALERT` para compatibilidade com a UI.

### Melhoria 4: Adicionar Metadados Mais Ricos no Log

Incluir mais informações no log para análise:

```typescript
metadata: {
  instances_count: result.instances_count,
  threshold_minutes: ALERT_THRESHOLD_MINUTES,
  instance_names: companyInstances.map(i => i.display_name || i.instance_name),
  hours_disconnected: maxHoursDisconnected,
  is_reminder: isReminderAlert,
  awaiting_qr: hasAwaitingQr,
}
```

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/check-instance-alerts/index.ts` | Adicionar lembrete 24h, escalação admin, corrigir event_type |
| `src/hooks/useNotificationLogs.tsx` | Adicionar contagem de alertas de instância nas stats |
| `src/pages/global-admin/GlobalAdminAlertHistory.tsx` | Corrigir mapeamento do event_type |

---

## Código das Modificações

### 1. check-instance-alerts/index.ts - Adicionar Sistema de Lembrete

```typescript
// Novos thresholds
const ALERT_THRESHOLD_MINUTES = 5;
const CONNECTING_ALERT_THRESHOLD_MINUTES = 10;
const REMINDER_THRESHOLD_HOURS = 24; // Lembrete após 24h
const ADMIN_ESCALATION_HOURS = 48; // Notificar admin global após 48h

// Modificar filtro para permitir lembretes mesmo com awaiting_qr
const instances = (rawInstances || []).filter((instance: DisconnectedInstance) => {
  if (instance.manual_disconnect === true) {
    return false;
  }
  
  // Para instâncias que já receberam alerta
  if (instance.alert_sent_for_current_disconnect === true) {
    // Verificar se já passou tempo suficiente para lembrete
    if (instance.last_alert_sent_at) {
      const hoursSinceAlert = (Date.now() - new Date(instance.last_alert_sent_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceAlert >= REMINDER_THRESHOLD_HOURS) {
        // Marcar como lembrete para diferenciar no e-mail
        (instance as any).isReminder = true;
        return true; // Permitir re-alerta como lembrete
      }
    }
    return false;
  }
  
  // Primeiro alerta - não enviar se awaiting_qr (usuário já sabe que precisa escanear)
  if (instance.awaiting_qr === true) {
    return false;
  }
  
  return true;
});
```

### 2. Modificar Assunto e Conteúdo do E-mail para Lembretes

```typescript
// Verificar se é lembrete
const isReminderAlert = (instance as any).isReminder === true;

const alertTitle = isReminderAlert
  ? '🔔 Lembrete: WhatsApp ainda desconectado'
  : hasConnectingIssue 
    ? '⚠️ Alerta: WhatsApp com Problema de Conexão'
    : '⚠️ Alerta: WhatsApp Desconectado';

const subject = isReminderAlert
  ? `🔔 Lembrete: WhatsApp desconectado há ${daysDisconnected} dias - ${companyName}`
  : `⚠️ WhatsApp desconectado - ${companyName}`;
```

### 3. Adicionar Escalação para Admin Global

```typescript
// Após enviar para o cliente, verificar se precisa escalar para admin global
const hoursDisconnected = instance.disconnected_since 
  ? (Date.now() - new Date(instance.disconnected_since).getTime()) / (1000 * 60 * 60)
  : 0;

if (hoursDisconnected >= ADMIN_ESCALATION_HOURS && globalAdminEmail) {
  // Enviar alerta para admin global também
  await resend.emails.send({
    from: "MIAUCHAT <onboarding@resend.dev>",
    to: [globalAdminEmail],
    subject: `🚨 Instância offline há ${Math.floor(hoursDisconnected)}h - ${companyName}`,
    html: escalationEmailHtml,
  });
}
```

### 4. Corrigir Event Type na UI

```typescript
// Em GlobalAdminAlertHistory.tsx - linha 57
INSTANCE_DISCONNECTION_ALERT: {  // Corrigir para o nome real usado no código
  label: "Instância Desconectada",
  icon: <AlertTriangle className="h-4 w-4" />,
  color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
},
```

### 5. Atualizar Stats no useNotificationLogs

```typescript
// Em useNotificationLogs.tsx
byType: {
  success: logs.filter(l => l.event_type === 'COMPANY_PROVISIONING_SUCCESS').length,
  failed: logs.filter(l => l.event_type === 'COMPANY_PROVISIONING_FAILED').length,
  partial: logs.filter(l => l.event_type === 'COMPANY_PROVISIONING_PARTIAL').length,
  integrationDown: logs.filter(l => l.event_type === 'INTEGRATION_DOWN').length,
  instanceDisconnected: logs.filter(l => l.event_type === 'INSTANCE_DISCONNECTION_ALERT').length, // NOVO
},
```

---

## Fluxo Final com Melhorias

```
┌─────────────────────────────────────────────────────────────────┐
│  SISTEMA DE ALERTAS MELHORADO                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Instância desconecta                                            │
│     ↓                                                            │
│  [5 min] Primeiro alerta enviado para cliente                   │
│     ↓                                                            │
│  Marca: alert_sent_for_current_disconnect = true                │
│     ↓                                                            │
│  [24h depois] Cliente não reconectou?                            │
│     ↓                                                            │
│  Envia LEMBRETE: "Ainda desconectado há X dias"                  │
│     ↓                                                            │
│  [48h depois] Ainda desconectado?                                │
│     ↓                                                            │
│  ESCALA para admin global: "Instância offline há 48h+"           │
│     ↓                                                            │
│  Cliente reconecta → Reset das flags → Ciclo reinicia           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Validação

- [ ] Primeiro alerta enviado após 5 min de desconexão
- [ ] Lembrete enviado após 24h se ainda desconectado
- [ ] Admin global notificado após 48h
- [ ] Event type consistente entre backend e frontend
- [ ] Logs com metadados ricos para análise
- [ ] Instâncias com `awaiting_qr` recebem lembrete após 24h

