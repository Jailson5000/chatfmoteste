
# Plano: Prevenir Chamadas Redundantes de list_services

## Problema Identificado

### Logs Confirmam Duplicação
```
21:12:59 - list_services {}  ← Primeira chamada (cliente perguntou serviços)
21:13:00 - Returning 4 services: Consulta, Reunião de Prompt...
21:15:05 - list_services {}  ← SEGUNDA chamada (após "Isso mesmo")
21:15:06 - Returning 4 services: Consulta, Reunião de Prompt...
```

### Causa Raiz
O histórico de mensagens é carregado assim (linha 3570-3597):
```typescript
.select("content, is_from_me, sender_type, created_at")
```

Isso retorna apenas o **texto** das mensagens, mas **NÃO** as tool calls. Quando a IA recebe a nova mensagem "Isso mesmo", ela:
1. Vê o texto das mensagens anteriores
2. **NÃO vê** que `list_services` já foi chamada anteriormente
3. Decide chamar `list_services` novamente porque precisa do `service_id`

## Solução Proposta

### 1. Detectar se Serviços Já Foram Listados no Histórico

Adicionar lógica para **analisar o conteúdo das mensagens** e detectar se a lista de serviços já foi apresentada. Se sim, adicionar uma nota no prompt:

```typescript
// After loading history messages
const servicesAlreadyListed = historyMessages?.some((msg: any) => 
  msg.is_from_me && 
  msg.content?.includes("serviços disponíveis") &&
  (msg.content?.includes("• ") || msg.content?.includes("- "))
);

if (servicesAlreadyListed) {
  messages.push({
    role: "system",
    content: "NOTA: Os serviços já foram listados anteriormente nesta conversa. NÃO chame list_services novamente. Use os service_ids que você já tem na memória da conversa."
  });
}
```

### 2. Adicionar Lembrete no Prompt de Agendamento

Adicionar uma nota mais agressiva nas regras críticas:

```
12. MEMÓRIA: Se você JÁ listou os serviços nesta conversa (olhe o histórico), você JÁ POSSUI os service_ids. NÃO chame list_services novamente. Vá direto para book_appointment.
```

### 3. Melhorar a Descrição da Tool

Adicionar na descrição de `book_appointment`:

```typescript
description: "... IMPORTANTE: Você NÃO PRECISA chamar list_services novamente se já listou os serviços. Use o service_id que você já obteve anteriormente na conversa."
```

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Após carregar histórico (~linha 3598) | Detectar se serviços já foram listados e injetar nota |
| `ai-chat/index.ts` | Regras de agendamento (~linha 3334) | Adicionar regra 12 sobre memória de serviços |
| `ai-chat/index.ts` | Descrição `book_appointment` (~linha 400) | Enfatizar que não precisa chamar list_services novamente |

## Fluxo Após Correção

```text
18:12 → Cliente: "Me fale dos serviços"
18:13 → IA chama list_services (ÚNICA VEZ)
18:13 → IA lista os 4 serviços
18:13 → Cliente: "quero marcar consulta pra quarta"
18:14 → IA confirma: "Consulta na quarta 11/02 às 11:00?"
18:14 → Cliente: "Isso mesmo"
     ↓
Sistema detecta: Histórico contém "serviços disponíveis" + lista com "•"
     ↓
Sistema injeta: "NOTA: Os serviços já foram listados. NÃO chame list_services novamente."
     ↓
IA vai direto para book_appointment (sem chamar list_services!)
     ↓
18:15 → "Seu agendamento foi confirmado! ✅"
```

## Por Que Isso Vai Funcionar

| Problema | Antes | Depois |
|----------|-------|--------|
| IA sabe que já listou serviços? | Não - apenas vê texto, não tool calls | ✅ Sistema detecta no texto e avisa |
| Há instrução explícita para não repetir? | Genérica ("APENAS UMA VEZ") | ✅ Específica ("você JÁ LISTOU, use os IDs que tem") |
| IA tem os service_ids disponíveis? | Sim, mas não sabe disso | ✅ Sistema informa que já possui |

## Risco de Quebra

**Muito Baixo**
- Apenas adiciona nota contextual
- Não altera lógica de agendamento
- Não remove ferramentas
- Pior caso: nota não é suficiente e a IA ainda chama (comportamento atual)
