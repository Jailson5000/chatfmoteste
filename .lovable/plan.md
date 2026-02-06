
# Plano: Forçar IA a Mostrar TODOS os Serviços

## Problema Identificado

A query do banco retorna corretamente **4 serviços**:
- Consulta (30 min, R$ 150)
- Reunião de Prompt (60 min)
- Atendimento Inicial (45 min)
- Head Spa (60 min, R$ 150)

Mas a IA está decidindo por conta própria mostrar apenas **2 ou 3** serviços ao cliente. Isso acontece porque:
1. A IA tenta ser "concisa" e resume a lista
2. O hint atual é tratado como sugestão, não como obrigação
3. Não há instrução no sistema que force a IA a não omitir itens

## Análise Técnica

O fluxo atual:
```
Cliente: "Quais serviços vocês têm?"
         ↓
IA chama list_services()
         ↓
Função retorna JSON com 4 serviços + hint
         ↓
IA processa e decide mostrar apenas 2-3 ❌
```

O problema é que o **hint** está no nível de "sugestão" e a IA pode ignorar.

## Solução Proposta

### Correção 1: Tornar o retorno da função `list_services` mais enfático

Mudar a estrutura do retorno para deixar absolutamente claro que a IA **NÃO PODE** omitir nenhum serviço:

```typescript
return JSON.stringify({
  success: true,
  total_count: services.length,
  message: `ATENÇÃO: Existem exatamente ${services.length} serviço(s). Você DEVE apresentar TODOS ao cliente, sem omitir nenhum.`,
  services: formattedServices,
  instruction: `OBRIGATÓRIO: Liste cada um dos ${services.length} serviços abaixo para o cliente. NÃO resuma, NÃO agrupe, NÃO omita. O cliente PRECISA conhecer todas as opções disponíveis.`,
  services_list_for_response: formattedServices.map(s => 
    `• ${s.name} - ${s.duration}${s.price !== "Sob consulta" ? ` - ${s.price}` : ""}`
  ).join("\n")
});
```

### Correção 2: Adicionar o campo `services_list_for_response` 

Incluir uma string pré-formatada que a IA pode copiar diretamente, reduzindo a chance de ela decidir "resumir":

```typescript
services_list_for_response: formattedServices.map(s => {
  const priceText = s.price !== "Sob consulta" ? ` - ${s.price}` : "";
  const descText = s.description ? ` (${s.description})` : "";
  return `• ${s.name}${descText} - ${s.duration}${priceText}`;
}).join("\n")
```

### Correção 3: Melhorar a descrição do tool `list_services`

Atualizar a descrição para deixar claro que a IA **NUNCA** deve omitir serviços:

```typescript
description: "Lista todos os serviços disponíveis para agendamento. REGRA CRÍTICA: Você DEVE apresentar ABSOLUTAMENTE TODOS os serviços retornados ao cliente, sem omitir nenhum. O cliente tem o direito de conhecer todas as opções. Use o campo 'services_list_for_response' para copiar a lista formatada."
```

### Correção 4: Adicionar instrução de sistema adicional para scheduling agents

Injetar uma instrução adicional no prompt quando o agente é de agendamento:

```typescript
if (isSchedulingAgent) {
  systemPrompt += `\n\n### REGRAS DE AGENDAMENTO ###
- Ao listar serviços, você DEVE apresentar TODOS os serviços retornados, sem exceção.
- NUNCA resuma ou agrupe serviços. Cada serviço deve ser mencionado individualmente.
- Use o campo 'services_list_for_response' quando disponível para garantir que nenhum serviço seja omitido.`;
}
```

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Tool description `list_services` (~linha 367) | Atualizar descrição com regra crítica |
| `ai-chat/index.ts` | Retorno do `list_services` (~linha 1024-1040) | Adicionar `total_count`, `instruction`, `services_list_for_response` |
| `ai-chat/index.ts` | System prompt (~linha 3210-3216) | Adicionar regras de agendamento para scheduling agents |

## Fluxo Após Correção

```
Cliente: "Quais serviços vocês têm?"
         ↓
IA chama list_services()
         ↓
Função retorna:
{
  total_count: 4,
  message: "ATENÇÃO: Existem exatamente 4 serviços...",
  instruction: "OBRIGATÓRIO: Liste cada um...",
  services: [...],
  services_list_for_response: "• Consulta - 30 min - R$ 150,00\n• Reunião de Prompt - 60 min\n• Atendimento Inicial - 45 min\n• Head Spa - 60 min - R$ 150,00"
}
         ↓
IA vê instrução OBRIGATÓRIA + lista pronta
         ↓
IA responde: "Temos 4 serviços disponíveis:
• Consulta - 30 min - R$ 150,00
• Reunião de Prompt - 60 min
• Atendimento Inicial - 45 min
• Head Spa - 60 min - R$ 150,00"
```

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| 4 serviços no banco | IA mostra 2-3 | ✅ IA mostra 4 |
| Cliente pergunta serviços | Resposta incompleta | ✅ Lista completa formatada |
| Debug | Sem log detalhado | ✅ Log com total e nomes |

## Risco de Quebra

**Muito Baixo**
- Apenas adiciona campos extras ao retorno JSON
- A estrutura existente (`success`, `services`) permanece igual
- A instrução adicional no system prompt não conflita com prompts existentes
- Código de fallback não é afetado

## Detalhes Técnicos

A alteração principal será no case `list_services`:

```typescript
case "list_services": {
  const { data: services, error } = await supabase
    .from("agenda_pro_services")
    .select("id, name, description, duration_minutes, price, color")
    .eq("law_firm_id", lawFirmId)
    .eq("is_active", true)
    .eq("is_public", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("[Scheduling] Error listing services:", error);
    return JSON.stringify({ success: false, error: "Erro ao buscar serviços" });
  }

  if (!services || services.length === 0) {
    return JSON.stringify({
      success: true,
      total_count: 0,
      message: "Nenhum serviço disponível para agendamento",
      services: []
    });
  }

  const formattedServices = services.map((s: any) => ({
    service_id: s.id,
    name: s.name,
    description: s.description || "",
    duration: `${s.duration_minutes} minutos`,
    price: s.price ? `R$ ${s.price.toFixed(2)}` : "Sob consulta"
  }));

  // Pre-formatted list for AI to copy directly
  const servicesListForResponse = formattedServices.map(s => {
    const priceText = s.price !== "Sob consulta" ? ` - ${s.price}` : "";
    const descText = s.description ? ` (${s.description})` : "";
    return `• ${s.name}${descText} - ${s.duration}${priceText}`;
  }).join("\n");

  console.log(`[list_services] Returning ${services.length} services: ${formattedServices.map(s => s.name).join(", ")}`);

  return JSON.stringify({
    success: true,
    total_count: services.length,
    message: `Encontrados ${services.length} serviço(s) disponível(is). Apresente TODOS ao cliente.`,
    instruction: `OBRIGATÓRIO: Apresente cada um dos ${services.length} serviços listados abaixo. NÃO omita nenhum. O cliente deve conhecer TODAS as opções.`,
    services: formattedServices,
    services_list_for_response: servicesListForResponse,
    hint: "Use o campo services_list_for_response para mostrar a lista formatada ao cliente."
  });
}
```

E a instrução adicional no system prompt para scheduling agents:

```typescript
// Após linha 3216, antes do processamento de mentions
if (isSchedulingAgent) {
  systemPrompt += `

### REGRAS CRÍTICAS DE AGENDAMENTO ###
1. Ao listar serviços com list_services, você DEVE apresentar ABSOLUTAMENTE TODOS os serviços retornados.
2. NUNCA resuma, agrupe ou omita serviços. Cada um deve ser mencionado individualmente.
3. Use o campo 'services_list_for_response' da resposta para garantir que a lista esteja completa.
4. O cliente tem o direito de conhecer TODAS as opções disponíveis.
`;
}
```
