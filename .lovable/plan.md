
# Plano: Validação de Consistência Data/Dia da Semana

## Análise da Sugestão

Sua sugestão é **excelente** e vai adicionar uma camada extra de segurança ao sistema de agendamento. Atualmente:

1. ✅ O sistema já calcula o dia da semana correto (linhas 1384-1397)
2. ✅ O sistema já loga essa informação
3. ❌ **MAS** não usa essa informação para validar/rejeitar

## O Que Será Implementado

### 1. Validação no Prompt da IA (Prevenção)

Adicionar regras explícitas no bloco `### REGRAS CRÍTICAS DE AGENDAMENTO ###`:

```
9. VALIDAÇÃO DE CONSISTÊNCIA: Se o cliente mencionar um dia da semana E uma data numérica que NÃO correspondem (ex: "quinta-feira 07/02" quando 07/02 é sábado):
   - NÃO confirme o agendamento
   - Informe o erro de forma clara e educada
   - Ofereça as opções corretas: "07/02 é sábado" ou "a próxima quinta-feira é 12/02"
   - Só prossiga após o cliente escolher uma opção válida

10. CONFIRMAÇÃO OBRIGATÓRIA: Antes de chamar book_appointment, SEMPRE confirme:
   - Data numérica (ex: 12/02)
   - Dia da semana correspondente (ex: quinta-feira)
   - Horário (ex: 11:00)
   Exemplo: "Confirmo: quinta-feira, 12/02 às 11:00. Correto?"
```

### 2. Novo Parâmetro na Função `book_appointment`

Adicionar um parâmetro opcional `expected_weekday` que a IA deve informar:

```typescript
expected_weekday: {
  type: "string",
  description: "Dia da semana esperado em português (segunda-feira, terça-feira, etc). OBRIGATÓRIO para validação de consistência."
}
```

### 3. Validação Backend (Última Barreira)

Adicionar validação no handler `book_appointment` que verifica se a data corresponde ao dia da semana esperado:

```typescript
// Validate weekday consistency if expected_weekday is provided
if (args.expected_weekday) {
  const normalizedExpected = args.expected_weekday.toLowerCase().trim();
  const normalizedCalculated = calculatedDayName.toLowerCase();
  
  if (normalizedExpected !== normalizedCalculated) {
    console.log(`[book_appointment] INCONSISTENCY DETECTED: Expected "${normalizedExpected}" but date ${date} is actually "${normalizedCalculated}"`);
    return JSON.stringify({
      success: false,
      error: `INCONSISTÊNCIA DETECTADA: Você mencionou "${args.expected_weekday}", mas ${date.split('-').reverse().join('/')} é ${calculatedDayName}. Por favor, confirme a data correta com o cliente.`,
      suggestion: `Opções: "${calculatedDayName}, ${date.split('-').reverse().join('/')}" ou verifique a data correta para "${normalizedExpected}" na lista de próximos dias.`
    });
  }
}
```

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Tool definition `book_appointment` (~linha 400) | Adicionar parâmetro `expected_weekday` |
| `ai-chat/index.ts` | Handler `book_appointment` (~linha 1398) | Adicionar validação de consistência |
| `ai-chat/index.ts` | Regras de agendamento (~linha 3295) | Adicionar regras 9 e 10 de validação |

## Fluxo Após Correção

```text
Cliente: "Quero agendar pra quinta-feira 07/02"
     ↓
IA consulta "PRÓXIMOS DIAS": 07/02 = sábado ⚠️
     ↓
IA detecta inconsistência antes de agendar
     ↓
IA responde: "Identifiquei uma inconsistência: 07/02 é sábado.
Você gostaria de agendar para:
• Sábado, 07/02
• Ou quinta-feira, 12/02?"
     ↓
Cliente: "Quinta-feira"
     ↓
IA confirma: "Perfeito! Confirmo: quinta-feira, 12/02. Qual horário?"
     ↓
Cliente: "11:00"
     ↓
IA chama book_appointment(date: "2026-02-12", time: "11:00", expected_weekday: "quinta-feira", ...)
     ↓
Backend valida: 12/02 = quinta-feira ✓ (corresponde ao esperado)
     ↓
Agendamento criado corretamente ✅
```

## Proteção em Camadas

| Camada | Mecanismo | Objetivo |
|--------|-----------|----------|
| 1. Prompt | Lista "PRÓXIMOS DIAS" | IA consulta referência correta |
| 2. Regras | Regras 9 e 10 | IA não confirma inconsistências |
| 3. Backend | Parâmetro `expected_weekday` | Última validação antes de criar |

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Cliente diz "quinta 07/02" | IA agenda 07/02 (sábado) ❌ | ✅ IA detecta e oferece opções |
| Inconsistência passa despercebida | Agendamento errado criado | ✅ Backend rejeita e explica |
| Confirmação antes de agendar | Pode ser incompleta | ✅ Obrigatório: dia + data + horário |

## Risco de Quebra

**Muito Baixo**
- Adiciona validação, não remove funcionalidade
- Parâmetro `expected_weekday` é opcional (backward compatible)
- Se a IA não passar o parâmetro, o agendamento ainda funciona
- Apenas rejeita quando há inconsistência clara
