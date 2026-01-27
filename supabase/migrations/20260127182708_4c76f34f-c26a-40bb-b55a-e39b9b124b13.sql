-- =============================================
-- ÍNDICES DE PERFORMANCE PARA CONVERSAS
-- Migração: Otimização de queries críticas
-- =============================================

-- 1. Índice crítico para paginação de mensagens
-- Query: WHERE conversation_id = ? ORDER BY created_at DESC
-- Impacto: 5-10x mais rápido para conversas com muitas mensagens
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
ON public.messages (conversation_id, created_at DESC);

-- 2. Índice para ordenação de conversas no RPC get_conversations_with_metadata
-- Query: WHERE law_firm_id = ? ORDER BY last_message_at DESC NULLS LAST
CREATE INDEX IF NOT EXISTS idx_conversations_law_firm_order 
ON public.conversations (law_firm_id, last_message_at DESC NULLS LAST, created_at DESC);

-- 3. Índice parcial para count de mensagens não lidas (usado no RPC)
-- Query: COUNT(*) WHERE conversation_id = ? AND is_from_me = false AND read_at IS NULL
CREATE INDEX IF NOT EXISTS idx_messages_unread 
ON public.messages (conversation_id) 
WHERE is_from_me = false AND read_at IS NULL;