

# Auditoria Completa: Fluxos de Mensagens, Performance e Kanban

---

## 1. Fluxos de Envio e Recebimento de Mensagens

### Estado Atual: Funcional com 2 problemas menores

**Fluxo de Recebimento (uazapi-webhook) — OK**
- Resolucao de conversa em 5 etapas (JID exato → JID qualquer instancia → telefone exato → telefone orfao → criar nova) — robusto
- Criacao automatica de cliente e persistencia de avatar — OK
- Deteccao de duplicatas por `whatsapp_message_id` — OK
- Persistencia de midia via base64 ou `/message/download` com fallback — OK
- Auto-desarquivamento com restauracao de handler — OK
- Processamento de IA com fragmentacao inteligente (`responseParts` + fallback 400 chars) — OK (corrigido recentemente)
- Envio de templates com `type` field para midia — OK (corrigido recentemente)

**Fluxo de Envio (evolution-api) — OK**
- Usa `whatsapp-provider.ts` abstraction para roteamento uazapi/evolution — OK
- Envio assincrono com `EdgeRuntime.waitUntil` — OK
- Reconciliacao de IDs (temp → real) via Realtime — OK

**Fluxo Realtime (useMessagesWithPagination) — OK com 1 bug**
- INSERT: Merge otimista com 5 estrategias de deduplicacao — robusto
- UPDATE: Reconciliacao de status/midia — OK
- Scroll anchoring para paginacao — OK
- Fallback polling a cada 3 segundos — OK

### Bug Encontrado: Polling query incompleta

No `useMessagesWithPagination.tsx`, linha 865, a query de polling esta faltando `client_reaction`:

```
Linha 148 (initial load): "...my_reaction, client_reaction"  ← CORRETO
Linha 222 (load more):    "...my_reaction, client_reaction"  ← CORRETO  
Linha 865 (polling):      "...my_reaction"                   ← FALTA client_reaction
```

**Impacto**: Reacoes de emoji do cliente podem desaparecer se capturadas via polling em vez de Realtime. Baixa severidade, pois Realtime normalmente captura primeiro.

**Correcao**: Adicionar `, client_reaction` na query de polling (linha 865).

---

## 2. Velocidade de Carregamento

### Metricas Atuais (Preview/Dev)

| Metrica | Valor | Avaliacao |
|---------|-------|-----------|
| TTFB | 622ms | Aceitavel |
| FCP | 5088ms | Lento (dev mode) |
| DOM Content Loaded | 4426ms | Lento (dev mode) |
| CLS | 0.0002 | Excelente |
| JS Heap | 14.8MB | Bom |
| DOM Nodes | 831 | Bom |
| Layout Duration | 67ms | Bom |
| Scripts | 120 (1346KB) | Alto para dev |

**Nota importante**: Esses numeros sao do ambiente de DESENVOLVIMENTO (Vite dev server). Em producao, com bundling e minificacao, o FCP deve ficar em ~1500ms conforme ja documentado.

### Otimizacoes ja implementadas — OK
- Lazy loading em 29+ rotas via `React.lazy` com retry — OK
- `staleTime` global 2min / `gcTime` 10min — OK
- `RealtimeSyncProvider` apenas no AppLayout (nao no Global Admin) — OK
- Consolidacao de Realtime (18 → 3-4 canais) — OK
- Font externo (Google Fonts) como unico recurso render-blocking — aceitavel

### Nenhuma acao necessaria
A performance esta otimizada para producao. Os numeros altos de FCP sao exclusivamente do ambiente de preview/dev.

---

## 3. Kanban de Conversas

### Estado Atual: Funcional com 1 bug de UI

**Funcionalidades OK:**
- Agrupamento por departamento com drag-and-drop — OK
- Agrupamento por status com drag-and-drop de clientes — OK
- Coluna "Sem Departamento" / "Sem Status" — OK
- Coluna de Arquivados com permissao — OK
- Reordenacao de departamentos via drag — OK
- Painel lateral (KanbanChatPanel) com injecao de estado — OK
- Auto-load de todas conversas para visao completa — OK
- Filtros multi-select (responsavel, status, departamento, tags, conexao, data) — OK
- Lock otimista de 3 segundos contra race conditions — OK

### Bug Encontrado: Modos "Responsavel" e "Conexao" nao implementados

O dropdown "Agrupar por" oferece 4 opcoes:
1. **Departamento** — Funciona ✓
2. **Status** — Funciona ✓
3. **Responsavel** — Mostra colunas de STATUS (bug)
4. **Conexao** — Mostra colunas de STATUS (bug)

A causa: o JSX usa um ternario simples `groupBy === 'department' ? ... : ...` que so distingue departamento dos demais. Os modos "responsible" e "connection" caem no branch else e renderizam como status.

**Impacto**: Medio. O usuario seleciona "Responsavel" esperando ver colunas por atendente/IA, mas ve colunas de status.

**Correcao**: Implementar as renderizacoes para `groupBy === 'responsible'` (colunas: cada membro + "Sem Responsavel") e `groupBy === 'connection'` (colunas: cada instancia WhatsApp + "Sem Conexao").

---

## 4. Kanban de Tarefas (TaskKanbanView)

### Estado: Funcional — OK
- 3 colunas (A Fazer, Em Progresso, Concluido) com drag-and-drop via @dnd-kit — OK
- DragOverlay para feedback visual — OK
- Ativacao com distancia de 8px (evita cliques acidentais) — OK
- Ordenacao por position — OK

---

## Resumo de Acoes

| # | Problema | Severidade | Arquivo | Correcao |
|---|----------|------------|---------|----------|
| 1 | Polling falta `client_reaction` | Baixa | `useMessagesWithPagination.tsx` L865 | Adicionar `, client_reaction` |
| 2 | Kanban "Responsavel" e "Conexao" nao implementados | Media | `Kanban.tsx` L476-618 | Implementar renderizacao de colunas para esses modos |

Todos os outros fluxos — recebimento, envio, IA, midia, deduplicacao, Realtime, performance — estao corretos e otimizados.

