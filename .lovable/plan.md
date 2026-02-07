
# Plano: Injeção Automática de Data/Hora em TODOS os Agentes de IA

## Resumo do Problema

Atualmente, a data/hora só é injetada se o prompt do agente contiver explicitamente as tags `@Data atual` ou `@Hora atual`. Isso causa erros lógicos quando a IA precisa fazer cálculos de prazo (como o caso da aposentadoria de 10 anos) mas o prompt não contém essas tags.

## Solução Proposta

Injetar **automaticamente** um prefixo com data, hora e dia da semana no início do system prompt de TODOS os agentes, independentemente de terem as tags ou não.

---

## Alteração Necessária

### Arquivo: `supabase/functions/ai-chat/index.ts`

**Localização**: Linha ~3575 (construção do `fullSystemPrompt`)

**De:**
```typescript
const fullSystemPrompt = systemPrompt + knowledgeText + toolBehaviorRules;
```

**Para:**
```typescript
// AUTO-INJECT: Current date/time context for ALL agents
const now = new Date();
const timezone = lawFirmData?.timezone || "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: timezone,
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric"
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: timezone,
  hour: "2-digit",
  minute: "2-digit"
});

const currentDate = dateFormatter.format(now);
const currentTime = timeFormatter.format(now);

const dateContextPrefix = `📅 CONTEXTO TEMPORAL (SEMPRE CONSIDERE):
Data de hoje: ${currentDate}
Hora atual: ${currentTime}
Fuso horário: ${timezone}

REGRA CRÍTICA: Sempre considere a data atual ao fazer cálculos de prazos, analisar datas mencionadas pelo cliente, ou responder perguntas que envolvam tempo.

---

`;

const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText + toolBehaviorRules;
```

---

## Fluxo de Injeção

```text
┌──────────────────────────────────────────────────────────────┐
│                CONSTRUÇÃO DO SYSTEM PROMPT                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────┐                     │
│  │      📅 CONTEXTO TEMPORAL           │  ← AUTOMÁTICO      │
│  │  Data: quinta-feira, 6 de fev 2025  │                     │
│  │  Hora: 14:35                        │                     │
│  │  Timezone: America/Sao_Paulo        │                     │
│  └─────────────────────────────────────┘                     │
│                     +                                        │
│  ┌─────────────────────────────────────┐                     │
│  │      Prompt do Agente               │  ← Configurado     │
│  │  (ex: "Você é Maria, especialista   │    pelo admin      │
│  │   em direito previdenciário...")    │                     │
│  └─────────────────────────────────────┘                     │
│                     +                                        │
│  ┌─────────────────────────────────────┐                     │
│  │      Base de Conhecimento           │  ← Vinculada       │
│  └─────────────────────────────────────┘                     │
│                     +                                        │
│  ┌─────────────────────────────────────┐                     │
│  │      Regras de Transferência        │  ← Automático      │
│  └─────────────────────────────────────┘                     │
│                                                              │
│                     =                                        │
│                                                              │
│  ┌─────────────────────────────────────┐                     │
│  │      fullSystemPrompt               │  → Enviado à IA    │
│  └─────────────────────────────────────┘                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Retrocompatibilidade | **NENHUM** | Agentes existentes funcionam igual, só ganham contexto extra |
| Conflito com @Data atual | **NENHUM** | As substituições manuais continuam funcionando normalmente |
| Tamanho do prompt | **MÍNIMO** | Adiciona ~200 caracteres (~50 tokens) |
| Performance | **NENHUM** | Formatação de data é operação trivial |
| Consistência | **MELHORA** | Todas as IAs terão acesso à data correta |

---

## Exemplo de Resultado

Antes da mudança, a IA Maria não sabia a data atual e fez cálculo errado sobre prazo de 10 anos.

**Após a mudança**, o início do system prompt será:

```
📅 CONTEXTO TEMPORAL (SEMPRE CONSIDERE):
Data de hoje: sexta-feira, 7 de fevereiro de 2025
Hora atual: 10:30
Fuso horário: America/Sao_Paulo

REGRA CRÍTICA: Sempre considere a data atual ao fazer cálculos de prazos...

---

Você é Maria, a assistente virtual especializada em direito previdenciário...
```

Isso permitirá que a IA calcule corretamente:
- "Aposentadoria em 2015 → 10 anos = 2025 → prazo ainda NÃO passou"

---

## Arquivo Modificado

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ai-chat/index.ts` | Adicionar prefixo de data automático na linha ~3575 |

---

## Seção Técnica

### Localização Exata

```typescript
// Linha 3575 atual:
const fullSystemPrompt = systemPrompt + knowledgeText + toolBehaviorRules;

// Alteração: Adicionar bloco de 15-20 linhas ANTES desta linha
// para criar dateContextPrefix e modificar a concatenação
```

### Variáveis Já Disponíveis no Escopo

- `lawFirmData` - contém o timezone da empresa (linha ~3284)
- `now` já é usado mais acima para substituições (linha ~3388)

### Consideração: Evitar Duplicação

O código já cria `brazilFormatter` e `timeFormatter` nas linhas 3389-3396 para substituição de tags. Vamos **reutilizar** essa lógica movendo-a para cima e criando os formatadores uma única vez.
