

# Plano: Corrigir Listagem e Identificação de Serviços via IA

## Problema Identificado

### Evidência no Log
```json
{
  "service_id": "Reunião de Prompt"  // ❌ NOME ao invés de UUID
}
```

A IA está passando o **nome** do serviço como `service_id` ao invés do **UUID real** (ex: `a354cc0b-46ee-468f-93bb-b9f12b55f56f`). Isso causa:

1. **Serviços não listados corretamente**: A IA pode estar truncando ou interpretando mal a lista completa
2. **Falha ao agendar**: A query `.eq("id", "Reunião de Prompt")` nunca encontra nenhum registro

### Dados do Banco (confirmados)
| Serviço | is_active | is_public | Profissionais | Deve aparecer |
|---------|-----------|-----------|---------------|---------------|
| Consulta | true | **false** | 3 | ❌ Não (privado) |
| Reunião de Prompt | true | true | 3 | ✅ Sim |
| Atendimento Inicial | true | true | 3 | ✅ Sim |
| Head Spa | true | true | 1 | ✅ Sim |

A query do banco retorna **3 serviços públicos**, mas a IA só mostrou **2** na mensagem.

---

## Causa Raiz

1. **Problema na interpretação da IA**: A descrição da ferramenta `list_services` não enfatiza suficientemente que deve-se usar o `id` UUID
2. **Falta de fallback por nome**: Se a IA passa um nome ao invés de UUID, o sistema falha silenciosamente
3. **Log insuficiente**: Não há log do resultado da `list_services` para debug

---

## Correções Propostas

### Correção 1: Fallback de busca por nome no `book_appointment`

Quando o `service_id` não é um UUID válido, buscar pelo nome do serviço:

```typescript
// No book_appointment (após linha 1304)
let serviceQuery = supabase
  .from("agenda_pro_services")
  .select("id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price, pre_message_enabled, pre_message_hours_before, pre_message_text")
  .eq("law_firm_id", lawFirmId)
  .eq("is_active", true);

// Check if service_id is a valid UUID
const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id);

if (isValidUUID) {
  serviceQuery = serviceQuery.eq("id", service_id);
} else {
  // Fallback: search by name (case-insensitive)
  console.log(`[book_appointment] service_id "${service_id}" is not a UUID, searching by name`);
  serviceQuery = serviceQuery.ilike("name", service_id);
}

const { data: service, error: serviceError } = await serviceQuery.single();
```

### Correção 2: Fallback de busca por nome no `get_available_slots`

Aplicar a mesma lógica na função de slots:

```typescript
// No get_available_slots (após linha 1050)
let serviceQuery = supabase
  .from("agenda_pro_services")
  .select("duration_minutes, buffer_before_minutes, buffer_after_minutes, name")
  .eq("law_firm_id", lawFirmId);

const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id);

if (isValidUUID) {
  serviceQuery = serviceQuery.eq("id", service_id);
} else {
  console.log(`[get_available_slots] service_id "${service_id}" is not a UUID, searching by name`);
  serviceQuery = serviceQuery.ilike("name", service_id);
}

const { data: service } = await serviceQuery.single();
```

### Correção 3: Melhorar descrição do `list_services` e log de resultado

```typescript
// Na definição do tool list_services
{
  type: "function",
  function: {
    name: "list_services",
    description: "Lista todos os serviços disponíveis para agendamento. RETORNA o 'id' UUID de cada serviço que DEVE ser usado nas demais funções. Apresente TODOS os serviços retornados ao cliente.",
    parameters: { type: "object", properties: {}, required: [] }
  }
}

// No case "list_services", após formatar
console.log(`[list_services] Returning ${services.length} services:`, formattedServices.map(s => `${s.name} (${s.id})`).join(", "));
```

### Correção 4: Formato da listagem mais claro para a IA

Alterar o formato de retorno para enfatizar o ID:

```typescript
const formattedServices = services.map((s: any) => ({
  service_id: s.id,  // Renomear para service_id para ênfase
  name: s.name,
  description: s.description || "",
  duration: `${s.duration_minutes} minutos`,
  price: s.price ? `R$ ${s.price.toFixed(2)}` : "Sob consulta"
}));

return JSON.stringify({
  success: true,
  message: `${services.length} serviço(s) disponível(is). Use o 'service_id' para as próximas operações.`,
  services: formattedServices,
  hint: "IMPORTANTE: Sempre apresente TODOS os serviços listados e use o service_id ao solicitar horários ou agendar."
});
```

---

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | `list_services` (~linha 365) | Melhorar descrição do tool |
| `ai-chat/index.ts` | `list_services` (~linha 1024) | Renomear `id` para `service_id`, adicionar hint e log |
| `ai-chat/index.ts` | `get_available_slots` (~linha 1052) | Fallback de busca por nome |
| `ai-chat/index.ts` | `book_appointment` (~linha 1305) | Fallback de busca por nome |

---

## Fluxo Após Correção

```text
Cliente: "Me fale dos serviços"
     ↓
IA chama list_services()
     ↓
Sistema retorna 3 serviços com service_id UUID
     ↓
IA apresenta TODOS: "1. Reunião de Prompt (60 min)
                     2. Atendimento Inicial (45 min)
                     3. Head Spa (60 min)"
     ↓
Cliente: "Quero Reunião de Prompt"
     ↓
IA chama get_available_slots(service_id: "a354cc0b-...")
     ↓
[OU] IA chama get_available_slots(service_id: "Reunião de Prompt")
     ↓ 
Sistema detecta que não é UUID → busca por nome → encontra
     ↓
Retorna horários disponíveis ✅
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Listagem de serviços | 2 de 3 (faltando Head Spa) | ✅ 3 de 3 |
| IA passa nome como ID | Erro "Serviço não encontrado" | ✅ Busca por nome (fallback) |
| Log para debug | Sem log | ✅ Log completo dos serviços |
| Agendamento Reunião de Prompt | Falha | ✅ Funciona |

---

## Risco de Quebra

**Muito Baixo**
- Adiciona fallback, não remove funcionalidade
- Busca por nome é case-insensitive (ilike)
- UUID válido continua funcionando normalmente
- Logs adicionais não afetam fluxo

