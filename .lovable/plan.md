

# Plano: Injetar service_ids no Contexto para Eliminar Duplicação

## Análise da Causa Raiz

### O Problema Real
O histórico de mensagens carrega apenas **texto** (`content`), mas **NÃO** as tool calls/respostas:

```typescript
// Linha 3571-3577
const { data: historyMessages } = await supabase
  .from("messages")
  .select("content, is_from_me, sender_type, created_at")  // ❌ Não tem tool results!
  .eq("conversation_id", conversationId)
```

Quando a IA chamou `list_services` anteriormente, recebeu:
```json
{
  "services": [
    { "service_id": "abc-123", "name": "Head Spa" },
    { "service_id": "def-456", "name": "Consulta" }
  ]
}
```

Mas esse JSON **NÃO é salvo** nem **carregado** no histórico. A IA vê apenas o texto "Temos os seguintes serviços: Head Spa, Consulta..."

### Por Isso a IA Chama list_services Novamente
- A IA sabe que precisa do `service_id` (UUID) para chamar `book_appointment`
- Ela vê no histórico que mencionou "Head Spa", mas **não tem o UUID**
- Única forma de obter o UUID: chamar `list_services` novamente

## Solução: Injetar os service_ids Quando Serviços Já Listados

### Fluxo Proposto

```text
1. Detectar se serviços já foram listados no histórico ✅ (já fazemos)
2. SE sim, buscar os serviços do banco e injetar no contexto ← NOVO
3. IA recebe: "SERVICE_IDS DISPONÍVEIS: Head Spa = abc-123, Consulta = def-456"
4. IA não precisa mais chamar list_services
```

### Alteração no Código

Após detectar `servicesAlreadyListed`, buscar os serviços e injetar os IDs:

```typescript
if (servicesAlreadyListed) {
  console.log(`[AI Chat] Services already listed - injecting service IDs`);
  
  // Fetch current services to inject their IDs
  const { data: services } = await supabase
    .from("agenda_pro_services")
    .select("id, name")
    .eq("law_firm_id", agentLawFirmId)
    .eq("is_active", true)
    .eq("is_public", true);
  
  if (services && services.length > 0) {
    const serviceIdList = services.map(s => `• ${s.name} → service_id: "${s.id}"`).join("\n");
    
    messages.push({
      role: "system",
      content: `MEMÓRIA DE SERVIÇOS (NÃO chame list_services novamente):
Os serviços já foram listados ao cliente. Aqui estão os service_ids para sua referência:

${serviceIdList}

INSTRUÇÃO: Use esses service_ids diretamente ao chamar book_appointment. NÃO chame list_services.`
    });
  }
}
```

### Por Que Vai Funcionar

| Antes | Depois |
|-------|--------|
| IA vê "Head Spa" no texto, mas não tem UUID | ✅ IA recebe: `Head Spa → service_id: "abc-123"` |
| IA precisa chamar list_services para obter ID | ✅ IA já tem o ID, vai direto para book_appointment |
| Nota genérica "não chame de novo" | ✅ Contexto específico com os IDs reais |

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Bloco `servicesAlreadyListed` (~linha 3594-3600) | Buscar serviços do banco e injetar os IDs no contexto |

## Fluxo Após Correção

```text
17:46 → IA chama list_services (ÚNICA VEZ)
17:46 → IA lista os 4 serviços
17:46 → Cliente: "o 4, pra quarta feira, as 13:30"
17:47 → IA confirma: "Head Spa na quarta-feira, 11/02, às 13:30?"
17:47 → Cliente: "isso mesmo, pode confirmar"
     ↓
Sistema detecta: histórico contém "serviços disponíveis"
Sistema busca: agenda_pro_services WHERE law_firm_id = X
Sistema injeta: "Head Spa → service_id: abc-123, Consulta → service_id: def-456..."
     ↓
IA tem o UUID na memória!
     ↓
IA chama book_appointment(service_id: "abc-123", ...) direto!
     ↓
17:48 → "Seu agendamento foi realizado com sucesso! ✅"
```

## Economia de Tokens

| Cenário | Antes | Depois |
|---------|-------|--------|
| Chamadas à API | 2x (list_services + book_appointment) | 1x (apenas book_appointment) |
| Tokens consumidos | ~4000 tokens (duplo) | ~2500 tokens |
| Tempo de resposta | ~3-4s (duas chamadas AI) | ~2s (uma chamada) |

## Risco de Quebra

**Muito Baixo**
- Apenas adiciona contexto extra
- Não altera lógica de tools
- Backward compatible (se não encontrar serviços, comportamento normal)
- Query simples ao banco (já fazemos queries similares)

