
# Plano: Corrigir Repetição de Serviços e Erro de Data

## Problemas Identificados

### Problema 1: IA Lista Serviços Múltiplas Vezes
Na imagem:
- 16:44 → IA lista os 4 serviços
- 16:46 → IA lista os 4 serviços **novamente** (desnecessário)

**Causa**: Não há instrução para evitar repetir a lista se já foi apresentada na conversa.

### Problema 2: Data Errada no Agendamento
- Cliente pediu: **quarta-feira**
- IA confirmou: **quarta-feira, 11/02** às 13:00
- Mas agendou: **quinta-feira, 12/02** às 13:00

**Causa Raiz**: A IA não recebe a data atual de Brasília no prompt de agendamento. Isso faz com que ela calcule as datas incorretamente (offset de 1 dia). Hoje é **06/02/2026** (quinta-feira), então:
- Próxima quarta-feira = **11/02/2026** ✓
- Mas a IA passou **12/02** para a função

O problema está na **instrução da IA**, não na função em si. A função `book_appointment` recebe a data que a IA passa - e a IA está passando a data errada porque não sabe qual é a data atual.

---

## Soluções Propostas

### Correção 1: Evitar Repetir Lista de Serviços

Adicionar regra nas instruções de agendamento para não repetir a lista se já foi apresentada:

```typescript
### REGRAS CRÍTICAS DE AGENDAMENTO ###
...
5. Não repita a lista de serviços se já a apresentou na conversa atual. Se o cliente já conhece os serviços, prossiga diretamente com o agendamento.
```

### Correção 2: Injetar Data Atual no Prompt de Agendamento

Modificar a seção `isSchedulingAgent` para incluir **explicitamente** a data atual do Brasil:

```typescript
if (isSchedulingAgent) {
  // Get current date/time in Brazil timezone
  const nowBrazil = new Date();
  const brazilDateFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit", 
    month: "2-digit",
    year: "numeric"
  });
  const brazilTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  });
  
  const currentDateBrazil = brazilDateFormatter.format(nowBrazil);
  const currentTimeBrazil = brazilTimeFormatter.format(nowBrazil);
  
  // Calculate weekday names for reference
  const weekdayCalc = new Intl.DateTimeFormat("en-US", { 
    timeZone: "America/Sao_Paulo", 
    weekday: "long" 
  }).format(nowBrazil);
  
  systemPrompt += `

### DATA E HORA ATUAIS (Brasília) ###
Hoje é ${currentDateBrazil}, ${currentTimeBrazil}.

### REGRAS CRÍTICAS DE AGENDAMENTO ###
1. Ao listar serviços com list_services, você DEVE apresentar ABSOLUTAMENTE TODOS os serviços retornados.
2. NUNCA resuma, agrupe ou omita serviços. Cada um deve ser mencionado individualmente.
3. Use o campo 'services_list_for_response' da resposta para garantir que a lista esteja completa.
4. O cliente tem o direito de conhecer TODAS as opções disponíveis.
5. NÃO repita a lista de serviços se já a apresentou na conversa atual.
6. CÁLCULO DE DATAS: Use a data atual acima como referência. Se o cliente pede "quarta-feira" e hoje é quinta-feira dia 06/02, a próxima quarta-feira é dia 11/02.
7. SEMPRE confirme a data exata (dia da semana + data numérica) antes de criar o agendamento.
`;
}
```

### Correção 3: Adicionar Informação de Referência nas Ferramentas

Atualizar a descrição das ferramentas para enfatizar o uso correto de datas:

**get_available_slots**:
```typescript
description: "Obtém os horários disponíveis para agendamento em uma data específica. Use a data atual fornecida no contexto como referência para calcular datas futuras. Formato de data: YYYY-MM-DD (ex: 2026-02-11)"
```

**book_appointment**:
```typescript
description: "Cria um novo agendamento. ANTES de chamar: 1) Confirme a data exata com dia da semana (ex: 'quarta-feira, 11/02'). 2) Use a data atual do sistema como referência. 3) NÃO agende sem confirmação do cliente."
```

---

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Regras de agendamento (~linha 3229) | Injetar data/hora atual de Brasília |
| `ai-chat/index.ts` | Regras de agendamento (~linha 3229) | Adicionar regra para não repetir serviços |
| `ai-chat/index.ts` | Regras de agendamento (~linha 3229) | Adicionar regra de cálculo de datas |
| `ai-chat/index.ts` | `get_available_slots` (~linha 378) | Atualizar descrição com referência à data atual |
| `ai-chat/index.ts` | `book_appointment` (~linha 399) | Reforçar confirmação de data antes de agendar |

---

## Fluxo Após Correção

```text
PROMPT DA IA recebe:
"### DATA E HORA ATUAIS (Brasília) ###
Hoje é quinta-feira, 06/02/2026, 16:45."

Cliente: "Quero marcar uma consulta pra quarta-feira"
     ↓
IA calcula: Hoje é quinta 06/02 → próxima quarta = 11/02
     ↓
IA responde: "Posso agendar para quarta-feira, 11/02. Qual horário prefere?"
     ↓
Cliente: "13:00"
     ↓
IA confirma: "Confirmo: Consulta para quarta-feira, 11/02 às 13:00?"
     ↓
Cliente: "Sim"
     ↓
IA chama book_appointment(date: "2026-02-11", time: "13:00", ...)
     ↓
Agendamento criado para quarta-feira, 11/02 ✅
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Lista de serviços | Repete 2x na conversa | ✅ Lista 1x só |
| Cliente pede "quarta-feira" | Agenda quinta-feira 12/02 (erro) | ✅ Agenda quarta 11/02 |
| Referência de data | IA não sabe a data atual | ✅ IA recebe "Hoje é 06/02/2026" |
| Confirmação de data | Confirma mas data errada | ✅ Confirma data correta |

---

## Risco de Quebra

**Muito Baixo**
- Adiciona informações ao prompt, não remove nada
- Regras são aditivas (não conflitam com existentes)
- Descrições de ferramentas são apenas mais detalhadas
- Nenhuma mudança na lógica de agendamento real
