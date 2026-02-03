
# Plano de Correções: Agenda Pro

## Problemas Identificados

| # | Problema | Causa Raiz |
|---|----------|------------|
| 1 | Mensagens não enviadas para profissionais em agendamentos manuais | A lógica de notificação só dispara para `source === "online"` ou `source === "public_booking"` (linha 608). Agendamentos manuais têm `source === "manual"` e são ignorados |
| 2 | Mensagem vai para profissional errado quando cliente não escolhe | RPC seleciona o primeiro profissional disponível (por posição), mas isso está funcionando corretamente. O problema é que **o horário pode já estar ocupado** para aquele profissional e o sistema não verifica antes de criar |
| 3 | Horários ocupados não aparecem quando não escolhe profissional | Quando `selectedProfessional` é null, a query de agendamentos NÃO filtra por profissional específico, então busca TODOS os agendamentos da empresa. Isso deveria funcionar, MAS a RPC vai escolher o primeiro profissional, então deveria buscar slots de TODOS os profissionais e mostrar só os disponíveis em pelo menos um |
| 4 | Aba "Salas" não tem função | O módulo existe mas não está integrado à criação de agendamentos - pode ser removido ou ocultado |
| 5 | Botão "Enviar Agora" em Reminders não funciona | O `sendNow` chama a edge function `agenda-pro-notification` com tipo `reminder`, que espera o agendamento existir. O problema é que a função tenta usar o `appointment.source` para decidir se envia para o profissional, mas para lembretes isso não se aplica |

---

## Correção 1: Notificar Profissional em Agendamentos Manuais

### Problema Atual
```typescript
// supabase/functions/agenda-pro-notification/index.ts (linha 608)
if (type === "created" && (appointment.source === "online" || appointment.source === "public_booking")) {
  // Só envia notificação ao profissional se source for online ou public_booking
}
```

### Solução
Incluir `source === "manual"` na condição, com opção de respeitar o campo `notify_new_appointment` do profissional:

```typescript
if (type === "created" && (
  appointment.source === "online" || 
  appointment.source === "public_booking" || 
  appointment.source === "manual"
)) {
```

**Arquivo:** `supabase/functions/agenda-pro-notification/index.ts`
**Linha:** 608

---

## Correção 2 e 3: Verificar Disponibilidade Antes de Criar Agendamento

### Problema Atual
A RPC `create_public_booking_appointment` seleciona o primeiro profissional ativo, mas **não verifica se ele está disponível no horário solicitado**.

### Solução
Modificar a RPC para:
1. Se `_professional_id` é NULL, buscar **todos** os profissionais do serviço
2. Para cada um, verificar se há conflito de horário
3. Selecionar o primeiro que estiver **livre** naquele horário
4. Se nenhum estiver livre, retornar erro "Horário não disponível"

```sql
-- Quando não escolhe profissional, encontrar um disponível
IF _professional_id IS NULL THEN
  SELECT p.id, p.name
  INTO _professional
  FROM public.agenda_pro_professionals p
  INNER JOIN public.agenda_pro_service_professionals sp ON sp.professional_id = p.id
  WHERE p.law_firm_id = _law_firm_id
    AND p.is_active = true
    AND sp.service_id = _service_id
    -- Excluir profissionais com conflito de horário
    AND NOT EXISTS (
      SELECT 1 FROM public.agenda_pro_appointments apt
      WHERE apt.professional_id = p.id
        AND apt.status NOT IN ('cancelled', 'no_show')
        AND apt.start_time < _start_time + (_duration_minutes || ' minutes')::interval
        AND apt.end_time > _start_time
    )
  ORDER BY p.position NULLS LAST, p.name
  LIMIT 1;
  
  IF _professional IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nenhum profissional disponível neste horário'
    );
  END IF;
END IF;
```

**Tipo:** Migração SQL

---

## Correção 3 (Complemento): Mostrar Slots Corretamente no Frontend

### Problema Atual
Quando o cliente não escolhe profissional, o frontend busca TODOS os agendamentos do dia. Isso pode marcar um slot como ocupado mesmo que outros profissionais estejam livres.

### Solução
Quando `selectedProfessional` é null, buscar os horários de trabalho e agendamentos de **todos** os profissionais vinculados ao serviço. Um slot só está disponível se **pelo menos um profissional** está livre.

```typescript
// src/pages/PublicBooking.tsx - loadAvailableSlots()

// Quando não tem profissional selecionado, verificar disponibilidade em qualquer um
if (!selectedProfessional && serviceProfessionals.length > 0) {
  // Para cada profissional, verificar se tem conflito no horário
  // Slot está disponível se PELO MENOS UM profissional está livre
  const hasConflict = serviceProfessionals.every(prof => {
    // Verificar se este profissional tem conflito
    return existingAppointments?.some(apt => {
      if (apt.professional_id !== prof.id) return false;
      const aptStart = parseISO(apt.start_time);
      const aptEnd = parseISO(apt.end_time);
      return (currentTime >= aptStart && currentTime < aptEnd) ||
             (slotEnd > aptStart && slotEnd <= aptEnd) ||
             (currentTime <= aptStart && slotEnd >= aptEnd);
    });
  });
}
```

**Arquivo:** `src/pages/PublicBooking.tsx`
**Função:** `loadAvailableSlots()`

**Mudança necessária:** Buscar também `professional_id` na query de agendamentos e armazenar os IDs dos profissionais do serviço.

---

## Correção 4: Ocultar ou Remover Aba "Salas"

### Opções

| Opção | Descrição |
|-------|-----------|
| A | **Remover completamente** - Deletar arquivos e referências |
| B | **Ocultar temporariamente** - Manter código mas esconder da UI |

### Solução Recomendada: Ocultar
Comentar/remover a aba "Salas" do `AgendaPro.tsx` enquanto a funcionalidade não está completa.

```tsx
// src/pages/AgendaPro.tsx

// REMOVER esta tab trigger:
<TabsTrigger value="resources" className="flex items-center gap-1.5 px-3 py-2">
  <Building2 className="h-4 w-4" />
  <span className="hidden sm:inline text-sm">Salas</span>
</TabsTrigger>

// REMOVER este TabsContent:
<TabsContent value="resources" className="mt-6">
  <AgendaProResources />
</TabsContent>
```

**Arquivos:**
- `src/pages/AgendaPro.tsx` - Remover tab e content

---

## Correção 5: Desabilitar "Enviar Agora" para Reminders Automáticos

### Problema Atual
O botão "Enviar Agora" aparece para mensagens do tipo `reminder` e `pre_message`, mas essas são mensagens **automáticas** geradas a partir de agendamentos. A função `agenda-pro-notification` não foi projetada para enviar lembretes manualmente sob demanda.

### Solução
Esconder o botão "Enviar Agora" para mensagens automáticas (reminder e pre_message) e mostrar um tooltip explicativo.

```tsx
// src/components/agenda-pro/AgendaProScheduledMessages.tsx

// Identificar mensagens automáticas (reminder, pre_message)
const isAutoMessage = (message: ScheduledMessage) => {
  return message.type === "reminder" || message.type === "pre_message";
};

// Na UI, trocar o botão por um badge informativo
{message.appointment_id && !isAutoMessage(message) && (
  <Button
    variant="ghost"
    size="icon"
    onClick={() => sendNow.mutate(message)}
    disabled={sendNow.isPending}
    title="Enviar agora"
  >
    <Send className="h-4 w-4" />
  </Button>
)}

{isAutoMessage(message) && (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="p-2 cursor-help">
        <Clock className="h-4 w-4 text-muted-foreground" />
      </div>
    </TooltipTrigger>
    <TooltipContent>
      <p>Envio automático agendado</p>
    </TooltipContent>
  </Tooltip>
)}
```

**Arquivo:** `src/components/agenda-pro/AgendaProScheduledMessages.tsx`

---

## Resumo de Arquivos a Modificar

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `supabase/functions/agenda-pro-notification/index.ts` | Edge Function | Incluir `source === "manual"` para notificar profissionais |
| Migração SQL | Database | Atualizar RPC para verificar disponibilidade antes de selecionar profissional |
| `src/pages/PublicBooking.tsx` | Frontend | Mostrar slots corretos quando não escolhe profissional |
| `src/pages/AgendaPro.tsx` | Frontend | Remover aba "Salas" |
| `src/components/agenda-pro/AgendaProScheduledMessages.tsx` | Frontend | Desabilitar "Enviar Agora" para reminders com aviso |

---

## Fluxo Corrigido

```text
AGENDAMENTO MANUAL:
  → Cria agendamento com source="manual"
  → Chama agenda-pro-notification type="created"
  → ANTES: Não notifica profissional ❌
  → DEPOIS: Notifica profissional se notify_new_appointment=true ✅

AGENDAMENTO PÚBLICO SEM ESCOLHER PROFISSIONAL:
  → Cliente seleciona serviço
  → Vê horários disponíveis (em pelo menos 1 profissional)
  → Escolhe horário
  → RPC busca profissional DISPONÍVEL no horário
  → ANTES: Pega primeiro da lista (pode estar ocupado) ❌
  → DEPOIS: Pega primeiro que está LIVRE ✅
  → Cria agendamento e notifica profissional correto ✅

MENSAGENS AUTOMÁTICAS:
  → ANTES: Botão "Enviar Agora" aparece mas não funciona corretamente ❌
  → DEPOIS: Mostra ícone de relógio com tooltip "Envio automático agendado" ✅
```

---

## Segurança e Isolamento

| Aspecto | Status |
|---------|--------|
| Tenant isolation | Mantido (todas as queries usam `law_firm_id`) |
| RLS policies | Não afetadas |
| Funcionalidades existentes | Sem impacto em Chat, Kanban, Tarefas, etc. |

---

## Ordem de Implementação

1. **Migração SQL** - Atualizar RPC `create_public_booking_appointment`
2. **Edge Function** - Modificar `agenda-pro-notification` para incluir `manual`
3. **Frontend PublicBooking** - Corrigir lógica de slots disponíveis
4. **Frontend AgendaPro** - Remover aba Salas
5. **Frontend ScheduledMessages** - Desabilitar botão para reminders

