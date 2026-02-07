

# Correção: Erro "lawFirmData is not defined"

## Diagnóstico

O erro ocorre porque a variável `lawFirmData` foi declarada **dentro** de um bloco condicional (linhas 3341-3460) mas está sendo usada **fora** desse bloco na linha 3578.

```text
Linha 3341: if (agentLawFirmId && systemPrompt) {
Linha 3343:   const { data: lawFirmData } = await supabase...  ← Declarada AQUI
Linha 3460: }                                                  ← Escopo termina AQUI

Linha 3578: const autoInjectTimezone = lawFirmData?.timezone   ← ERRO! Fora do escopo
```

---

## Solução Proposta

Buscar o timezone **independentemente** usando `agentLawFirmId` (que está disponível no escopo externo desde a linha 3217).

### Alteração Necessária

**Arquivo:** `supabase/functions/ai-chat/index.ts`
**Linhas:** 3575-3607

**De:**
```typescript
// AUTO-INJECT: Current date/time context for ALL agents
const autoInjectNow = new Date();
const autoInjectTimezone = lawFirmData?.timezone || "America/Sao_Paulo";  // ← ERRO
```

**Para:**
```typescript
// AUTO-INJECT: Current date/time context for ALL agents
const autoInjectNow = new Date();

// Fetch timezone for the law firm (agentLawFirmId is available in outer scope)
let autoInjectTimezone = "America/Sao_Paulo";
if (agentLawFirmId) {
  const { data: tzData } = await supabase
    .from("law_firms")
    .select("timezone")
    .eq("id", agentLawFirmId)
    .maybeSingle();
  if (tzData?.timezone) {
    autoInjectTimezone = tzData.timezone;
  }
}
```

---

## Fluxo Corrigido

```text
┌────────────────────────────────────────────────────────────────┐
│                    ESCOPO DE VARIÁVEIS                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Linha 3217: const agentLawFirmId = automation.law_firm_id     │
│              ↓ (disponível em todo o escopo da função)         │
│                                                                │
│  Linha 3341: if (agentLawFirmId && systemPrompt) {             │
│              │  const { data: lawFirmData } = ...   ← INTERNO  │
│              │  ... processamento de mentions ...              │
│  Linha 3460: }                                                 │
│                                                                │
│  Linha 3575: // AUTO-INJECT                                    │
│              if (agentLawFirmId) {                             │
│                  const { data: tzData } = ...       ← BUSCA    │
│                  autoInjectTimezone = tzData?.timezone         │
│              }                                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Consideração: Evitar Query Duplicada

Poderíamos reutilizar `lawFirmData` se a movêssemos para fora do bloco condicional, mas isso requereria uma refatoração maior. A abordagem proposta:

- **Adiciona uma query simples** (apenas campo `timezone`)
- **É mais segura** (menos impacto no código existente)
- **É rápida** (query leve com índice em `id`)

---

## Arquivo Modificado

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ai-chat/index.ts` | Corrigir busca de timezone na linha 3577-3580 |

---

## Seção Técnica

### Código Final Corrigido (linhas 3575-3610)

```typescript
// AUTO-INJECT: Current date/time context for ALL agents
// This ensures every AI agent knows the current date for accurate reasoning
const autoInjectNow = new Date();

// Fetch timezone for the law firm (agentLawFirmId is available in outer scope)
let autoInjectTimezone = "America/Sao_Paulo";
if (agentLawFirmId) {
  const { data: tzData } = await supabase
    .from("law_firms")
    .select("timezone")
    .eq("id", agentLawFirmId)
    .maybeSingle();
  if (tzData?.timezone) {
    autoInjectTimezone = tzData.timezone;
  }
}

const autoDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: autoInjectTimezone,
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric"
});
const autoTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: autoInjectTimezone,
  hour: "2-digit",
  minute: "2-digit"
});

const autoCurrentDate = autoDateFormatter.format(autoInjectNow);
const autoCurrentTime = autoTimeFormatter.format(autoInjectNow);

const dateContextPrefix = `📅 CONTEXTO TEMPORAL (SEMPRE CONSIDERE):
Data de hoje: ${autoCurrentDate}
Hora atual: ${autoCurrentTime}
Fuso horário: ${autoInjectTimezone}

REGRA CRÍTICA: Sempre considere a data atual ao fazer cálculos de prazos, analisar datas mencionadas pelo cliente, ou responder perguntas que envolvam tempo.

---

`;

const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText + toolBehaviorRules;
```

---

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Query adicional | **BAIXÍSSIMO** | Query leve, apenas 1 campo, com índice |
| Performance | **NENHUM** | ~2ms adicional por request |
| Retrocompatibilidade | **NENHUM** | Fallback para America/Sao_Paulo |
| Correção do bug | **CRÍTICO** | Necessário para o sistema funcionar |

