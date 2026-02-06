

# Plano: Criar Mensagens Agendadas (Lembretes 1 e 2) via IA

## Problema Identificado

Quando a IA cria um agendamento, **não são criadas as mensagens agendadas de lembrete** na tabela `agenda_pro_scheduled_messages`. 

O código atual do `ai-chat/index.ts`:
1. Cria o agendamento na tabela `agenda_pro_appointments`
2. Chama a função `agenda-pro-notification` com `type: "created"` (notificação imediata)
3. ❌ **NÃO cria as mensagens agendadas de lembrete**

Enquanto o código do frontend (`useAgendaProAppointments.tsx` e `PublicBooking.tsx`):
1. Cria o agendamento
2. ✅ **Cria as mensagens agendadas** (lembrete 1, lembrete 2, pre_message)
3. Chama a notificação de confirmação

---

## Solução

Adicionar a lógica de criação de mensagens agendadas no `ai-chat/index.ts`, logo após a criação do agendamento e antes de chamar a notificação.

### Mensagens a serem criadas:

| Tipo | Quando é enviada | Condição |
|------|------------------|----------|
| `reminder` | X horas antes (configurável, padrão 24h) | Sempre (se `scheduled_at > now`) |
| `reminder_2` | X minutos antes (configurável) | Se `reminder_2_enabled = true` |
| `pre_message` | X horas antes | Se serviço tem `pre_message_enabled = true` |

---

## Alterações no Arquivo

### `supabase/functions/ai-chat/index.ts`

Adicionar após a linha que cria o agendamento (após linha ~1444) e antes de chamar a notificação:

```typescript
// Create scheduled reminder messages
try {
  const startTime = new Date(appointment.start_time || startTime.toISOString());
  const now = new Date();
  
  // Get settings for reminder configuration
  const { data: reminderSettings } = await supabase
    .from("agenda_pro_settings")
    .select("reminder_hours_before, reminder_2_enabled, reminder_2_value, reminder_2_unit, reminder_message_template, business_name")
    .eq("law_firm_id", lawFirmId)
    .single();
  
  const scheduledMessages: any[] = [];
  
  // Helper function to format message template
  const formatReminderMessage = (template: string | null, defaultMsg: string): string => {
    if (!template) return defaultMsg;
    const dateStr = startTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const timeStr = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    
    return template
      .replace(/{client_name}/g, client_name)
      .replace(/{service_name}/g, service.name)
      .replace(/{professional_name}/g, professionalData?.name || "Profissional")
      .replace(/{date}/g, dateStr)
      .replace(/{time}/g, timeStr)
      .replace(/{business_name}/g, reminderSettings?.business_name || companyName || "");
  };
  
  const defaultReminderTemplate = "Olá {client_name}! 👋 Lembramos que você tem um agendamento de {service_name} no dia {date} às {time}. Confirme sua presença!";
  
  // First reminder (configurable hours, default 24h)
  const reminder1Hours = reminderSettings?.reminder_hours_before || 24;
  const reminderTime = new Date(startTime.getTime() - reminder1Hours * 60 * 60 * 1000);
  
  if (reminderTime > now) {
    scheduledMessages.push({
      law_firm_id: lawFirmId,
      appointment_id: appointment.id,
      client_id: agendaProClientId,
      message_type: "reminder",
      message_content: formatReminderMessage(reminderSettings?.reminder_message_template, defaultReminderTemplate),
      scheduled_at: reminderTime.toISOString(),
      channel: "whatsapp",
      status: "pending",
    });
  }

  // Second reminder (configurable)
  if (reminderSettings?.reminder_2_enabled && reminderSettings?.reminder_2_value) {
    const reminder2Minutes = reminderSettings.reminder_2_unit === 'hours' 
      ? reminderSettings.reminder_2_value * 60 
      : reminderSettings.reminder_2_value;
    const reminder2Time = new Date(startTime.getTime() - reminder2Minutes * 60 * 1000);
    
    if (reminder2Time > now) {
      scheduledMessages.push({
        law_firm_id: lawFirmId,
        appointment_id: appointment.id,
        client_id: agendaProClientId,
        message_type: "reminder_2",
        message_content: formatReminderMessage(reminderSettings?.reminder_message_template, defaultReminderTemplate),
        scheduled_at: reminder2Time.toISOString(),
        channel: "whatsapp",
        status: "pending",
      });
    }
  }

  // Pre-message if service has it enabled
  if (service.pre_message_enabled && service.pre_message_hours_before) {
    const preMessageTime = new Date(startTime.getTime() - (service.pre_message_hours_before * 60 * 60 * 1000));
    
    if (preMessageTime > now) {
      scheduledMessages.push({
        law_firm_id: lawFirmId,
        appointment_id: appointment.id,
        client_id: agendaProClientId,
        message_type: "pre_message",
        message_content: service.pre_message_text || "Mensagem pré-atendimento",
        scheduled_at: preMessageTime.toISOString(),
        channel: "whatsapp",
        status: "pending",
      });
    }
  }

  // Insert all scheduled messages at once
  if (scheduledMessages.length > 0) {
    const { error: msgError } = await supabase
      .from("agenda_pro_scheduled_messages")
      .insert(scheduledMessages);
    
    if (msgError) {
      console.error("[Scheduling] Error creating scheduled messages:", msgError);
    } else {
      console.log(`[Scheduling] Created ${scheduledMessages.length} scheduled messages for appointment ${appointment.id}`);
    }
  }
} catch (scheduledMsgError) {
  console.error("[Scheduling] Error in scheduled messages creation:", scheduledMsgError);
}
```

Também preciso atualizar a query do serviço para incluir os campos de pre_message:

```typescript
// Na busca do serviço (linha ~1270), adicionar campos:
.select("id, name, duration_minutes, price, pre_message_enabled, pre_message_hours_before, pre_message_text")
```

---

## Resumo das Alterações

| Local | Alteração |
|-------|-----------|
| `ai-chat/index.ts` linha ~1270 | Adicionar campos `pre_message_*` na busca do serviço |
| `ai-chat/index.ts` linhas ~1445-1510 | Adicionar lógica de criação das mensagens agendadas |

---

## Fluxo Após Correção

```
IA recebe pedido de agendamento
       ↓
Cria agendamento na tabela agenda_pro_appointments
       ↓
✅ Cria mensagens agendadas (reminder, reminder_2, pre_message)
       ↓
Chama agenda-pro-notification (confirmação imediata)
       ↓
Cliente recebe confirmação agora + lembretes automáticos depois
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Agendamento via IA | Sem lembretes | ✅ Lembrete 1 (24h antes) |
| | | ✅ Lembrete 2 (55min antes, se configurado) |
| | | ✅ Pre-message (se serviço tiver) |
| Mensagens na aba "Mensagens Agendadas" | Não aparece | ✅ Aparece |

---

## Risco de Quebra

**Muito Baixo**
- Código adicional, não altera lógica existente
- Mesma estrutura já usada no frontend
- Fallbacks para configurações padrão
- Erros são capturados e logados sem interromper o fluxo

