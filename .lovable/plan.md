

# Correção: IA não está executando `change_status` para status Desqualificado

## Diagnóstico

A IA Maria **identificou corretamente** que o cliente (aposentado desde 2005 = mais de 10 anos) deve ser marcado como Desqualificado e executou:
- ✅ Tag "10 anos ++"
- ✅ Tag "Não tem direito a revisão"  
- ✅ Transferência para departamento "Finalizado"

Porém **NÃO executou**:
- ❌ `change_status` de "Qualificado" → "Desqualificado"

### Causa Raiz

O prompt da Maria contém instruções como:
```
Adicione ou troque o status @status:Desqualificado e a tag @etiqueta:Não tem direito a revisão...
```

Essas mentions (`@status:`, `@etiqueta:`, `@departamento:`) são **instruções textuais** para a IA entender o que fazer, mas a IA precisa **chamar as tools** para executá-las. 

A IA executou algumas ações (tags, departamento) mas **esqueceu** de chamar `change_status`, possivelmente porque já havia no fluxo anterior colocado o status "Qualificado" e o modelo não priorizou essa mudança.

---

## Solução Proposta

Adicionar uma **instrução explícita** no sistema que lembra a IA de executar TODAS as ações mencionadas no prompt quando há mentions de status, tags ou departamentos.

### Alteração no arquivo `supabase/functions/ai-chat/index.ts`

Adicionar no bloco `toolBehaviorRules` (ou criar um novo bloco de regras) uma instrução que enfatiza a execução completa das tools:

```typescript
const toolExecutionRules = `

### REGRAS DE EXECUÇÃO DE TOOLS (OBRIGATÓRIO) ###

Quando o prompt mencionar ações usando @status:, @etiqueta:, @departamento:, @responsavel:
você DEVE chamar as tools correspondentes. Não basta mencionar - você precisa EXECUTAR:

- @status:NomeDoStatus → CHAMAR tool "change_status" com status_name="NomeDoStatus"
- @etiqueta:NomeDaTag → CHAMAR tool "add_tag" com tag_name="NomeDaTag"  
- @departamento:NomeDoDept → CHAMAR tool "transfer_to_department" com department_name="NomeDoDept"
- @responsavel:NomeDoResp → CHAMAR tool "transfer_to_responsible" com responsible_name="NomeDoResp"

IMPORTANTE: Se o prompt indicar múltiplas ações (ex: mudar status E adicionar tag E transferir), 
você DEVE executar TODAS elas. Não omita nenhuma.

VERIFICAÇÃO: Antes de responder ao cliente, confirme que executou todas as actions mencionadas no prompt para aquela situação.

`;
```

E modificar a construção do `fullSystemPrompt`:

```typescript
const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText + toolBehaviorRules + toolExecutionRules;
```

---

## Fluxo Corrigido

```text
┌──────────────────────────────────────────────────────────────┐
│                    PROMPT DA MARIA                           │
├──────────────────────────────────────────────────────────────┤
│  "...Adicione o status @status:Desqualificado                │
│   e a tag @etiqueta:Não tem direito a revisão                │
│   transfira para @departamento:Finalizado..."                │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│              NOVA REGRA INJETADA                             │
├──────────────────────────────────────────────────────────────┤
│  "Quando o prompt mencionar @status:X, você DEVE             │
│   chamar a tool change_status com status_name=X"             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                    IA EXECUTA                                │
├──────────────────────────────────────────────────────────────┤
│  1. change_status("Desqualificado")        ← AGORA EXECUTA   │
│  2. add_tag("Não tem direito a revisão")   ✅                │
│  3. add_tag("10 anos ++")                  ✅                │
│  4. transfer_to_department("Finalizado")   ✅                │
└──────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ai-chat/index.ts` | Adicionar regras de execução de tools no system prompt |

---

## Seção Técnica

### Localização Exata

Linha ~3555-3575 onde `toolBehaviorRules` é definido. A nova variável `toolExecutionRules` será adicionada logo após e concatenada ao `fullSystemPrompt`.

### Código Completo

```typescript
// Adicionar após linha 3573 (fim do toolBehaviorRules)

const toolExecutionRules = `

### REGRAS DE EXECUÇÃO DE AÇÕES CRM (OBRIGATÓRIO) ###

Quando o seu prompt de configuração mencionar ações usando os formatos:
- @status:NomeDoStatus
- @etiqueta:NomeTag ou @tag:NomeTag
- @departamento:NomeDept
- @responsavel:NomeResp ou @responsavel:IA:NomeAgente

Você DEVE chamar as tools correspondentes para executar essas ações:

| Mention no Prompt        | Tool a Chamar           | Parâmetro               |
|--------------------------|-------------------------|-------------------------|
| @status:Desqualificado   | change_status           | status_name             |
| @etiqueta:10 anos ++     | add_tag                 | tag_name                |
| @departamento:Finalizado | transfer_to_department  | department_name         |
| @responsavel:Caio        | transfer_to_responsible | responsible_name        |

⚠️ REGRA CRÍTICA: 
Se uma situação no seu prompt indica múltiplas ações (ex: mudar status + adicionar tag + transferir),
você DEVE chamar TODAS as tools correspondentes. NÃO omita nenhuma ação.

Exemplo: Se o prompt diz "Adicione o status @status:Desqualificado e a tag @etiqueta:Não tem direito a revisão"
→ Você DEVE chamar change_status E add_tag (2 tools).

`;

// Modificar a construção do fullSystemPrompt
const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText + toolBehaviorRules + toolExecutionRules;
```

---

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Tokens adicionais | **BAIXO** | ~300 tokens extras (~0.5% do total) |
| Performance | **NENHUM** | Não adiciona lógica, apenas instrução |
| Retrocompatibilidade | **NENHUM** | Agentes que já funcionam continuarão |
| Correção do bug | **ALTO** | Resolve o problema de ações omitidas |

---

## Resultado Esperado

Após a correção, a IA Maria:
1. Vai **sempre** executar `change_status` quando o prompt mencionar `@status:X`
2. Não vai mais "esquecer" de executar ações quando há múltiplas no mesmo fluxo
3. O cliente 743596 (e futuros similares) será corretamente marcado como "Desqualificado"

