
# Plano: Melhorias na Página de Suporte

## Resumo das Melhorias

| Prioridade | Melhoria | Impacto |
|------------|----------|---------|
| Alta | Busca por título + Filtro por status | Navegação eficiente |
| Alta | Diferenciação visual cliente/suporte | Clareza na comunicação |
| Média | Indicador de novas respostas (unread) | Engajamento do usuário |

---

## 1. Busca e Filtros

### Estado Atual
- Sem busca
- Sem filtro por status
- Lista mostra todos os tickets

### Implementação

Adicionar no header abaixo do título:

```text
┌────────────────────────────────────────────────────────────┐
│  Suporte                                 [+ Novo Ticket]   │
│  Abra tickets para reportar problemas                      │
├────────────────────────────────────────────────────────────┤
│  [🔍 Buscar por título...        ]  [Status: Todos     ▼]  │
└────────────────────────────────────────────────────────────┘
```

**Código a adicionar em `Support.tsx`:**

```tsx
// Novos estados (após linha 44)
const [searchTerm, setSearchTerm] = useState("");
const [statusFilter, setStatusFilter] = useState<string>("all");

// Filtro (antes do return, após selectedTicket)
const filteredTickets = tickets.filter(ticket => {
  const matchesSearch = ticket.title?.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
  return matchesSearch && matchesStatus;
});
```

**UI do filtro (após linha 114, antes dos Cards de métricas):**
```tsx
<div className="flex flex-col sm:flex-row gap-3">
  <div className="relative flex-1">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input 
      placeholder="Buscar por título..." 
      value={searchTerm} 
      onChange={e => setSearchTerm(e.target.value)}
      className="pl-10"
    />
  </div>
  <Select value={statusFilter} onValueChange={setStatusFilter}>
    <SelectTrigger className="w-full sm:w-48">
      <SelectValue placeholder="Status" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todos</SelectItem>
      <SelectItem value="aberto">Aberto</SelectItem>
      <SelectItem value="em_andamento">Em Andamento</SelectItem>
      <SelectItem value="aguardando_cliente">Aguardando</SelectItem>
      <SelectItem value="resolvido">Resolvido</SelectItem>
      <SelectItem value="fechado">Fechado</SelectItem>
    </SelectContent>
  </Select>
</div>
```

---

## 2. Diferenciação Visual de Mensagens

### Estado Atual
Todas as mensagens têm o mesmo visual (linha 146):
```tsx
<div className="p-3 rounded-lg bg-background mb-2">
  <p className="text-sm">{m.content}</p>
  <span className="text-xs text-muted-foreground">{format(...)}</span>
</div>
```

### Proposta Visual

```text
┌─────────────────────────────────────────────────────────┐
│ Mensagens                                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────┐                    │
│  │ Você                           │  ← Cliente (direita)│
│  │ Mensagem do cliente...         │     bg-primary/10   │
│  │                    12/01 14:30 │                      │
│  └─────────────────────────────────┘                    │
│                                                         │
│  ┌─────────────────────────────────┐                    │
│  │ Suporte                        │  ← Admin (esquerda) │
│  │ Resposta do suporte...         │     bg-emerald/10   │
│  │ 12/01 15:45                    │                      │
│  └─────────────────────────────────┘                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Código da mensagem diferenciada:**
```tsx
{messages.map(m => {
  const isClient = m.sender_type === "client";
  return (
    <div 
      key={m.id} 
      className={cn(
        "p-3 rounded-lg mb-2 max-w-[85%]",
        isClient 
          ? "bg-primary/10 ml-auto" 
          : "bg-emerald-500/10 mr-auto"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          "text-xs font-medium",
          isClient ? "text-primary" : "text-emerald-600"
        )}>
          {isClient ? "Você" : "Suporte"}
        </span>
      </div>
      <p className="text-sm">{m.content}</p>
      <span className={cn(
        "text-xs text-muted-foreground block",
        isClient ? "text-right" : "text-left"
      )}>
        {format(new Date(m.created_at), "dd/MM HH:mm")}
      </span>
    </div>
  );
})}
```

---

## 3. Indicador de Novas Respostas

### Análise do Banco de Dados
A tabela `ticket_messages` já possui:
- `sender_type`: "client" ou "admin"
- `is_internal`: boolean (mensagens internas não são visíveis ao cliente)
- `created_at`: timestamp

**Estratégia:** Comparar timestamp da última mensagem do admin com a última visualização do cliente.

### Opção A: Campo `last_read_at` no ticket (recomendada)
Adicionar coluna `client_last_read_at` na tabela `support_tickets`:

```sql
ALTER TABLE support_tickets 
ADD COLUMN client_last_read_at timestamptz DEFAULT now();
```

**Lógica:**
1. Quando cliente abre o Sheet do ticket → atualizar `client_last_read_at`
2. Badge aparece se existir mensagem do admin com `created_at > client_last_read_at`

### Opção B: Query calculada (sem migração)
Calcular "tem resposta nova" na query:

```tsx
// Na query de tickets
const { data } = await supabase
  .from("support_tickets")
  .select(`
    *,
    ticket_messages!inner(created_at, sender_type, is_internal)
  `)
  .eq("law_firm_id", lawFirmId)
  .order("created_at", { ascending: false });

// Processar para identificar unread
const ticketsWithUnread = data?.map(t => ({
  ...t,
  hasUnreadReply: t.ticket_messages?.some(m => 
    m.sender_type === "admin" && 
    !m.is_internal && 
    new Date(m.created_at) > new Date(t.updated_at)
  )
}));
```

### UI do Badge (no card do ticket)
```tsx
<Card className="cursor-pointer hover:bg-muted/50">
  <CardContent className="flex items-center justify-between py-4">
    {/* ... conteúdo existente ... */}
    <div className="flex items-center gap-2">
      {ticket.hasUnreadReply && (
        <Badge variant="destructive" className="animate-pulse">
          Nova resposta
        </Badge>
      )}
      <Badge variant={...}>{statusLabels[...]}</Badge>
    </div>
  </CardContent>
</Card>
```

---

## Detalhes Técnicos

### Arquivos Modificados

| Arquivo | Mudanças |
|---------|----------|
| `src/pages/Support.tsx` | Adicionar busca, filtro, diferenciação de mensagens, badge unread |

### Imports Adicionais
```tsx
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
```

### Garantias de Não-Regressão

1. **Funcionalidade preservada**: Criação de ticket, envio de mensagens, visualização de resolução
2. **Performance**: Filtro aplicado client-side nos tickets já carregados
3. **Mobile**: Layout responsivo com `flex-col sm:flex-row`
4. **Acessibilidade**: Labels e placeholders mantidos

---

## Decisão Necessária

Para o indicador de "novas respostas", qual abordagem preferir?

| Opção | Prós | Contras |
|-------|------|---------|
| **A: Migração** | Preciso, performático | Requer ALTER TABLE |
| **B: Query** | Sem migração | Mais complexo, menos preciso |

**Recomendação**: Opção A (migração) para melhor UX a longo prazo.
