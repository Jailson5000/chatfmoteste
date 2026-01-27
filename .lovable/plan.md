
# Plano: Adicionar `law_firm_id` na Tabela Messages para Realtime Otimizado

## Problema Atual

O `RealtimeSyncContext.tsx` **não consegue filtrar mensagens por tenant** porque a tabela `messages` não possui a coluna `law_firm_id`:

```typescript
// ATUAL (linhas 234-245): Escuta TODAS as mensagens do sistema
messagesChannelRef.current = supabase
  .channel(`tenant-messages-${lawFirmId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    // ❌ SEM FILTRO - recebe mensagens de TODOS os tenants!
  }, (payload) => handleTableChange('messages', payload))
```

**Consequências:**
1. Frontend recebe eventos de mensagens de **todas as empresas**
2. Debounce de 300ms + invalidação de queries pesadas (`get_conversations_with_metadata`)
3. Latência total: **~5-10 segundos** para novas mensagens aparecerem

---

## Solução Proposta

### Fase 1: Migração SQL

```sql
-- =============================================
-- ADICIONAR law_firm_id À TABELA MESSAGES
-- =============================================

-- 1. Adicionar coluna (nullable inicialmente para não quebrar inserts existentes)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS law_firm_id uuid REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- 2. Preencher dados existentes via JOIN com conversations
UPDATE public.messages m
SET law_firm_id = c.law_firm_id
FROM public.conversations c
WHERE m.conversation_id = c.id
AND m.law_firm_id IS NULL;

-- 3. Criar trigger para auto-preencher em novos inserts
CREATE OR REPLACE FUNCTION public.set_message_law_firm_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Se law_firm_id não foi fornecido, buscar da conversation
  IF NEW.law_firm_id IS NULL THEN
    SELECT c.law_firm_id INTO NEW.law_firm_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_message_law_firm_id
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_law_firm_id();

-- 4. Criar índice para filtro Realtime
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_law_firm_id 
ON public.messages (law_firm_id);

-- 5. Índice composto para queries frequentes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_law_firm_created 
ON public.messages (law_firm_id, created_at DESC);

-- 6. Atualizar RLS para usar coluna direta (mais eficiente que subquery)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can manage messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages in their tenant"
ON public.messages FOR SELECT TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert messages in their tenant"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update messages in their tenant"
ON public.messages FOR UPDATE TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()))
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete messages in their tenant"
ON public.messages FOR DELETE TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- 7. Habilitar Realtime com filtro (se ainda não habilitado)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
```

---

### Fase 2: Atualizar RealtimeSyncContext

**Arquivo:** `src/contexts/RealtimeSyncContext.tsx`

```typescript
// ANTES (linhas 234-245):
messagesChannelRef.current = supabase
  .channel(`tenant-messages-${lawFirmId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    // Sem filtro
  }, (payload) => handleTableChange('messages', payload))

// DEPOIS:
messagesChannelRef.current = supabase
  .channel(`tenant-messages-${lawFirmId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `law_firm_id=eq.${lawFirmId}`,  // ✅ FILTRO POR TENANT
  }, (payload) => handleTableChange('messages', payload))
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'messages',
    filter: `law_firm_id=eq.${lawFirmId}`,  // ✅ FILTRO POR TENANT
  }, (payload) => handleTableChange('messages', payload))
```

---

### Fase 3: Reduzir Debounce para Mensagens

**Arquivo:** `src/contexts/RealtimeSyncContext.tsx`

```typescript
// ANTES (linhas 143-147):
const criticalTables = ['messages', 'conversations'];
const debounceMs = criticalTables.includes(table) ? 300 : 500;

// DEPOIS: Mensagens com debounce mínimo
const handleTableChange = useCallback((table: string, payload: RealtimePostgresChangesPayload<any>) => {
  const queryKeys = TABLE_TO_QUERY_KEYS[table] || [];
  
  // Messages: debounce mínimo para feedback instantâneo
  // Conversations: debounce normal para evitar spam durante typing
  const debounceMs = table === 'messages' ? 100 : 
                     table === 'conversations' ? 300 : 500;
  
  debouncedInvalidate(queryKeys, debounceMs);
  
  // Notify registered callbacks
  if (table === 'messages') {
    messageCallbacksRef.current.forEach(cb => cb(payload));
  }
  if (table === 'conversations') {
    conversationCallbacksRef.current.forEach(cb => cb(payload));
  }
}, [debouncedInvalidate]);
```

---

### Fase 4: Atualizar Edge Functions (Opcional mas Recomendado)

Embora o trigger cuide de preencher `law_firm_id`, é uma boa prática incluí-lo explicitamente nos inserts para evitar a subquery do trigger.

**Arquivos afetados:**
- `supabase/functions/evolution-webhook/index.ts` (1 local)
- `supabase/functions/ai-chat/index.ts` (~7 locais)
- `supabase/functions/process-follow-ups/index.ts` (1 local)

```typescript
// ANTES:
await supabase.from("messages").insert({
  conversation_id: conversationId,
  content: message,
  // ...
});

// DEPOIS:
await supabase.from("messages").insert({
  conversation_id: conversationId,
  law_firm_id: lawFirmId,  // ✅ Explícito - evita trigger lookup
  content: message,
  // ...
});
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Nova migração SQL | Adicionar coluna, trigger, índices, RLS |
| `src/contexts/RealtimeSyncContext.tsx` | Adicionar filtro `law_firm_id` + reduzir debounce |
| `supabase/functions/evolution-webhook/index.ts` | Incluir `law_firm_id` no insert |
| `supabase/functions/ai-chat/index.ts` | Incluir `law_firm_id` nos ~7 inserts |
| `supabase/functions/process-follow-ups/index.ts` | Incluir `law_firm_id` no insert |

---

## Impacto Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Eventos Realtime recebidos | Todos os tenants | Apenas meu tenant |
| Debounce mensagens | 300ms | 100ms |
| Latência total | 5-15s | **1-2s** |
| Carga WebSocket | Alta (cross-tenant) | Baixa (filtered) |
| Performance RLS | Subquery por mensagem | Coluna direta (index scan) |

---

## Considerações de Segurança

1. **RLS Reforçado:** Novas políticas usam coluna direta `law_firm_id` ao invés de subquery, mais eficiente e igualmente seguro.

2. **Trigger SECURITY DEFINER:** O trigger usa `SECURITY DEFINER` para buscar `law_firm_id` da conversation mesmo que o caller não tenha acesso direto.

3. **Backward Compatibility:** O trigger garante que inserts existentes (sem `law_firm_id`) continuem funcionando.

---

## Ordem de Execução

1. **Migração SQL** - Adiciona coluna + preenche dados + cria trigger + atualiza RLS
2. **Deploy Edge Functions** - Incluir `law_firm_id` explicitamente
3. **Atualizar Frontend** - Adicionar filtro Realtime + reduzir debounce
4. **Testar** - Enviar mensagem e verificar latência

---

## Detalhes Técnicos

### Diagrama de Fluxo Atual vs. Proposto

```text
ATUAL:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ WhatsApp/Widget │───▸│ evolution-webhook│───▸│ messages INSERT │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase Realtime (SEM FILTRO)                     │
│  Envia evento para TODOS os frontends conectados                │
└─────────────────────────────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    ▼                     ▼                     ▼
┌────────┐           ┌────────┐           ┌────────┐
│Tenant A│           │Tenant B│           │Tenant C│
│Frontend│           │Frontend│           │Frontend│
└────┬───┘           └────┬───┘           └────┬───┘
     │                    │                    │
     ▼                    ▼                    ▼
  Debounce 300ms      Debounce 300ms      Debounce 300ms
     │                    │                    │
     ▼                    ▼                    ▼
  Invalidate          Invalidate          Invalidate
  (desnecessário)     (desnecessário)     (relevante!)

PROPOSTO:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ WhatsApp/Widget │───▸│ evolution-webhook│───▸│ messages INSERT │
└─────────────────┘    └──────────────────┘    │ + law_firm_id   │
                                               └────────┬────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│      Supabase Realtime (FILTRO: law_firm_id=eq.XXX)             │
│  Envia evento APENAS para o tenant correto                      │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼ (apenas Tenant C recebe)
                     ┌────────┐
                     │Tenant C│
                     │Frontend│
                     └────┬───┘
                          │
                          ▼
                    Debounce 100ms
                          │
                          ▼
                    Invalidate ✅
```

### Migration SQL Completa

```sql
-- =============================================
-- MIGRATION: Add law_firm_id to messages table
-- Purpose: Enable efficient Realtime filtering per tenant
-- =============================================

-- Step 1: Add column (nullable to allow migration)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS law_firm_id uuid REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- Step 2: Backfill existing data
UPDATE public.messages m
SET law_firm_id = c.law_firm_id
FROM public.conversations c
WHERE m.conversation_id = c.id
AND m.law_firm_id IS NULL;

-- Step 3: Create trigger to auto-populate on INSERT
CREATE OR REPLACE FUNCTION public.set_message_law_firm_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.law_firm_id IS NULL THEN
    SELECT c.law_firm_id INTO NEW.law_firm_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_law_firm_id ON public.messages;
CREATE TRIGGER trg_set_message_law_firm_id
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_law_firm_id();

-- Step 4: Create index for Realtime filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_law_firm_id 
ON public.messages (law_firm_id);

-- Step 5: Composite index for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_law_firm_created 
ON public.messages (law_firm_id, created_at DESC);

-- Step 6: Update RLS policies to use direct column (more efficient)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can manage messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages in their tenant"
ON public.messages FOR SELECT TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert messages in their tenant"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  law_firm_id = get_user_law_firm_id(auth.uid())
  OR law_firm_id IS NULL  -- Allow trigger to set it
);

CREATE POLICY "Users can update messages in their tenant"
ON public.messages FOR UPDATE TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()))
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete messages in their tenant"
ON public.messages FOR DELETE TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));
```
