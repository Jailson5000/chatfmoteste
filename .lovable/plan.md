

# Plano: Corrigir Erros Críticos de Datas no Agendamento via IA

## Problemas Identificados

### Problema 1: Cliente pede "quinta-feira" mas agenda na sexta-feira
**Evidência na imagem**: Cliente pediu explicitamente "quinta-feira" várias vezes, a IA confirmou que ia agendar para "quinta-feira às 14:00", mas a mensagem de confirmação mostra **sexta-feira, 13 de fevereiro de 2026**.

**Causa**: A IA está passando a data `2026-02-13` para a função `book_appointment`, mas não há validação de que o dia da semana corresponde ao que foi solicitado pelo cliente. A data 13/02/2026 **é uma sexta-feira**, não quinta-feira.

**Bug técnico**: A IA está interpretando erroneamente a data ou calculando +1 dia devido a problemas de fuso horário (UTC vs America/Sao_Paulo).

### Problema 2: IA oferece datas que já passaram
**Evidência na imagem (segundo cliente)**: A IA diz "temos horários disponíveis na **quarta-feira, dia 4 de fevereiro**" - mas a data atual é **6 de fevereiro de 2026**, ou seja, 4/02 já passou.

**Causa**: A função `get_available_slots` não valida se a data solicitada está no passado. O sistema só filtra slots passados dentro do dia, mas não rejeita dias passados completamente.

---

## Análise Técnica

### Raiz do Problema 1 (dia da semana errado)
Na função `book_appointment` (linha 1299):
```typescript
const startTime = new Date(`${date}T${time}:00.000-03:00`);
```

O código cria a data corretamente com timezone, mas **não valida se o dia da semana resultante corresponde ao que o cliente pediu**. A IA pode estar calculando a data erroneamente antes de chamar a função.

### Raiz do Problema 2 (data no passado)
Na função `get_available_slots` (linhas 1039-1275):
- Não há validação `if (requestedDate < today)` para bloquear datas passadas
- O filtro de slots passados só funciona para horários dentro do dia atual

---

## Soluções Propostas

### Correção 1: Validação de data passada em get_available_slots
Adicionar verificação no início da função (após linha 1087):

```typescript
// BLOCK: Prevent booking in the past
const nowInBrazil = new Date(
  new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
);
const todayStr = `${nowInBrazil.getFullYear()}-${String(nowInBrazil.getMonth() + 1).padStart(2, '0')}-${String(nowInBrazil.getDate()).padStart(2, '0')}`;

if (date < todayStr) {
  return JSON.stringify({
    success: false,
    error: `A data ${date} já passou. Hoje é ${todayStr}. Por favor, escolha uma data futura.`,
    available_slots: []
  });
}
```

### Correção 2: Validação de data passada em book_appointment
Adicionar verificação (após linha 1300):

```typescript
// BLOCK: Prevent booking in the past
const nowInBrazil = new Date(
  new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
);
if (startTime < nowInBrazil) {
  return JSON.stringify({
    success: false,
    error: "Não é possível agendar para uma data/horário que já passou. Por favor, escolha um horário futuro."
  });
}
```

### Correção 3: Adicionar confirmação do dia da semana no book_appointment
A IA deve confirmar o dia da semana antes de criar o agendamento. Adicionar após criação de `startTime`:

```typescript
// Calculate and include day of week for confirmation
const dayOfWeek = startTime.getDay();
const dayNames: Record<number, string> = {
  0: "domingo",
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado"
};
const calculatedDayName = dayNames[dayOfWeek];

// Log for debugging
console.log(`[book_appointment] Client requested date ${date} at ${time} - This is a ${calculatedDayName} (dayOfWeek=${dayOfWeek})`);
```

E modificar a mensagem de retorno para incluir explicitamente o dia da semana calculado, pedindo confirmação se necessário.

### Correção 4: Instruções no prompt do sistema para agendamento
Atualizar a descrição da ferramenta `book_appointment` para enfatizar a validação:

```typescript
description: "Cria um novo agendamento no sistema. IMPORTANTE: Antes de chamar esta função, SEMPRE confirme com o cliente a data exata (ex: 'Você quer agendar para quinta-feira, dia 12/02?'). NÃO agende sem confirmação explícita da data."
```

---

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | get_available_slots (~linha 1088) | Bloquear datas passadas |
| `ai-chat/index.ts` | book_appointment (~linha 1300) | Bloquear agendamento no passado |
| `ai-chat/index.ts` | book_appointment (~linha 1300) | Log do dia da semana calculado |
| `ai-chat/index.ts` | SCHEDULING_TOOLS (~linha 400) | Atualizar descrição para exigir confirmação |

---

## Fluxo Após Correção

```
Cliente: "Quero agendar para quinta-feira"
     ↓
IA calcula: próxima quinta = 12/02/2026
     ↓
IA chama get_available_slots(date: "2026-02-12")
     ↓
Sistema valida: 2026-02-12 > hoje? ✅ Sim
     ↓
Retorna horários disponíveis para QUINTA-FEIRA
     ↓
IA confirma: "Encontrei horários para quinta, 12/02. Qual prefere?"
     ↓
Cliente escolhe horário
     ↓
IA chama book_appointment(date: "2026-02-12")
     ↓
Sistema valida: data futura? ✅ Sim
     ↓
Sistema cria agendamento e loga: "This is a quinta-feira"
     ↓
Confirmação mostra: "quinta-feira, 12 de fevereiro de 2026" ✅
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Cliente pede "quinta-feira" | Agenda sexta-feira (erro) | ✅ Valida e confirma antes |
| Data 4/02 quando hoje é 6/02 | Mostra horários (erro) | ✅ Erro: "data já passou" |
| Horário 10:00 quando são 11:00 | Pode agendar (erro) | ✅ Erro: "horário já passou" |

---

## Risco de Quebra

**Baixo**
- Adiciona validações que impedem erros, não altera fluxo existente
- Mensagens de erro claras guiam o usuário para correção
- Logs adicionais ajudam a debuggar futuros problemas

