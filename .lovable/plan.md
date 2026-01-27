
# Plano de Implementacao: Sistema de Tarefas Internas

## Resumo Executivo

Este plano implementa uma pagina completa de gerenciamento de tarefas internas para a equipe, com funcionalidades de Kanban, calendario, filtros avancados e historico de alteracoes. O sistema segue a arquitetura multi-tenant existente e as regras de seguranca RLS.

---

## Arquitetura da Solucao

```text
+-----------------------------------------------------------------------------------+
|                           SISTEMA DE TAREFAS INTERNAS                             |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +------------------+     +----------------------------------------------------+  |
|  |   AppSidebar     |     |                    Tabelas                         |  |
|  |  --------------  |     |  ------------------------------------------------  |  |
|  |                  |     |  internal_tasks           - Tarefas principais     |  |
|  |  + Tarefas       |---->|  task_assignees           - Atribuicoes multiplas  |  |
|  |    (novo item)   |     |  task_comments            - Comentarios/progresso  |  |
|  |                  |     |  task_categories          - Categorias             |  |
|  +------------------+     |  task_attachments         - Anexos (opcional)      |  |
|                           |  task_activity_log        - Historico alteracoes   |  |
|                           +----------------------------------------------------+  |
|                                           |                                       |
|                                           v                                       |
|  +------------------------------------------------------------------------+      |
|  |                         Frontend Components                             |      |
|  |  --------------------------------------------------------------------  |      |
|  |  Tasks.tsx               - Pagina principal com tabs                   |      |
|  |  TaskKanbanView.tsx      - Visualizacao Kanban                        |      |
|  |  TaskListView.tsx        - Visualizacao em lista                      |      |
|  |  TaskCalendarView.tsx    - Visualizacao calendario                    |      |
|  |  TaskDashboard.tsx       - Dashboard com metricas                     |      |
|  |  TaskDetailSheet.tsx     - Sheet lateral com detalhes                 |      |
|  |  NewTaskDialog.tsx       - Modal de criacao/edicao                    |      |
|  +------------------------------------------------------------------------+      |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

---

## Modelo de Dados

### Tabela: internal_tasks
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | Chave primaria |
| law_firm_id | uuid | FK para law_firms (tenant) |
| title | text | Titulo da tarefa (obrigatorio) |
| description | text | Descricao detalhada |
| status | enum | 'todo', 'in_progress', 'done' |
| priority | enum | 'low', 'medium', 'high', 'urgent' |
| category_id | uuid | FK para task_categories |
| due_date | timestamptz | Data/hora para realizacao |
| created_by | uuid | FK para profiles |
| completed_at | timestamptz | Quando foi concluida |
| position | integer | Ordem no kanban |
| created_at | timestamptz | Timestamp criacao |
| updated_at | timestamptz | Timestamp atualizacao |

### Tabela: task_assignees
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | Chave primaria |
| task_id | uuid | FK para internal_tasks |
| user_id | uuid | FK para profiles (atendente) |
| assigned_at | timestamptz | Quando foi atribuido |

### Tabela: task_categories
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | Chave primaria |
| law_firm_id | uuid | FK para law_firms |
| name | text | Nome (Administrativo, Suporte, etc) |
| color | text | Cor para exibicao |
| position | integer | Ordem de exibicao |

### Tabela: task_comments
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | Chave primaria |
| task_id | uuid | FK para internal_tasks |
| user_id | uuid | FK para profiles |
| content | text | Conteudo do comentario |
| created_at | timestamptz | Timestamp |

### Tabela: task_activity_log
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | Chave primaria |
| task_id | uuid | FK para internal_tasks |
| user_id | uuid | FK para profiles |
| action | text | Tipo da acao (created, updated, etc) |
| old_values | jsonb | Valores anteriores |
| new_values | jsonb | Novos valores |
| created_at | timestamptz | Timestamp |

---

## Fluxo de Funcionamento

```text
Usuario                    Frontend                      Backend
   |                          |                             |
   |--[Acessa /tarefas]------>|                             |
   |                          |--[Fetch tarefas]----------->|
   |                          |                             |
   |                          |<--[Lista filtrada por      -|
   |                          |    law_firm_id via RLS]     |
   |                          |                             |
   |--[Cria nova tarefa]----->|                             |
   |                          |--[INSERT internal_tasks]--->|
   |                          |--[INSERT task_assignees]--->|
   |                          |--[INSERT task_activity_log]-|
   |                          |                             |
   |<--[Tarefa criada]--------|                             |
   |                          |                             |
   |--[Arrasta no Kanban]---->|                             |
   |                          |--[UPDATE status]----------->|
   |                          |--[INSERT activity_log]----->|
   |                          |                             |
   |--[Adiciona comentario]-->|                             |
   |                          |--[INSERT task_comments]---->|
   |                          |                             |
```

---

## Componentes Frontend

### 1. Pagina Principal: src/pages/Tasks.tsx
- Tabs para alternar entre visualizacoes (Kanban, Lista, Calendario, Dashboard)
- Barra de filtros (responsavel, data, prioridade, categoria, status)
- Campo de busca por palavras-chave
- Botao "Nova Tarefa"

### 2. Visualizacao Kanban: TaskKanbanView.tsx
- 3 colunas: "A Fazer", "Em Progresso", "Concluido"
- Drag and drop para mover tarefas entre colunas
- Cards com indicador de prioridade por cor:
  - Baixa: Cinza
  - Media: Azul
  - Alta: Laranja
  - Urgente: Vermelho
- Avatar dos atribuidos no card
- Data de vencimento com indicador de atraso

### 3. Visualizacao Lista: TaskListView.tsx
- Tabela ordenavel por colunas
- Checkbox para marcar como concluida
- Acoes rapidas (editar, excluir)
- Paginacao

### 4. Visualizacao Calendario: TaskCalendarView.tsx
- Calendario mensal com tarefas por data
- Alternancia dia/semana/mes
- Clique para ver detalhes

### 5. Dashboard: TaskDashboard.tsx
- Cards de resumo:
  - Tarefas pendentes por atendente
  - Tarefas atrasadas
  - Tarefas concluidas no periodo
  - Distribuicao por categoria

### 6. Sheet de Detalhes: TaskDetailSheet.tsx
- Edicao inline de campos
- Lista de comentarios/progresso
- Historico de alteracoes
- Anexos (se implementado)
- Botoes de acao: Editar, Excluir, Marcar como Concluida

### 7. Dialog de Criacao/Edicao: NewTaskDialog.tsx
- Formulario com:
  - Titulo (obrigatorio)
  - Descricao (textarea)
  - Atribuidos (multiselect com atendentes)
  - Data/hora (datepicker + timepicker)
  - Prioridade (select)
  - Categoria (select)

---

## Hooks React

### useTasks.tsx
```typescript
interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category_id: string | null;
  due_date: string | null;
  created_by: string;
  completed_at: string | null;
  position: number;
  assignees: { id: string; user_id: string; profile: Profile }[];
  category: TaskCategory | null;
  comments_count: number;
}

// Funcoes:
// - tasks: Task[]
// - createTask
// - updateTask
// - deleteTask
// - updateTaskStatus
// - reorderTasks
```

### useTaskCategories.tsx
```typescript
// CRUD de categorias
// - categories: TaskCategory[]
// - createCategory
// - updateCategory
// - deleteCategory
```

### useTaskComments.tsx
```typescript
// Comentarios de uma tarefa
// - comments: TaskComment[]
// - addComment
// - deleteComment
```

---

## Seguranca e Isolamento Multi-Tenant

### Politicas RLS para internal_tasks
```sql
-- SELECT: Usuarios veem apenas tarefas do seu law_firm
CREATE POLICY "Users can view own law_firm tasks"
ON internal_tasks FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- INSERT: Usuarios criam tarefas no seu law_firm
CREATE POLICY "Users can create tasks in own law_firm"
ON internal_tasks FOR INSERT
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

-- UPDATE: Usuarios atualizam tarefas do seu law_firm
CREATE POLICY "Users can update own law_firm tasks"
ON internal_tasks FOR UPDATE
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- DELETE: Usuarios deletam tarefas do seu law_firm
CREATE POLICY "Users can delete own law_firm tasks"
ON internal_tasks FOR DELETE
USING (law_firm_id = get_user_law_firm_id(auth.uid()));
```

### Validacoes no Frontend
- Hooks sempre filtram por `law_firm_id` do usuario logado
- Mutacoes incluem `law_firm_id` nas queries
- Atendentes podem ver todas as tarefas, mas o sidebar mostra indicador de "novas atribuidas"

---

## Integracao com Sidebar

### Alteracao em AppSidebar.tsx
```typescript
// Novo item no menu
const tasksItem = { 
  icon: CheckSquare, 
  label: "Tarefas", 
  path: "/tarefas" 
};

// Adicionar na lista bottomMenuItems ou criar nova secao
```

---

## Categorias Padrao

Na migracao, inserir categorias iniciais:
- Administrativo (cor: azul)
- Suporte (cor: verde)
- Financeiro (cor: amarelo)
- Comercial (cor: roxo)
- Outros (cor: cinza)

---

## Sequencia de Implementacao

| Fase | Descricao | Complexidade |
|------|-----------|--------------|
| 1 | Migracao do banco (tabelas + RLS + enums) | Media |
| 2 | Hook useTasks + useTaskCategories | Media |
| 3 | Pagina Tasks.tsx com estrutura de tabs | Baixa |
| 4 | TaskKanbanView com drag-and-drop | Alta |
| 5 | NewTaskDialog (criar/editar) | Media |
| 6 | TaskDetailSheet (detalhes + comentarios) | Media |
| 7 | TaskListView (tabela) | Baixa |
| 8 | TaskCalendarView | Media |
| 9 | TaskDashboard (metricas) | Media |
| 10 | Integracao Sidebar + rota | Baixa |
| 11 | Hook useTaskComments + activity log | Media |
| 12 | Notificacoes visuais (opcional) | Baixa |

---

## Garantias de Nao-Regressao

1. **Tabelas Novas**: Apenas CREATE TABLE, nenhuma alteracao em tabelas existentes
2. **RLS Isolado**: Politicas seguem padrao existente com `get_user_law_firm_id()`
3. **Rota Independente**: `/tarefas` nao interfere em rotas existentes
4. **Componentes Isolados**: Novos componentes em pasta dedicada `src/components/tasks/`
5. **Hooks Dedicados**: Novos hooks nao alteram hooks existentes

---

## Resultado Esperado

### Interface Principal
- Acesso via sidebar "Tarefas"
- Visualizacao Kanban como padrao
- Alternancia facil entre visualizacoes
- Filtros persistentes

### Funcionalidades
- Criar tarefa com titulo, descricao, atribuidos, data, prioridade, categoria
- Arrastar tarefas entre colunas do Kanban
- Marcar como concluida
- Adicionar comentarios/progresso
- Ver historico de alteracoes
- Dashboard com metricas

### Indicadores Visuais
- Cores de prioridade (vermelho urgente, laranja alta, azul media, cinza baixa)
- Badge de tarefas atrasadas
- Avatares dos atribuidos
- Contagem de comentarios
