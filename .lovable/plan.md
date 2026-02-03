

# Plano: Adicionar Aba "Enviadas" nas Mensagens Agendadas

## Objetivo

Adicionar um novo botão/aba "Enviadas" ao lado de "Pendentes" para visualizar as mensagens que foram enviadas nos últimos 7 dias, permitindo controle e acompanhamento do histórico de envios.

---

## Análise do Componente Atual

| Elemento | Status |
|----------|--------|
| Tabs implementadas | Sim - usando Radix UI Tabs |
| Aba "Pendentes" | Funcional - mostra `status = 'pending'` |
| Query de mensagens | Filtra apenas `status = 'pending'` |
| Dados disponíveis no banco | 8 enviadas, 3 pendentes, 5 canceladas, 3 falhas |

---

## Mudanças Necessárias

### 1. Nova Query para Mensagens Enviadas

```typescript
// Fetch sent messages from last 7 days
const { data: sentMessages = [], isLoading: loadingSent } = useQuery({
  queryKey: ["agenda-pro-sent-messages", lawFirm?.id],
  queryFn: async () => {
    if (!lawFirm?.id) return [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("agenda_pro_scheduled_messages")
      .select(`
        *,
        agenda_pro_clients(name, phone),
        agenda_pro_appointments(
          id, start_time, client_name, client_phone, status,
          agenda_pro_services(name),
          agenda_pro_professionals(name)
        )
      `)
      .eq("law_firm_id", lawFirm.id)
      .eq("status", "sent")
      .gte("sent_at", sevenDaysAgo.toISOString())
      .order("sent_at", { ascending: false });

    if (error) throw error;

    return (data || []).map((msg: any) => ({
      // ... mesmo mapeamento existente
      sent_at: msg.sent_at, // adicionar campo de envio
    }));
  },
  enabled: !!lawFirm?.id && activeTab === "sent", // só busca quando aba ativa
});
```

### 2. Nova Aba na Interface

```tsx
<TabsList>
  <TabsTrigger value="pending" className="gap-2">
    <Clock className="h-4 w-4" />
    Pendentes ({pendingMessages.length})
  </TabsTrigger>
  <TabsTrigger value="sent" className="gap-2">
    <Send className="h-4 w-4" />
    Enviadas ({sentMessages.length})
  </TabsTrigger>
</TabsList>
```

### 3. Conteúdo da Nova Aba

```tsx
<TabsContent value="sent" className="mt-4">
  {sentMessages.length === 0 ? (
    <Card>
      <CardContent className="flex flex-col items-center justify-center h-[200px]">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium">Nenhuma mensagem enviada</h3>
        <p className="text-sm text-muted-foreground">
          Mensagens enviadas nos últimos 7 dias aparecerão aqui
        </p>
      </CardContent>
    </Card>
  ) : (
    <div className="space-y-3">
      {sentMessages.map((message) => (
        // Card similar ao de pendentes, mas com:
        // - Badge verde "Enviada" 
        // - Data/hora de envio (sent_at)
        // - Sem botões de ação (já foi enviada)
      ))}
    </div>
  )}
</TabsContent>
```

---

## Diferenças Visuais: Pendentes vs Enviadas

| Aspecto | Pendentes | Enviadas |
|---------|-----------|----------|
| Badge de status | ⏰ Amarelo | ✅ Verde |
| Data mostrada | `scheduled_for` | `sent_at` |
| Botão Enviar | Sim (para alguns tipos) | Não |
| Botão Editar | Sim (custom) | Não |
| Botão Cancelar | Sim | Não |
| Ordenação | Próximas primeiro | Mais recentes primeiro |

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/agenda-pro/AgendaProScheduledMessages.tsx` | Adicionar query, aba e conteúdo |

---

## Interface Final

```text
┌────────────────────────────────────────────────────────────┐
│ Mensagens Agendadas                    [+ Nova Mensagem]   │
│ Gerencie lembretes e mensagens...           3 pendentes    │
├────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌──────────────────┐                  │
│ │ ⏰ Pendentes (3) │ │ ✅ Enviadas (8)  │ ← NOVA ABA       │
│ └──────────────────┘ └──────────────────┘                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [Lista de mensagens conforme aba selecionada]             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Segurança da Implementação

| Verificação | Status |
|-------------|--------|
| Mantém funcionalidade de Pendentes | ✅ Intacta |
| Mantém query existente de customMessages | ✅ Intacta |
| Mantém query existente de autoMessages | ✅ Intacta |
| Lazy loading (só busca quando aba ativa) | ✅ Otimizado |
| Filtro por law_firm_id | ✅ RLS + filtro explícito |
| Sem modificação no banco | ✅ Apenas leitura |

---

## Benefícios

1. **Controle**: Ver histórico de mensagens enviadas
2. **Performance**: Query só executa quando aba está ativa
3. **UX**: Filtro automático de 7 dias evita excesso de dados
4. **Consistência**: Mesmo visual das mensagens pendentes
5. **Zero Regressão**: Funcionalidade existente não é alterada

