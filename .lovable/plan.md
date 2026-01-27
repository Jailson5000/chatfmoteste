
# Plano: Remoção Completa da Integração Google Calendar

## Resumo

Remover todos os arquivos, hooks, componentes e referências ao Google Calendar, já que o sistema agora utiliza a Agenda Pro como solução de agendamento. A remoção deve ser feita de forma cuidadosa para não afetar outras funcionalidades.

---

## Mapeamento Completo de Arquivos a Remover/Modificar

### Arquivos a DELETAR

| Arquivo | Tipo | Razão |
|---------|------|-------|
| src/hooks/useGoogleCalendar.tsx | Hook | Hook principal da integração |
| src/components/settings/GoogleCalendarCard.tsx | Componente | Card de configuração obsoleto |
| src/components/settings/integrations/GoogleCalendarIntegration.tsx | Componente | Card de integração obsoleto |
| src/pages/GoogleCalendarCallback.tsx | Página | Callback do OAuth |
| src/pages/Calendar.tsx | Página | Visualização de eventos Google |
| src/pages/Agenda.tsx | Página | Agenda antiga baseada em Google Calendar |
| src/assets/google-calendar-icon.png | Asset | Ícone não mais utilizado |
| supabase/functions/google-calendar-auth/ | Edge Function | Autenticação OAuth |
| supabase/functions/google-calendar-actions/ | Edge Function | Ações de calendário |
| supabase/functions/google-calendar-sync/ | Edge Function | Sincronização |

### Arquivos a MODIFICAR

| Arquivo | Alteração |
|---------|-----------|
| src/App.tsx | Remover rota /integrations/google-calendar/callback e import |
| src/components/layout/AppSidebar.tsx | Remover useGoogleCalendar e lógica showAgenda |
| src/components/settings/IntegrationsSettings.tsx | Remover menção ao Google Calendar |
| src/hooks/useAppointments.tsx | Remover função createGoogleCalendarEvent e referências |
| supabase/functions/ai-chat/index.ts | Remover CALENDAR_TOOLS e funções relacionadas |
| src/pages/landing/LandingPage.tsx | Atualizar texto (opcional - pode manter como "em breve") |

---

## Análise de Impacto

### Funcionalidades que NÃO serão afetadas

| Funcionalidade | Razão |
|----------------|-------|
| Agenda Pro | Sistema independente com tabelas próprias (agenda_pro_*) |
| Agendamento Público | Usa Agenda Pro, não Google Calendar |
| Confirmações e Lembretes | Usa Edge Functions próprias (agenda-pro-*) |
| Chat com IA | Mantém SCHEDULING_TOOLS para Agenda Pro |
| Kanban | Independente |
| Conversas | Independente |
| Dashboard | Métricas não dependem de Google Calendar |

### Funcionalidades que SERÃO removidas

| Funcionalidade | Substituição |
|----------------|--------------|
| Visualizar Google Calendar | Usar Agenda Pro |
| Criar eventos no Google | Usar Agenda Pro |
| Sync com Google Calendar | Não necessário - Agenda Pro é autônoma |
| Página /agenda | Redirecionar para /agenda-pro |
| Página /calendar | Remover completamente |

---

## Detalhamento das Modificações

### 1. src/App.tsx

Remover:
- Import do GoogleCalendarCallback
- Rota /integrations/google-calendar/callback
- Import do Agenda (página antiga)
- Rota /agenda que usa a página antiga

Manter redirecionamento /agenda -> /agenda-pro para não quebrar links existentes.

### 2. src/components/layout/AppSidebar.tsx

```typescript
// REMOVER
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";

// REMOVER
const {
  integration: googleCalendarIntegration,
  isConnected: isGoogleCalendarConnected,
} = useGoogleCalendar();

const showAgenda = isGoogleCalendarConnected && !!googleCalendarIntegration?.is_active;

// SIMPLIFICAR bottomMenuItems para sempre mostrar apenas Agenda Pro
const bottomMenuItems = isAttendant
  ? [agendaProItem, tasksItem, settingsItem, supportItem, tutorialsItem]
  : [agendaProItem, tasksItem, ...adminOnlyItems, settingsItem, supportItem, tutorialsItem];
```

### 3. src/components/settings/IntegrationsSettings.tsx

Remover o card de Google Calendar "Coming Soon" - já que removemos a funcionalidade.

### 4. src/hooks/useAppointments.tsx

```typescript
// REMOVER linhas 55-112 (função createGoogleCalendarEvent)

// REMOVER linha 186-197 no createAppointment:
// const googleEventId = await createGoogleCalendarEvent(...)
// if (googleEventId) { ... }

// REMOVER linha 213:
// queryClient.invalidateQueries({ queryKey: ["google-calendar-events"] });
```

### 5. supabase/functions/ai-chat/index.ts

```typescript
// REMOVER linhas 159-300 (CALENDAR_TOOLS definition)
// REMOVER linhas 575-600 (checkGoogleCalendarIntegration function)
// REMOVER linhas 602-620 (getCalendarTools function)
// REMOVER linhas 655-750 (executeCalendarTool function)
// MODIFICAR getAllAvailableTools para não incluir calendar tools
```

---

## Sequência de Implementação

| Fase | Ação | Risco |
|------|------|-------|
| 1 | Remover hooks e componentes de UI | Baixo |
| 2 | Remover páginas obsoletas | Baixo |
| 3 | Modificar AppSidebar | Baixo |
| 4 | Modificar useAppointments | Baixo |
| 5 | Modificar IntegrationsSettings | Baixo |
| 6 | Modificar App.tsx (rotas) | Baixo |
| 7 | Modificar ai-chat edge function | Médio |
| 8 | Deletar edge functions do Google | Baixo |
| 9 | Remover asset (ícone) | Baixo |

---

## Rotas a Atualizar

| Rota Antiga | Ação |
|-------------|------|
| /calendar | Remover completamente |
| /agenda | Redirecionar para /agenda-pro |
| /integrations/google-calendar/callback | Remover |

---

## Edge Functions a Deletar

As seguintes Edge Functions serão deletadas do Supabase:

1. google-calendar-auth
2. google-calendar-actions
3. google-calendar-sync

**Nota:** As tabelas do banco de dados (google_calendar_integrations, google_calendar_events, google_calendar_ai_logs) podem ser mantidas temporariamente para preservar histórico, ou removidas via migração separada.

---

## Testes de Regressão

Após a remoção, verificar:

1. **Agenda Pro** - Criar, editar, cancelar agendamentos funciona
2. **Agendamento Público** - /agendar/:slug funciona normalmente
3. **Confirmação** - /confirmar funciona normalmente
4. **IA com Agendamento** - SCHEDULING_TOOLS continua funcionando
5. **Sidebar** - Agenda Pro aparece para todos os usuários
6. **Settings** - Página de integrações não mostra Google Calendar ativo
7. **useAppointments** - Criar agendamento não tenta criar evento Google

---

## Garantias de Não-Regressão

1. Agenda Pro é completamente independente do Google Calendar
2. SCHEDULING_TOOLS no ai-chat são separados de CALENDAR_TOOLS
3. Tabelas agenda_pro_* não têm relação com google_calendar_*
4. Edge Functions agenda-pro-* não dependem de google-calendar-*
5. Rota /agenda será redirecionada para /agenda-pro

---

## Observações sobre Banco de Dados

As seguintes tabelas/views relacionadas ao Google Calendar existem mas NÃO serão removidas nesta operação (podem ser limpas posteriormente via migração):

- google_calendar_integrations
- google_calendar_integrations_safe (view)
- google_calendar_integration_status (view)
- google_calendar_events
- google_calendar_ai_logs

**Razão:** Remover tabelas requer migração separada e pode conter dados históricos que o cliente deseje preservar.
