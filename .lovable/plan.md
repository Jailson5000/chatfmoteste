

# Plano: Alertas de Tarefas e Identificação Visual de Concluídas

## Resumo das Solicitações

1. **Configurações de Alertas de Tarefas** - Botão de configurações ao lado do Dashboard para configurar alertas 24h antes do vencimento, enviados via email/WhatsApp, dentro do horário comercial, com opção de ativar/desativar por tarefa
2. **Identificação Visual de Tarefas Concluídas no Kanban** - Cards na coluna "Concluído" devem ter visual diferenciado (cor mais clara, badge verde, etc.)

---

## Parte 1: Identificação Visual de Tarefas Concluídas

### Objetivo
Destacar visualmente os cards de tarefas quando estão na coluna "Concluído", tornando mais fácil identificar que foram finalizadas.

### Alterações no `TaskKanbanCard.tsx`

Adicionar estilos condicionais para quando `task.status === "done"`:

- **Fundo mais claro/esmaecido**: `bg-muted/50` ou `opacity-75`
- **Badge verde "Concluído"** ao lado da prioridade
- **Texto com riscado** no título (como já existe na lista)
- **Borda verde sutil**

```tsx
// Exemplo de estilos condicionais
const isDone = task.status === "done";

className={cn(
  "bg-card border rounded-lg p-3 cursor-pointer ...",
  isDone && "opacity-75 bg-muted/40 border-green-200 dark:border-green-800"
)}

// Badge de concluído
{isDone && (
  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
    ✓ Concluído
  </Badge>
)}

// Título com riscado
<h4 className={cn("font-medium text-sm", isDone && "line-through text-muted-foreground")}>
```

### Arquivos Modificados
- `src/components/tasks/TaskKanbanCard.tsx`

---

## Parte 2: Configurações e Alertas de Tarefas

### Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Tasks.tsx                                                          │
│    └─► Botão "Alertas" (ao lado do Dashboard)                       │
│         └─► TaskAlertsSettingsDialog.tsx (modal de configurações)   │
│                                                                     │
│  NewTaskDialog.tsx / TaskDetailSheet.tsx                            │
│    └─► Toggle "Enviar alerta de vencimento" (por tarefa)            │
├─────────────────────────────────────────────────────────────────────┤
│                    BACKEND (Supabase)                               │
├─────────────────────────────────────────────────────────────────────┤
│  law_firm_settings (adicionar colunas)                              │
│    └─► task_alert_enabled: boolean                                  │
│    └─► task_alert_hours_before: integer (padrão 24)                 │
│    └─► task_alert_channels: jsonb (["email", "whatsapp"])           │
│                                                                     │
│  internal_tasks (adicionar coluna)                                  │
│    └─► send_due_alert: boolean (padrão true)                        │
│                                                                     │
│  task_alert_logs (nova tabela para evitar duplicatas)               │
│    └─► task_id, sent_at, channel, user_id                           │
├─────────────────────────────────────────────────────────────────────┤
│  Edge Function: process-task-due-alerts                             │
│    └─► Cron job rodando a cada hora                                 │
│    └─► Verifica tarefas com due_date nas próximas 24h               │
│    └─► Respeita horário comercial (8h-18h por padrão)               │
│    └─► Envia email via Resend                                       │
│    └─► Envia WhatsApp via Evolution API                             │
│    └─► Registra log para evitar duplicatas                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 2.1 Nova Tabela: `task_alert_logs`

```sql
CREATE TABLE task_alert_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES internal_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  channel text NOT NULL, -- 'email' ou 'whatsapp'
  sent_at timestamptz NOT NULL DEFAULT now(),
  law_firm_id uuid NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  UNIQUE(task_id, user_id, channel) -- evita duplicatas
);
```

### 2.2 Alteração na Tabela `internal_tasks`

```sql
ALTER TABLE internal_tasks 
ADD COLUMN send_due_alert boolean NOT NULL DEFAULT true;
```

### 2.3 Alteração na Tabela `law_firm_settings`

```sql
ALTER TABLE law_firm_settings
ADD COLUMN task_alert_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN task_alert_hours_before integer NOT NULL DEFAULT 24,
ADD COLUMN task_alert_channels jsonb NOT NULL DEFAULT '["email"]';
```

---

### 2.4 Interface: `TaskAlertsSettingsDialog.tsx`

Novo componente de configurações com:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| Alertas ativos | Switch | Habilita/desabilita globalmente |
| Horas antes | Select | 12h, 24h, 48h |
| Canais | Checkboxes | Email, WhatsApp |
| Respeitar horário comercial | Switch | Só envia entre 8h-18h |

---

### 2.5 Toggle por Tarefa

Adicionar nos formulários `NewTaskDialog.tsx` e `TaskDetailSheet.tsx`:

```tsx
<FormField
  name="send_due_alert"
  render={({ field }) => (
    <FormItem className="flex items-center gap-3">
      <FormControl>
        <Switch checked={field.value} onCheckedChange={field.onChange} />
      </FormControl>
      <FormLabel>Enviar alerta de vencimento</FormLabel>
    </FormItem>
  )}
/>
```

---

### 2.6 Edge Function: `process-task-due-alerts`

**Lógica principal:**

1. Buscar empresas com `task_alert_enabled = true`
2. Para cada empresa, buscar tarefas:
   - `status != 'done'`
   - `due_date` entre agora e `+24h` (ou configurado)
   - `send_due_alert = true`
3. Para cada tarefa, buscar responsáveis (`task_assignees`)
4. Verificar se já enviou alerta (consultar `task_alert_logs`)
5. Verificar horário comercial (se configurado)
6. Enviar notificação:
   - **Email**: via Resend
   - **WhatsApp**: via Evolution API (se o usuário tem `phone`)
7. Registrar em `task_alert_logs`

**Cron job**: Executar a cada hora (para respeitar horário comercial)

```sql
SELECT cron.schedule(
  'process-task-due-alerts',
  '0 * * * *',  -- A cada hora
  $$...$$ 
);
```

---

### 2.7 Template do Alerta

**Email:**
```
Assunto: ⏰ Tarefa vence em 24h: {título}

Olá {nome},

A tarefa "{título}" está programada para vencer em breve:
📅 Vencimento: {data_vencimento}
📂 Categoria: {categoria}
🔴 Prioridade: {prioridade}

Acesse o sistema para mais detalhes.
```

**WhatsApp:**
```
⏰ *Alerta de Tarefa*

A tarefa *{título}* vence em 24h!
📅 Vencimento: {data_vencimento}

Acesse o sistema para ver mais detalhes.
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/tasks/TaskKanbanCard.tsx` | Modificar | Adicionar estilos visuais para tarefas concluídas |
| `src/pages/Tasks.tsx` | Modificar | Adicionar botão "Alertas" e dialog |
| `src/components/tasks/TaskAlertsSettingsDialog.tsx` | **Criar** | Modal de configurações de alertas |
| `src/components/tasks/NewTaskDialog.tsx` | Modificar | Adicionar toggle de alerta |
| `src/components/tasks/TaskDetailSheet.tsx` | Modificar | Adicionar toggle de alerta |
| `src/hooks/useTasks.tsx` | Modificar | Adicionar campo `send_due_alert` |
| `src/hooks/useTaskAlertSettings.tsx` | **Criar** | Hook para configurações de alertas |
| `supabase/functions/process-task-due-alerts/index.ts` | **Criar** | Edge function para processar e enviar alertas |
| `supabase/config.toml` | Modificar | Adicionar configuração da nova função |

---

## Sequência de Implementação

1. **Fase 1: Visual de Concluídas** (rápido, sem banco)
   - Modificar `TaskKanbanCard.tsx` com estilos condicionais

2. **Fase 2: Banco de Dados**
   - Criar migração SQL para novas colunas e tabela

3. **Fase 3: Frontend de Configurações**
   - Criar `TaskAlertsSettingsDialog.tsx`
   - Adicionar botão em `Tasks.tsx`
   - Criar hook `useTaskAlertSettings.tsx`

4. **Fase 4: Toggle por Tarefa**
   - Modificar formulários de criação/edição

5. **Fase 5: Edge Function**
   - Criar `process-task-due-alerts`
   - Configurar cron job

---

## Garantias de Não-Regressão

- Todas as alterações são **aditivas** (novas colunas com defaults, novos componentes)
- O módulo de tarefas continua funcionando exatamente igual se alertas não forem ativados
- Campos novos no banco têm valores default, não quebrando queries existentes
- Nenhuma alteração em outras áreas do sistema (conversas, kanban de clientes, agenda, etc.)

