-- ============================================================================
-- FIX: Mensagens perdidas por conflito de unique constraint cross-tenant
-- ============================================================================
-- PROBLEMA: O índice messages_whatsapp_message_id_unique é GLOBAL, mas o 
-- WhatsApp pode enviar a mesma mensagem para múltiplas instâncias em 
-- diferentes tenants. Isso causa INSERT failures com error code 23505.
--
-- SOLUÇÃO: Alterar o índice para ser único POR TENANT (law_firm_id), 
-- permitindo que o mesmo whatsapp_message_id exista em tenants diferentes.
-- ============================================================================

-- Step 1: Remove o índice global problemático
DROP INDEX IF EXISTS messages_whatsapp_message_id_unique;

-- Step 2: Cria novo índice único por tenant
-- IMPORTANT: Inclui law_firm_id no índice para isolar por tenant
CREATE UNIQUE INDEX messages_whatsapp_message_id_per_tenant 
ON public.messages (law_firm_id, whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;

-- Step 3: Adiciona comentário explicativo
COMMENT ON INDEX messages_whatsapp_message_id_per_tenant IS 
'Previne mensagens duplicadas por tenant. Permite o mesmo whatsapp_message_id em tenants diferentes (cenário válido quando múltiplas instâncias recebem a mesma mensagem).';