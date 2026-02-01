

# Plano: Limitar Alertas de Desconexão a 2 Dias

## Problema Identificado

Atualmente, o sistema envia alertas infinitamente enquanto a instância estiver desconectada:
- **Primeiro alerta**: após 5 minutos de desconexão
- **Lembretes**: a cada 24 horas (sem limite)
- **Escalação para admin global**: após 48 horas

O usuário recebeu e-mail informando desconexão há 15 dias, indicando que os lembretes continuam sendo enviados indefinidamente.

## Configuração Atual (Linhas 11-14)

```typescript
const ALERT_THRESHOLD_MINUTES = 5;        // Primeiro alerta após 5 min
const CONNECTING_ALERT_THRESHOLD_MINUTES = 10; // Alerta se preso conectando por 10 min
const REMINDER_THRESHOLD_HOURS = 24;       // Lembrete após 24h ← repete infinitamente
const ADMIN_ESCALATION_HOURS = 48;         // Escalação após 48h
```

## Solução Proposta

Adicionar uma nova constante `MAX_ALERT_DURATION_HOURS = 48` (2 dias) para limitar o período de alertas:

| Constante | Valor Antes | Valor Depois | Descrição |
|-----------|-------------|--------------|-----------|
| `MAX_ALERT_DURATION_HOURS` | (não existe) | 48 | **Nova** - Para de alertar após 2 dias |
| `ADMIN_ESCALATION_HOURS` | 48 | 48 | Mantém - escalação final para admin |
| `REMINDER_THRESHOLD_HOURS` | 24 | 24 | Mantém - intervalo entre lembretes |

## Fluxo de Alertas Após Correção

```text
Desconectado
    │
    ├── 5 min ─────► 1º Alerta ao cliente
    │
    ├── 24h ───────► 2º Alerta (lembrete) ao cliente  
    │
    ├── 48h ───────► 3º Alerta + Escalação ao admin global
    │                         │
    │                         └──► ÚLTIMO ALERTA
    │
    └── > 48h ─────► ✋ PARA de enviar alertas
                     (cliente decidiu manter desconectado)
```

## Alterações Técnicas

### Arquivo: `supabase/functions/check-instance-alerts/index.ts`

**1. Adicionar constante de limite (linha 15)**
```typescript
const MAX_ALERT_DURATION_HOURS = 48; // Stop alerting after 2 days
```

**2. Adicionar filtro para instâncias com mais de 48h (linhas 99-128)**

Na lógica de filtro, antes de permitir lembretes, verificar se já passou do limite máximo:

```typescript
// Filter instances - improved logic with reminder support
const instances = (rawInstances || []).filter((instance: DisconnectedInstance) => {
  // Skip if manually disconnected
  if (instance.manual_disconnect === true) {
    console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: manual_disconnect=true`);
    return false;
  }

  // NEW: Check if disconnected for more than MAX_ALERT_DURATION_HOURS - stop alerting
  if (instance.disconnected_since) {
    const hoursSinceDisconnect = (Date.now() - new Date(instance.disconnected_since).getTime()) / (1000 * 60 * 60);
    if (hoursSinceDisconnect >= MAX_ALERT_DURATION_HOURS) {
      console.log(`[Check Instance Alerts] Skipping ${instance.instance_name}: exceeded ${MAX_ALERT_DURATION_HOURS}h limit (${hoursSinceDisconnect.toFixed(1)}h disconnected)`);
      return false;
    }
  }

  // ... rest of the existing logic
});
```

**3. Atualizar mensagens de rodapé dos e-mails (linhas 335-337)**

Atualizar o texto informativo no e-mail:

```typescript
const footerMessage = isReminderAlert
  ? 'Este é um lembrete automático. Você receberá um último alerta após 48h de desconexão.'
  : 'Este alerta é enviado uma única vez por desconexão. Você receberá lembretes até 48h.';
```

## Impacto

| Cenário | Antes | Depois |
|---------|-------|--------|
| Desconectado 15 dias | Recebe e-mail | **Não recebe** |
| Desconectado 3 dias | Recebe e-mail | **Não recebe** |
| Desconectado 47h | Recebe e-mail | Recebe e-mail |
| Desconectado 24h | Recebe lembrete | Recebe lembrete |
| Desconectado 5min | Recebe primeiro alerta | Recebe primeiro alerta |

## Resultado Esperado

1. Cliente recebe **no máximo 3 alertas**: 5min, 24h, 48h
2. Após 48h, sistema **para de enviar** lembretes
3. Admin global ainda recebe **uma** escalação quando atinge 48h
4. Cliente que deseja manter desconectado não será mais importunado

