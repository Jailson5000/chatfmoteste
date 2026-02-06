
# Plano: Corrigir Referência de Data Dinâmica para Agendamento

## Problema Identificado

### Evidência dos Logs
```
[Scheduling] Injecting Brazil date/time: sexta-feira, 06/02/2026, 17:18 (ISO: 2026-02-06)
```

A data está sendo injetada **corretamente** como **sexta-feira, 06/02/2026**.

### Mas o Exemplo Estático Contradiz
No código atual (linha 3271):
```
6. CÁLCULO DE DATAS: Use a data atual acima como referência absoluta. 
   Exemplo: Se hoje é quinta-feira 06/02, então:
   - "quarta-feira" = próxima quarta = 11/02 (NÃO 12/02!)
   - "sexta-feira" = amanhã = 07/02
   - "segunda-feira" = 10/02
```

**O problema**: O exemplo está fixo como "quinta-feira 06/02" - mas hoje na verdade é **sexta-feira 06/02**. A IA vê dois dias da semana diferentes para a mesma data e fica confusa.

### Erro Resultante
- Cliente pediu: "quinta-feira às 11:00"
- IA calculou incorretamente: 07/02 como quinta-feira
- **Realidade**: 07/02/2026 é **SÁBADO**
- Próxima quinta-feira real: **12/02/2026**

---

## Causa Raiz

1. **Exemplo estático com dia fixo** contradiz a data dinâmica
2. A IA tenta conciliar "quinta-feira 06/02" (exemplo) com "sexta-feira 06/02" (real) e faz cálculos errados
3. Faltam exemplos dinâmicos com os próximos dias da semana calculados

---

## Solução Proposta

### Correção Principal: Gerar Exemplos Dinâmicos

Calcular dinamicamente os próximos dias da semana baseado na data atual real:

```typescript
if (isSchedulingAgent) {
  const nowBrazil = new Date();
  
  // Get timezone-aware date components
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
  
  // Calculate ISO date
  const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const currentIsoDate = isoDateFormatter.format(nowBrazil);
  
  // Get current day of week in Brazil (0=Sunday, 6=Saturday)
  const brazilNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentDayOfWeek = brazilNow.getDay();
  
  // Calculate dates for next 7 days dynamically
  const weekdayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const upcomingDays: string[] = [];
  
  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(brazilNow);
    futureDate.setDate(futureDate.getDate() + i);
    const futureDayOfWeek = futureDate.getDay();
    const futureDay = String(futureDate.getDate()).padStart(2, '0');
    const futureMonth = String(futureDate.getMonth() + 1).padStart(2, '0');
    upcomingDays.push(`   - "${weekdayNames[futureDayOfWeek]}" = ${futureDay}/${futureMonth}`);
  }
  
  const dynamicExamples = upcomingDays.join("\n");
  
  systemPrompt += `

### DATA E HORA ATUAIS (Brasília) ###
Hoje é ${currentDateBrazil}, ${currentTimeBrazil}.
Data em formato ISO: ${currentIsoDate}

### PRÓXIMOS DIAS (Referência para Cálculo) ###
${dynamicExamples}

### REGRAS CRÍTICAS DE AGENDAMENTO ###
1. Ao listar serviços com list_services, você DEVE apresentar ABSOLUTAMENTE TODOS os serviços retornados.
2. NUNCA resuma, agrupe ou omita serviços. Cada um deve ser mencionado individualmente.
3. Use o campo 'services_list_for_response' da resposta para garantir que a lista esteja completa.
4. O cliente tem o direito de conhecer TODAS as opções disponíveis.
5. NÃO repita a lista de serviços se já a apresentou na conversa atual.
6. CÁLCULO DE DATAS: Use a referência "PRÓXIMOS DIAS" acima. NÃO calcule manualmente.
7. SEMPRE confirme a data exata (dia da semana + data numérica) ANTES de criar o agendamento.
8. VERIFICAÇÃO: Compare o dia da semana solicitado com a lista "PRÓXIMOS DIAS" antes de chamar book_appointment.
`;
}
```

---

## Resultado Esperado

Com a correção, se hoje é **sexta-feira, 06/02/2026**, a IA receberá:

```
### DATA E HORA ATUAIS (Brasília) ###
Hoje é sexta-feira, 06/02/2026, 17:20.
Data em formato ISO: 2026-02-06

### PRÓXIMOS DIAS (Referência para Cálculo) ###
   - "sábado" = 07/02
   - "domingo" = 08/02
   - "segunda-feira" = 09/02
   - "terça-feira" = 10/02
   - "quarta-feira" = 11/02
   - "quinta-feira" = 12/02
   - "sexta-feira" = 13/02
```

Quando o cliente pedir **"quinta-feira às 11:00"**, a IA consultará a lista e verá que **quinta-feira = 12/02**, não 07/02.

---

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Seção `isSchedulingAgent` (~linha 3229-3278) | Substituir exemplo estático por cálculo dinâmico dos próximos 7 dias |

---

## Fluxo Após Correção

```text
Sistema injeta no prompt:
"### PRÓXIMOS DIAS ###
   - 'sábado' = 07/02
   - 'domingo' = 08/02
   - 'segunda-feira' = 09/02
   ...
   - 'quinta-feira' = 12/02"

Cliente: "Quero marcar pra quinta-feira"
     ↓
IA consulta lista: "quinta-feira" = 12/02 ✓
     ↓
IA confirma: "Posso agendar para quinta-feira, 12/02?"
     ↓
Cliente: "Sim, às 11:00"
     ↓
IA chama book_appointment(date: "2026-02-12", time: "11:00", ...)
     ↓
Agendamento criado para quinta-feira, 12/02 ✅
```

---

## Comparação: Antes vs Depois

| Cenário | Antes | Depois |
|---------|-------|--------|
| Hoje (06/02) | Exemplo diz "quinta-feira 06/02" | ✅ Exibe "sexta-feira, 06/02" |
| Cliente pede "quinta-feira" | IA confunde e marca 07/02 (sábado) | ✅ Consulta lista: quinta = 12/02 |
| Exemplos de datas | Fixos e desatualizados | ✅ Calculados dinamicamente |
| Próximos 7 dias | Não disponíveis | ✅ Listados com dia e data |

---

## Risco de Quebra

**Muito Baixo**
- Substitui texto estático por texto dinâmico
- Mesma estrutura de prompt, apenas conteúdo atualizado
- Nenhuma mudança nas funções de agendamento
- Adiciona informação (não remove)
