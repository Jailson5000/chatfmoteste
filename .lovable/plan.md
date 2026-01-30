

## Objetivo

Adicionar configurações de fim de semana (Sábado e Domingo) na seção "Horário de Funcionamento" da Agenda Pro, permitindo:
1. Ativar/desativar trabalho no sábado
2. Ativar/desativar trabalho no domingo  
3. Definir horários específicos para esses dias quando ativados

---

## Situação Atual

### Banco de Dados (`agenda_pro_settings`)
- Tem apenas `default_start_time` e `default_end_time` (horário único para todos os dias)
- Não há campos para configurar dias específicos da semana

### Tabela `agenda_pro_working_hours`
- Já existe para profissionais individuais
- Permite configurar por `day_of_week` (0=Domingo, 1=Segunda, ... 6=Sábado)
- Quando um profissional é criado, apenas dias 1-5 (Segunda a Sexta) recebem horários padrão

### Interface Atual
- Card simples com "Início" e "Término" (horário único)
- Não mostra opções para fim de semana

---

## Solução Proposta

### 1) Migração do Banco de Dados

Adicionar 6 novas colunas na tabela `agenda_pro_settings`:

```sql
-- Sábado (day_of_week = 6)
ALTER TABLE agenda_pro_settings
  ADD COLUMN saturday_enabled boolean DEFAULT false,
  ADD COLUMN saturday_start_time time DEFAULT '08:00',
  ADD COLUMN saturday_end_time time DEFAULT '12:00';

-- Domingo (day_of_week = 0)
ALTER TABLE agenda_pro_settings
  ADD COLUMN sunday_enabled boolean DEFAULT false,
  ADD COLUMN sunday_start_time time DEFAULT '08:00',
  ADD COLUMN sunday_end_time time DEFAULT '12:00';
```

### 2) Atualizar Interface (`AgendaProSettings.tsx`)

Expandir o card "Horário de Funcionamento" para incluir:

```
┌────────────────────────────────────────────────────────────┐
│ Horário de Funcionamento                                   │
│ Define o horário padrão para novos profissionais           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Dias Úteis (Segunda a Sexta)                               │
│ ┌──────────────┐      ┌──────────────┐                     │
│ │ Início       │      │ Término      │                     │
│ │   08:00      │      │   18:00      │                     │
│ └──────────────┘      └──────────────┘                     │
│                                                            │
│ ────────────────────────────────────────────────────────── │
│                                                            │
│ [Switch] Trabalha aos Sábados                              │
│   Quando ativo:                                            │
│   ┌──────────────┐      ┌──────────────┐                   │
│   │ Início       │      │ Término      │                   │
│   │   08:00      │      │   12:00      │                   │
│   └──────────────┘      └──────────────┘                   │
│                                                            │
│ [Switch] Trabalha aos Domingos                             │
│   Quando ativo:                                            │
│   ┌──────────────┐      ┌──────────────┐                   │
│   │ Início       │      │ Término      │                   │
│   │   08:00      │      │   12:00      │                   │
│   └──────────────┘      └──────────────┘                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3) Atualizar Hook (`useAgendaPro.tsx`)

Adicionar os novos campos ao tipo `AgendaProSettings`:
- `saturday_enabled: boolean`
- `saturday_start_time: string`
- `saturday_end_time: string`
- `sunday_enabled: boolean`
- `sunday_start_time: string`
- `sunday_end_time: string`

### 4) Atualizar Criação de Profissionais

Em `useAgendaProProfessionals.tsx`, ao criar um novo profissional, usar as configurações de fim de semana para definir os horários padrão:

```typescript
// Hoje: apenas dias 1-5
const defaultHours = [1, 2, 3, 4, 5].map((day) => ({...}));

// Novo: incluir 6 (sábado) e 0 (domingo) se habilitados nas settings
if (settings.saturday_enabled) {
  defaultHours.push({
    day_of_week: 6,
    start_time: settings.saturday_start_time,
    end_time: settings.saturday_end_time,
    is_enabled: true
  });
}
```

### 5) Usar no Agendamento Público

Em `PublicBooking.tsx`, considerar os dias habilitados ao gerar slots:
- Se sábado/domingo não estiver habilitado nas settings, não permitir agendamento nesses dias (quando profissional não tem configuração específica)

---

## Arquivos a Serem Modificados

| Arquivo | Mudança |
|---------|---------|
| `supabase/migrations/xxx.sql` | Adicionar 6 colunas para fim de semana |
| `src/hooks/useAgendaPro.tsx` | Adicionar campos ao tipo e formulário |
| `src/components/agenda-pro/AgendaProSettings.tsx` | Expandir UI com switches e horários |
| `src/hooks/useAgendaProProfessionals.tsx` | Usar settings de fim de semana ao criar profissional |
| `src/pages/PublicBooking.tsx` | (Opcional) Considerar dias habilitados no fallback |

---

## Benefícios

1. **Configuração Centralizada** - Define padrões globais para fim de semana em um só lugar
2. **Herança para Profissionais** - Novos profissionais herdam automaticamente as configurações
3. **Flexibilidade** - Cada profissional ainda pode sobrescrever individualmente
4. **UX Melhorada** - Interface clara com switches e horários específicos

---

## Validações

- Horários de fim de semana só editáveis quando switch está ativo
- Validar formato HH:MM antes de salvar
- Garantir que horário de término é maior que início

