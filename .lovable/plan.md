
# Plano: Remoção Completa da Integração Tray Commerce

## Resumo

Remover toda a infraestrutura do Tray Commerce do sistema, incluindo frontend, backend (edge functions), banco de dados e tipos. O **Chat Web (Tray Chat)** permanece **intacto**.

---

## Arquivos a DELETAR

### Frontend (5 arquivos)

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useTrayCommerceIntegration.tsx` | Hook completo (~457 linhas) |
| `src/components/settings/integrations/TrayCommerceIntegration.tsx` | Componente de UI (~626 linhas) |

### Edge Functions (2 pastas)

| Pasta | Descrição |
|-------|-----------|
| `supabase/functions/tray-commerce-api/` | API de conexão, sync, CRUD |
| `supabase/functions/tray-commerce-webhook/` | Recepção de webhooks da Tray |

---

## Arquivos a MODIFICAR

### 1. `src/components/settings/IntegrationsSettings.tsx`

**Remover:**
- Linhas 40-46: Função `TrayCommerceIcon()`
- Linhas 97-102: O card do Tray Commerce no grid

**Resultado:** O grid de integrações mostrará apenas AgendaPro, Chat Web e os "Coming Soon" (ADV BOX, Custom Tool, PDF, Assinatura Digital)

---

## Migração de Banco de Dados

**Tabelas a DROPAR (com CASCADE para dependências):**

```sql
-- Ordem de remoção (respeitando FK constraints)
DROP TABLE IF EXISTS public.tray_commerce_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_audit_logs CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_sync_state CASCADE;
DROP TABLE IF EXISTS public.tray_coupon_map CASCADE;
DROP TABLE IF EXISTS public.tray_order_map CASCADE;
DROP TABLE IF EXISTS public.tray_product_map CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_connections CASCADE;

-- Remover funções/triggers relacionados
DROP FUNCTION IF EXISTS public.create_tray_sync_state() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_single_default_tray_connection() CASCADE;
```

**Tabelas afetadas (total: 7):**
1. `tray_commerce_connections` - Conexões OAuth
2. `tray_commerce_sync_state` - Estado de sincronização
3. `tray_commerce_audit_logs` - Logs de auditoria
4. `tray_commerce_webhook_logs` - Logs de webhooks
5. `tray_product_map` - Produtos sincronizados
6. `tray_order_map` - Pedidos sincronizados
7. `tray_coupon_map` - Cupons sincronizados

---

## Verificação de Dados

**Antes de executar**, verificar se há dados em produção:

```sql
SELECT 
  (SELECT COUNT(*) FROM tray_commerce_connections) AS connections,
  (SELECT COUNT(*) FROM tray_product_map) AS products,
  (SELECT COUNT(*) FROM tray_order_map) AS orders,
  (SELECT COUNT(*) FROM tray_coupon_map) AS coupons;
```

Se houver dados, será necessário backup antes da remoção.

---

## Resumo de Mudanças

| Categoria | Ação | Itens |
|-----------|------|-------|
| **Frontend** | Deletar | 2 arquivos |
| **Edge Functions** | Deletar | 2 pastas |
| **UI Component** | Modificar | 1 arquivo (IntegrationsSettings) |
| **Database** | Dropar | 7 tabelas + 2 funções |
| **Types** | Auto-regenerado | `types.ts` será atualizado automaticamente |

---

## NÃO AFETADOS (Chat Web / Tray Chat)

Estes arquivos permanecem **intactos**:
- `src/components/settings/integrations/TrayChatIntegration.tsx` ✅
- `src/hooks/useTrayIntegration.tsx` ✅
- `supabase/functions/widget-messages/` ✅
- Tabelas `tray_chat_*` ✅

---

## Ordem de Execução

1. **Migração SQL** - Dropar tabelas e funções
2. **Deletar Edge Functions** - `tray-commerce-api/` e `tray-commerce-webhook/`
3. **Deletar arquivos frontend** - Hook e componente
4. **Modificar IntegrationsSettings.tsx** - Remover card e ícone
5. **Types.ts** - Será regenerado automaticamente

---

## Detalhes Técnicos

### Modificação em `IntegrationsSettings.tsx`

```tsx
// REMOVER: linhas 40-46
function TrayCommerceIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
      <ShoppingCart className="h-5 w-5 text-white" />
    </div>
  );
}

// REMOVER: linhas 97-102
<IntegrationCard
  icon={<TrayCommerceIcon />}
  title="Tray Commerce"
  description="Integre pedidos, produtos, cupons e frete do seu e-commerce Tray."
  isComingSoon
/>

// REMOVER import não utilizado: ShoppingCart
```

### SQL Migration Completa

```sql
-- =============================================
-- REMOÇÃO COMPLETA DO TRAY COMMERCE
-- =============================================

-- 1. Dropar políticas RLS primeiro
DROP POLICY IF EXISTS "Admins can view tray connections" ON public.tray_commerce_connections;
DROP POLICY IF EXISTS "Admins can manage tray connections" ON public.tray_commerce_connections;
DROP POLICY IF EXISTS "Only service role can insert tray_commerce_audit_logs" ON public.tray_commerce_audit_logs;
DROP POLICY IF EXISTS "Only service role can insert tray_commerce_webhook_logs" ON public.tray_commerce_webhook_logs;

-- 2. Dropar tabelas em ordem (respeitando FKs)
DROP TABLE IF EXISTS public.tray_commerce_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_audit_logs CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_sync_state CASCADE;
DROP TABLE IF EXISTS public.tray_coupon_map CASCADE;
DROP TABLE IF EXISTS public.tray_order_map CASCADE;
DROP TABLE IF EXISTS public.tray_product_map CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_connections CASCADE;

-- 3. Dropar funções/triggers
DROP FUNCTION IF EXISTS public.create_tray_sync_state() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_single_default_tray_connection() CASCADE;
```
