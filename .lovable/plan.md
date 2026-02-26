

# Plano: Otimizações de Performance (3 itens)

## Sua pergunta sobre o cache Deno KV e o prompt da IA

**Sim, haveria um delay de até 5 minutos para propagar alterações.** Mas o cache seria aplicado **apenas na base de conhecimento** (`knowledge_items`), não no prompt principal (`ai_prompt`). O prompt do agente é carregado da tabela `automations.ai_prompt` a cada chamada e **não seria cacheado**.

A base de conhecimento muda raramente (documentos, FAQs), então 5 minutos de delay é aceitável. Mas para maior segurança, a implementação incluirá **invalidação manual**: quando o admin salvar alterações na base de conhecimento, o cache é limpo instantaneamente via um parâmetro `?bust_cache=true`.

**Resumo do comportamento:**
- **Prompt da IA** (`ai_prompt`): sempre atualizado em tempo real (sem cache)
- **Base de conhecimento** (`knowledge_items`): cache de 5min com invalidação manual ao editar

---

## Implementação

### 1. Criar 3 índices faltantes (Migration SQL)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created 
  ON messages(conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_fromme_created 
  ON messages(conversation_id, is_from_me, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_lawfirm_archived 
  ON conversations(law_firm_id, archived_at);
```

### 2. Criar RPC `get_dashboard_metrics_optimized`

Uma stored procedure que consolida em 1 query SQL:
- Contagem de mensagens recebidas/enviadas no período
- Contagem de conversas ativas e arquivadas
- Usa `dashboard_daily_snapshots` para dias passados + cálculo real-time para hoje
- Aceita filtros opcionais (attendant, department, connection)

Atualizar `useDashboardMetrics.tsx` para chamar a RPC em vez das 8-12 queries individuais.

### 3. Cache Deno KV no `ai-chat` (apenas knowledge items)

Na função `getAgentKnowledge()`:
- Verificar cache por chave `knowledge:{automationId}`
- Se existe e tem < 5min → retornar do cache
- Se não → buscar do banco, salvar no cache
- **O prompt (`ai_prompt`) NÃO será cacheado** — continua sendo lido do banco a cada chamada
- Adicionar parâmetro de invalidação para quando o admin editar a base

