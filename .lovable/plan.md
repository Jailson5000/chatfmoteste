

# Plano: Corrigir Agendamento via IA - Horários e Notificações

## Problemas Identificados

### Problema 1: Notificações não são enviadas ao cliente
**Causa**: O código em `ai-chat/index.ts` (linha 1401) está passando `type: "confirmation"`, mas a função `agenda-pro-notification` só aceita os tipos: `created`, `reminder`, `cancelled`, `updated`, `no_show`.

```typescript
// ATUAL - ERRADO (linha 1401)
body: JSON.stringify({
  appointment_id: appointment.id,
  type: "confirmation"  // ❌ Tipo inválido
}),

// CORRETO
body: JSON.stringify({
  appointment_id: appointment.id,
  type: "created"  // ✅ Tipo correto
}),
```

### Problema 2: Horários não respeitam a configuração da empresa
**Causa**: A função `get_available_slots` busca horários diretamente da tabela `agenda_pro_working_hours` (configuração individual dos profissionais), mas **ignora** as configurações padrão de `agenda_pro_settings` (10:00-16:30).

**Situação atual no banco**:
- `agenda_pro_settings`: `default_start_time: 10:00`, `default_end_time: 16:30`, sábado: `08:00-12:00`
- `agenda_pro_working_hours` (profissionais): `08:00-18:00`

A IA usa os horários dos profissionais (08:00-18:00) ao invés de respeitar o `respect_business_hours` das configurações.

---

## Correções Propostas

### Correção 1: Tipo de notificação (CRÍTICO)
**Arquivo**: `supabase/functions/ai-chat/index.ts`
**Linha**: 1401

Alterar `type: "confirmation"` para `type: "created"`.

### Correção 2: Respeitar horário comercial nas consultas de disponibilidade
**Arquivo**: `supabase/functions/ai-chat/index.ts`
**Local**: Função `get_available_slots` (linhas 1100-1215)

Modificar para:
1. Buscar as configurações da empresa (`agenda_pro_settings`)
2. Se `respect_business_hours = true`, filtrar slots para respeitar `default_start_time` e `default_end_time`
3. Verificar se sábado/domingo estão habilitados antes de mostrar horários

---

## Detalhes Técnicos das Correções

### Correção 1 - Alterar tipo de notificação
```typescript
// Linha 1399-1402 de ai-chat/index.ts
body: JSON.stringify({
  appointment_id: appointment.id,
  type: "created"  // Alterado de "confirmation" para "created"
}),
```

### Correção 2 - Respeitar horário comercial
Adicionar após linha 1087 (busca do dayOfWeek):

```typescript
// Get business settings to respect business hours
const { data: businessSettings } = await supabase
  .from("agenda_pro_settings")
  .select("default_start_time, default_end_time, respect_business_hours, saturday_enabled, saturday_start_time, saturday_end_time, sunday_enabled, sunday_start_time, sunday_end_time")
  .eq("law_firm_id", lawFirmId)
  .maybeSingle();

// Check if day is enabled based on settings
if (dayOfWeek === 0 && (!businessSettings?.sunday_enabled)) {
  return JSON.stringify({
    success: true,
    message: `Não atendemos aos domingos.`,
    available_slots: []
  });
}
if (dayOfWeek === 6 && (!businessSettings?.saturday_enabled)) {
  return JSON.stringify({
    success: true,
    message: `Não atendemos aos sábados.`,
    available_slots: []
  });
}

// Determine effective business hours for this day
let effectiveStartTime = "08:00:00";
let effectiveEndTime = "18:00:00";

if (businessSettings?.respect_business_hours) {
  if (dayOfWeek === 6) {
    effectiveStartTime = businessSettings.saturday_start_time || "08:00:00";
    effectiveEndTime = businessSettings.saturday_end_time || "12:00:00";
  } else if (dayOfWeek === 0) {
    effectiveStartTime = businessSettings.sunday_start_time || "08:00:00";
    effectiveEndTime = businessSettings.sunday_end_time || "12:00:00";
  } else {
    effectiveStartTime = businessSettings.default_start_time || "08:00:00";
    effectiveEndTime = businessSettings.default_end_time || "18:00:00";
  }
}
```

E modificar o loop de geração de slots (linha 1119-1132) para filtrar pelos horários comerciais:

```typescript
for (const wh of workingHours) {
  // Apply business hours filter if respect_business_hours is enabled
  let whStartTime = wh.start_time;
  let whEndTime = wh.end_time;
  
  if (businessSettings?.respect_business_hours) {
    // Use the later of professional start or business start
    if (whStartTime < effectiveStartTime) {
      whStartTime = effectiveStartTime;
    }
    // Use the earlier of professional end or business end
    if (whEndTime > effectiveEndTime) {
      whEndTime = effectiveEndTime;
    }
  }
  
  const startParts = whStartTime.split(":");
  const endParts = whEndTime.split(":");
  // ... resto do código
}
```

---

## Resumo das Alterações

| Arquivo | Alteração | Impacto |
|---------|-----------|---------|
| `ai-chat/index.ts` linha 1401 | `"confirmation"` → `"created"` | Notificações WhatsApp funcionarão |
| `ai-chat/index.ts` linhas 1087+ | Buscar e aplicar `agenda_pro_settings` | Horários corretos (10:00-16:30) |
| `ai-chat/index.ts` loop 1119 | Filtrar slots por horário comercial | Só mostra horários disponíveis reais |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Horários mostrados | 08:00 às 18:00 | 10:00 às 16:30 (dias de semana) |
| Sábado | 08:00 às 18:00 | 08:00 às 12:00 |
| Domingo | Mostra horários | "Não atendemos aos domingos" |
| Notificação WhatsApp | Não enviada | Enviada ao cliente |
| Notificação profissional | Não enviada | Enviada (se configurado) |

---

## Risco de Quebra

**Baixo**
- Correção 1: Mudança simples de string
- Correção 2: Adiciona filtro de horário sem alterar lógica existente
- Não afeta outros fluxos de agendamento (manual, público)

