
# Plano: Corrigir Perda de Mensagens por Conflito de Unique Constraint

## Problema Identificado

### Causa Raiz
O índice único `messages_whatsapp_message_id_unique` é **GLOBAL** na tabela `messages`, mas o WhatsApp pode enviar a **mesma mensagem para múltiplas instâncias em tenants diferentes**.

### Fluxo do Problema

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cliente (556384017428) envia "Olá"                                         │
│                                                                             │
│                    ↓                                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Evolution API envia webhook para AMBAS as instâncias               │   │
│  │  com o mesmo whatsapp_message_id: 3EB0BBE0B6F198CE0A85A0            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│          ↓                                              ↓                   │
│                                                                             │
│  ┌───────────────────────┐                    ┌───────────────────────┐    │
│  │  Tenant 607db389      │                    │  Tenant 1e0a07ac      │    │
│  │  (inst_qloxuhkb)      │                    │  (inst_5fjooku6)      │    │
│  │  Processa primeiro    │                    │  Processa depois      │    │
│  │  INSERT sucesso       │                    │  INSERT FALHA (23505) │    │
│  └───────────────────────┘                    └───────────────────────┘    │
│                                                                             │
│  Resultado: Mensagem "Olá" perdida para o Tenant 1e0a07ac                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Evidência do Problema

| Dado | Valor |
|------|-------|
| whatsapp_message_id | `3EB0BBE0B6F198CE0A85A0` |
| Mensagem | "Olá" às 17:19:52 UTC |
| Webhook recebido | Sim (registrado no webhook_logs) |
| Salvo no DB | Apenas no tenant 607db389 |
| Tenant afetado | 1e0a07ac (FMO Advogados) |

---

## Solução

### Migração SQL

Alterar o índice único de **global** para **por tenant**:

```sql
-- Remove o índice global que causa o conflito
DROP INDEX IF EXISTS messages_whatsapp_message_id_unique;

-- Cria novo índice único POR TENANT
-- Isso permite o mesmo whatsapp_message_id em tenants diferentes
-- mas previne duplicatas dentro do mesmo tenant
CREATE UNIQUE INDEX messages_whatsapp_message_id_per_tenant 
ON public.messages (law_firm_id, whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;
```

### Por que essa solução funciona

| Cenário | Antes (índice global) | Depois (índice por tenant) |
|---------|----------------------|---------------------------|
| Mesma msg em 2 tenants | CONFLITO - segundo insert falha | OK - cada tenant tem sua cópia |
| Retry do mesmo webhook | OK - duplicata detectada | OK - duplicata detectada |
| Mesma msg no mesmo tenant | N/A - primeiro já prevenia | OK - constraint ainda previne |

---

## Detalhes Técnicos

### Arquivo a Criar

Nova migração SQL: `supabase/migrations/[timestamp]_fix_messages_unique_per_tenant.sql`

### Conteúdo da Migração

```sql
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
```

---

## Verificação

### Como Confirmar que Funcionou

1. Após aplicar a migração, verificar que o índice foi alterado:
```sql
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'messages' AND indexname LIKE '%whatsapp%';
```

2. Testar enviando uma mensagem para um cliente que conversa com múltiplas instâncias - ambas devem receber e salvar a mensagem.

### Métricas de Sucesso

- Erros 23505 no webhook devem parar de ocorrer
- Mensagens de clientes não devem mais "sumir"
- Cada tenant mantém sua cópia independente das mensagens

---

## Risco e Rollback

### Risco
**Mínimo** - A mudança apenas relaxa a constraint para permitir duplicatas cross-tenant, que é o comportamento esperado em arquitetura multi-tenant.

### Rollback (se necessário)
```sql
DROP INDEX IF EXISTS messages_whatsapp_message_id_per_tenant;
CREATE UNIQUE INDEX messages_whatsapp_message_id_unique 
ON public.messages (whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;
```

---

## Impacto no Sistema

| Componente | Impacto |
|------------|---------|
| Webhook evolution-webhook | Funcionará normalmente - mensagens não serão mais rejeitadas |
| Frontend de conversas | Funcionará normalmente - verá todas as mensagens |
| Deduplicação | Mantida - ainda previne duplicatas dentro do mesmo tenant |
| Performance | Similar - índice continua otimizado para buscas |
| RLS | Não afetado - políticas continuam funcionando |

---

## Cronograma

1. **Aplicar migração** - Imediato
2. **Monitorar logs** - Verificar que erros 23505 pararam
3. **Testar fluxo** - Enviar mensagem de teste em cenário cross-tenant
