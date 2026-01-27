
# Análise e Melhorias do Agenda Pro

## Resumo da Análise

O Agenda Pro é um módulo robusto de agendamentos com as seguintes funcionalidades já implementadas:
- Visualização de calendário (dia/semana/mês)
- Gestão de profissionais, serviços e salas
- Agendamento público online
- Sistema de confirmação via token
- Lembretes automáticos (1º e 2º lembrete configuráveis)
- Mensagens de aniversário
- Relatórios e métricas
- Integração com WhatsApp para notificações

---

## Melhorias Identificadas

### 1. UX/Interface

| Melhoria | Prioridade | Descrição |
|----------|------------|-----------|
| Lista de espera | Alta | Quando todos os horários estão ocupados, permitir que cliente entre em fila de espera |
| Busca rápida na agenda | Média | Campo de busca para encontrar agendamentos por nome/telefone do cliente |
| Drag-and-drop no calendário | Média | Arrastar agendamentos para reagendar visualmente |
| Indicador de conflitos | Alta | Mostrar aviso visual quando tentar agendar em horário já ocupado |
| Filtro por status no calendário | Baixa | Filtrar agendamentos por status (confirmado, pendente, etc.) |

### 2. Funcionalidades

| Melhoria | Prioridade | Descrição |
|----------|------------|-----------|
| Agendamentos recorrentes | Alta | Permitir criar série de agendamentos (semanal, mensal, etc.) |
| Bloqueio de horários | Alta | Profissional poder bloquear horários para folgas, reuniões, etc. |
| Pagamento online | Média | Integrar pagamento no agendamento público (Stripe/Asaas) |
| Fila de espera automática | Média | Quando houver cancelamento, notificar primeiro da fila |
| Histórico completo do cliente | Média | Ver todos os agendamentos passados e futuros de um cliente |
| Exportar agendamentos | Baixa | Exportar para Excel/PDF com filtros |

### 3. Comunicação

| Melhoria | Prioridade | Descrição |
|----------|------------|-----------|
| WhatsApp botão de confirmação | Alta | Usar botões interativos do WhatsApp em vez de link |
| Mensagem de agradecimento pós-atendimento | Média | Enviar mensagem automática após status "completed" |
| Pesquisa de satisfação | Média | Enviar NPS/pesquisa após atendimento concluído |
| Lembrete customizado por serviço | Baixa | Cada serviço ter seu próprio template de lembrete |

### 4. Relatórios e Métricas

| Melhoria | Prioridade | Descrição |
|----------|------------|-----------|
| Comparativo entre períodos | Média | Comparar métricas mês atual vs anterior |
| Taxa de ocupação por profissional | Média | % de slots disponíveis que foram preenchidos |
| Horários de pico | Média | Identificar horários mais demandados |
| Receita prevista vs realizada | Baixa | Comparar faturamento esperado com efetivo |

### 5. Técnico/Infraestrutura

| Melhoria | Prioridade | Descrição |
|----------|------------|-----------|
| Sincronização bidirecional Google Calendar | Baixa | Opcional - sincronizar com calendário pessoal |
| Webhook para integrações externas | Média | Notificar sistemas externos sobre eventos |
| Otimização de performance | Alta | Paginação na lista de agendamentos e clientes |
| Cache de disponibilidade | Média | Evitar recalcular slots disponíveis repetidamente |

---

## Plano de Implementação Recomendado

### Fase 1: Melhorias Críticas (Impacto Alto)

1. **Bloqueio de Horários**
   - Criar tabela `agenda_pro_blocked_slots`
   - Adicionar UI para profissional bloquear horários
   - Considerar bloqueios na verificação de disponibilidade

2. **Agendamentos Recorrentes**
   - Usar campo existente `is_recurring` e `recurrence_rule`
   - Implementar criação em lote
   - Opção de cancelar toda a série ou apenas um

3. **Busca Rápida**
   - Adicionar campo de busca no header do calendário
   - Buscar por nome ou telefone
   - Destacar resultado no calendário

### Fase 2: Comunicação Aprimorada

4. **Mensagem Pós-Atendimento**
   - Adicionar tipo "completed" nas notificações
   - Template configurável nas settings
   - Opção de incluir pesquisa de satisfação

5. **Fila de Espera**
   - Criar tabela `agenda_pro_waitlist`
   - Notificar quando vaga abrir
   - Interface para gerenciar lista

### Fase 3: Analytics Avançados

6. **Métricas Expandidas**
   - Taxa de ocupação
   - Comparativo temporal
   - Horários de pico

---

## Detalhamento Técnico - Fase 1

### 1.1 Bloqueio de Horários

**Tabela a criar:**
```sql
CREATE TABLE agenda_pro_blocked_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id UUID NOT NULL REFERENCES law_firms(id),
  professional_id UUID NOT NULL REFERENCES agenda_pro_professionals(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Arquivos a modificar:**
- `src/components/agenda-pro/AgendaProCalendar.tsx` - Exibir bloqueios
- `src/hooks/useAgendaProAppointments.tsx` - Criar hook `useAgendaProBlockedSlots`
- `src/components/agenda-pro/AgendaProNewAppointmentDialog.tsx` - Considerar bloqueios
- `src/pages/PublicBooking.tsx` - Excluir slots bloqueados

### 1.2 Busca Rápida

**Arquivo a modificar:**
- `src/components/agenda-pro/AgendaProCalendar.tsx`

Adicionar input de busca que:
- Filtra agendamentos localmente
- Destaca matching appointments
- Permite clicar para abrir detalhes

### 1.3 Agendamentos Recorrentes

**Arquivos a modificar:**
- `src/components/agenda-pro/AgendaProNewAppointmentDialog.tsx` - Adicionar opção de recorrência
- `src/hooks/useAgendaProAppointments.tsx` - Criar lógica de criação em lote
- `src/components/agenda-pro/AgendaProAppointmentSheet.tsx` - Opções para série

---

## Questão para o Usuário

Antes de implementar, gostaria de confirmar as prioridades. 

**Qual melhoria você gostaria de implementar primeiro?**

1. **Bloqueio de Horários** - Profissionais podem marcar folgas/reuniões
2. **Busca Rápida** - Campo de busca para encontrar agendamentos
3. **Agendamentos Recorrentes** - Criar série de atendimentos
4. **Mensagem Pós-Atendimento** - Agradecer após conclusão
5. **Outra** - Especifique qual melhoria prefere

---

## Arquivos que Serão Afetados (Fase 1)

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| Nova migration SQL | Criar tabela `agenda_pro_blocked_slots` |
| `src/hooks/useAgendaProBlockedSlots.tsx` | Novo hook |
| `src/components/agenda-pro/AgendaProCalendar.tsx` | Busca + bloqueios visuais |
| `src/components/agenda-pro/AgendaProNewAppointmentDialog.tsx` | Recorrência + validação |
| `src/components/agenda-pro/AgendaProProfessionals.tsx` | Botão para gerenciar bloqueios |
| `src/pages/PublicBooking.tsx` | Considerar bloqueios |
| `supabase/functions/agenda-pro-notification/index.ts` | Tipo "completed" |

---

## Garantias de Não-Regressão

1. Todas as funcionalidades existentes continuarão funcionando
2. Hooks existentes não serão quebrados
3. Edge Functions manterão compatibilidade
4. RLS será aplicado em novas tabelas
5. Testes manuais recomendados: criar, confirmar, cancelar, reagendar
