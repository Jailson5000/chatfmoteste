
# Corrigir Contagem de Conexoes no Dashboard

## Problema Atual

O codigo em `useSystemMetrics.tsx` (linhas 91-95) conta TODAS as `meta_connections` (WhatsApp Cloud, Instagram, Facebook) como conexoes. O correto e contar apenas WhatsApp (Evolution API) e WhatsApp Cloud API como conexoes. Instagram, Facebook e Chat Web nao sao conexoes.

## Mudanca

### `src/hooks/useSystemMetrics.tsx`

Na query de `meta_connections` (linha 86), filtrar apenas `type = 'whatsapp_cloud'`:

```typescript
// Antes:
supabase.from("meta_connections").select("id, type, is_active")

// Depois:
supabase.from("meta_connections").select("id, type, is_active").eq("type", "whatsapp_cloud")
```

E atualizar o comentario (linha 91) para refletir que so conta WhatsApp Cloud:

```typescript
// Count WhatsApp Cloud API connections (only whatsapp_cloud, not instagram/facebook)
```

## Sobre Conversas de IA

As conversas atendidas por IA (`totalAIConversations`) ja sao contadas independente do canal -- o valor vem de `company_usage_summary.current_ai_conversations` que conta registros de `usage_records` do tipo `ai_conversations`, gravados por qualquer canal (WhatsApp, Instagram, Facebook, Chat Web). Nenhuma mudanca necessaria aqui.

## Risco

Zero. Apenas um filtro adicional na query.
