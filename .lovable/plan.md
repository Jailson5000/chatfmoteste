
# Plano de Correção: Comportamento da IA com Status e Notificação de Transferência

## Resumo do Problema

Dois bugs identificados no comportamento do agente de IA "Maria":

1. **Status incorreto**: Cliente disse que NÃO pediu revisão, mas IA colocou "Qualificado" em vez de "Desqualificado"
2. **Notificação indevida**: IA avisou "Vou transferir sua consulta para o departamento adequado" mesmo com a configuração "Notificar cliente" **desativada**

---

## Análise Técnica

### Problema 1: Status Incorreto

| Aspecto | Detalhes |
|---------|----------|
| Local | Prompt do agente (prompt de usuário, não código) |
| Causa | A IA interpretou a negativa do cliente como sendo sobre o prazo, não sobre a intenção |
| Solução | Reforço no prompt com instrução mais explícita |

O prompt atual diz:
> "Se a resposta for 'não'... Adicione o status @status:Desqualificado"

Mas a IA falhou em reconhecer "não solicitei a revisão" como uma resposta negativa clara.

### Problema 2: Notificação Indevida de Transferência

| Aspecto | Detalhes |
|---------|----------|
| Local | `supabase/functions/ai-chat/index.ts` |
| Causa | O sistema retorna `[AÇÃO INTERNA - NÃO INFORME AO CLIENTE]` no tool result, mas NÃO há instrução no prompt de sistema para respeitar essa marcação |
| Solução | Adicionar instrução explícita no prompt de sistema sobre comportamento de transferência silenciosa |

```text
Fluxo atual (com bug):
1. IA chama transfer_to_department
2. Sistema executa e retorna: "[AÇÃO INTERNA - NÃO INFORME AO CLIENTE] ..."
3. IA recebe o tool result
4. IA decide (por conta própria) se menciona ou não ao cliente
   → Às vezes ignora a instrução embutida no resultado
```

---

## Plano de Implementação

### Etapa 1: Adicionar Instrução de Sistema sobre Tool Results (Correção Principal)

**Arquivo:** `supabase/functions/ai-chat/index.ts`

Injetar uma instrução explícita no prompt de sistema sobre como tratar transferências:

```typescript
// Após construir o fullSystemPrompt, adicionar regras de tools
const toolBehaviorRules = `

### REGRAS CRÍTICAS DE TOOLS DE CRM ###
1. Quando o resultado de uma tool começar com "[AÇÃO INTERNA - NÃO INFORME AO CLIENTE]", você NÃO DEVE mencionar essa ação ao cliente de forma alguma. Continue a conversa naturalmente sem referência à transferência, mudança de departamento ou responsável.

2. Quando o resultado indicar "notify_client: false", significa que a ação foi configurada para ser silenciosa. Não diga ao cliente que ele será transferido, não mencione departamentos, nem diga que outra pessoa vai atender.

3. Siga as instruções exatas do tool result - se ele diz para não informar, NÃO informe.
`;

// Injetar ANTES do prompt do usuário
const fullSystemPrompt = systemPrompt + knowledgeText + toolBehaviorRules;
```

### Etapa 2: Reforço Adicional no Tool Result (Dupla Proteção)

**Arquivo:** `supabase/functions/ai-chat/index.ts`

Alterar a mensagem de retorno da tool para ser ainda mais enfática:

**Antes (linhas 654-657):**
```typescript
message: `[AÇÃO INTERNA - NÃO INFORME AO CLIENTE] Conversa transferida para o departamento ${targetDept.name}. Continue o atendimento normalmente sem mencionar a transferência.`
```

**Depois:**
```typescript
message: `[AÇÃO SILENCIOSA EXECUTADA - PROIBIDO MENCIONAR AO CLIENTE] A conversa foi transferida para ${targetDept.name} internamente. INSTRUÇÃO OBRIGATÓRIA: NÃO mencione esta ação, NÃO diga que está transferindo, NÃO fale em departamentos. Continue a conversa como se nada tivesse acontecido ou encerre naturalmente se for o caso.`
```

### Etapa 3: Aplicar a Mesma Correção para transfer_to_responsible

**Arquivo:** `supabase/functions/ai-chat/index.ts`

Mesma alteração nas linhas 904-908 (transferência para responsável humano).

---

## Detalhes Técnicos da Implementação

### Alteração 1: Adicionar regras de comportamento de tools no prompt

**Localização:** Linha ~3549, antes de construir o array `messages`

```typescript
// Tool behavior rules - injected to ensure AI respects internal actions
const toolBehaviorRules = notifyOnTransfer ? "" : `

### COMPORTAMENTO EM TRANSFERÊNCIAS SILENCIOSAS ###
ATENÇÃO: O modo "Notificar cliente ao transferir" está DESATIVADO para este agente.
Quando você executar qualquer ação de transferência (departamento, responsável, IA):
- NÃO diga ao cliente que ele será transferido
- NÃO mencione departamentos ou nomes de atendentes
- NÃO use frases como "vou transferir", "encaminhando", "outro atendente vai te atender"
- Continue a conversa naturalmente OU encerre com despedida simples
- Se o tool result contiver "[AÇÃO INTERNA" ou "notify_client: false", é OBRIGATÓRIO silenciar

Exemplo de resposta CORRETA após transferência silenciosa:
"Foi um prazer ajudá-lo! Qualquer dúvida, estamos à disposição."

Exemplo de resposta ERRADA (nunca faça isso):
"Vou transferir sua consulta para o departamento adequado."
`;

const fullSystemPrompt = systemPrompt + knowledgeText + toolBehaviorRules;
```

### Alteração 2: Reforçar mensagens de tool results

**Localizações:**
- Linha 654-658: `transfer_to_department` (notify_client: false)
- Linha 904-908: `transfer_to_responsible` (notify_client: false)

---

## Impacto e Riscos

| Aspecto | Avaliação |
|---------|-----------|
| Risco de quebra | **BAIXO** - Apenas adicionando instruções, não alterando lógica |
| Impacto em outras funcionalidades | **NENHUM** - Não afeta agendamento, tags, status |
| Tokens adicionais | ~100 tokens extras por chamada quando notify=false |
| Retrocompatibilidade | **TOTAL** - Agentes com notify_on_transfer=true não são afetados |

---

## Sobre o Problema 1 (Status Qualificado vs Desqualificado)

Este problema é mais de **aderência ao prompt** do que de bug de código. Recomendações:

1. **No prompt do agente Maria**, adicionar instrução mais explícita:
   ```
   IMPORTANTE: Se o cliente disser "não", "não pedi", "não solicitei" ou qualquer negativa 
   sobre ter pedido a revisão, ele deve ser marcado como Desqualificado, NÃO como Qualificado.
   ```

2. **Considerar usar palavras-chave mais específicas** no prompt que a IA possa detectar claramente

A correção de código proposta aqui não resolve diretamente o Problema 1, que é comportamental do modelo. Porém, as instruções mais claras sobre respeitar tool results podem melhorar a aderência geral.

---

## Arquivos Modificados

1. `supabase/functions/ai-chat/index.ts`
   - Adicionar regras de comportamento para transferências silenciosas (~linha 3549)
   - Atualizar mensagem de `transfer_to_department` quando notify=false (linhas 654-658)
   - Atualizar mensagem de `transfer_to_responsible` quando notify=false (linhas 904-908)

---

## Testes Recomendados

Após implementação:

1. **Teste de transferência silenciosa**: Enviar mensagem que dispare transferência de departamento com notify_on_transfer=false e verificar se a IA NÃO menciona a transferência
2. **Teste de transferência notificada**: Ativar notify_on_transfer=true e verificar se a IA corretamente informa sobre a transferência
3. **Teste de regressão**: Verificar que agendamentos, tags e status continuam funcionando normalmente
