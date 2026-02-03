

# Plano: Corrigir Contagem de Mensagens Enviadas

## Problema Identificado

A query de mensagens enviadas usa lazy loading (`enabled: activeTab === "sent"`), o que faz a contagem aparecer como 0 até o usuário clicar na aba.

**Código atual (linha 140):**
```typescript
enabled: !!lawFirm?.id && activeTab === "sent",
```

## Solução

Criar uma query separada apenas para contar as mensagens enviadas, que sempre execute independente da aba ativa.

## Mudanças Necessárias

### 1. Nova Query de Contagem

```typescript
// Fetch sent messages count (always runs)
const { data: sentMessagesCount = 0 } = useQuery({
  queryKey: ["agenda-pro-sent-messages-count", lawFirm?.id],
  queryFn: async () => {
    if (!lawFirm?.id) return 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count, error } = await supabase
      .from("agenda_pro_scheduled_messages")
      .select("*", { count: "exact", head: true })
      .eq("law_firm_id", lawFirm.id)
      .eq("status", "sent")
      .gte("sent_at", sevenDaysAgo.toISOString());

    if (error) throw error;
    return count || 0;
  },
  enabled: !!lawFirm?.id, // SEMPRE executa
});
```

### 2. Atualizar TabsTrigger

**Antes:**
```tsx
<TabsTrigger value="sent">
  Enviadas ({sentMessages.length})
</TabsTrigger>
```

**Depois:**
```tsx
<TabsTrigger value="sent">
  Enviadas ({sentMessagesCount})
</TabsTrigger>
```

## Benefícios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Contagem ao carregar | Mostra 0 | Mostra contagem real |
| Performance | Query pesada só na aba | Query leve sempre + pesada na aba |
| UX | Usuário precisa clicar para ver | Visível imediatamente |

## Arquivo Modificado

| Arquivo | Mudanças |
|---------|----------|
| `src/components/agenda-pro/AgendaProScheduledMessages.tsx` | Adicionar query de contagem, atualizar TabsTrigger |

