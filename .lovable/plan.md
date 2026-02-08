

# Correção: Remover Regras de Negócio Hardcoded do ai-chat

## Problema Identificado

A correção anterior adicionou esta regra específica ao `ai-chat`:

```typescript
### REGRA ESPECÍFICA: STATUS "DESQUALIFICADO" ###

🚨 CENÁRIO CRÍTICO DE DESQUALIFICAÇÃO:
Quando o cliente NÃO tem direito à revisão (ex: aposentadoria há mais de 10 anos...
```

**Este é um problema porque:**

| Agente | Segmento | Tem regra de 10 anos? |
|--------|----------|----------------------|
| Maria/Laura | Advogados - Revisão de aposentadoria | ✅ Sim, no prompt |
| Vendas 24hs | E-commerce de peças | ❌ Não |
| Eloisa | Agendamentos | ❌ Não |
| Ana | Vendas B2B | ❌ Não |
| Davi | Triagem inicial | ❌ Não |

A regra "hardcoded" de 10 anos pode **confundir agentes de outros segmentos** que não têm nada a ver com aposentadoria.

---

## Solução Correta

**Remover a regra de negócio específica** e substituir por uma **instrução genérica** que força a IA a seguir exatamente o que está no prompt do agente.

### Antes (Problemático)
```typescript
### REGRA ESPECÍFICA: STATUS "DESQUALIFICADO" ###

CENÁRIO CRÍTICO: Quando o cliente tem mais de 10 anos de aposentadoria...
```

### Depois (Correto)
```typescript
### REGRA DE EXECUÇÃO DE STATUS ###

Quando o seu prompt de configuração mencionar uma mudança de status usando @status:X,
você DEVE chamar a tool "change_status" com o status exato mencionado.

REGRA CRÍTICA DE CONSISTÊNCIA:
- Analise a situação ANTES de decidir qual status usar
- Chame change_status apenas UMA vez com o status CORRETO
- Não mude para um status intermediário e depois tente corrigir
- Siga EXATAMENTE as condições descritas no seu prompt

Exemplo: Se o prompt diz "quando condição X, use @status:Desqualificado" 
→ E a condição X foi atendida
→ Você DEVE chamar change_status("Desqualificado")
→ NÃO chame change_status("Qualificado") neste cenário
```

---

## Por que isso funciona

1. **Cada agente tem seu próprio prompt** com regras de negócio específicas
2. **O código do ai-chat não deve saber** quais são essas regras
3. **A instrução genérica** apenas reforça: "siga o que está no seu prompt"
4. **A lógica de 10 anos** continua funcionando para Maria/Laura porque está no prompt delas
5. **Vendas 24hs e Ana** não são afetadas porque seus prompts não mencionam aposentadoria

---

## Fluxo Correto

```text
┌────────────────────────────────────────────────────────────────┐
│                    AGENTE MARIA (Advogados)                    │
├────────────────────────────────────────────────────────────────┤
│  Prompt específico:                                            │
│  "Se aposentadoria > 10 anos → @status:Desqualificado"         │
│                       ↓                                        │
│  Regra genérica do ai-chat:                                    │
│  "Quando seu prompt mencionar @status:X, execute change_status"│
│                       ↓                                        │
│  IA executa: change_status("Desqualificado") ✅                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    AGENTE VENDAS 24HS (E-commerce)             │
├────────────────────────────────────────────────────────────────┤
│  Prompt específico:                                            │
│  (Nada sobre aposentadoria ou 10 anos)                         │
│                       ↓                                        │
│  Regra genérica do ai-chat:                                    │
│  "Quando seu prompt mencionar @status:X, execute change_status"│
│                       ↓                                        │
│  IA não é confundida com regras irrelevantes ✅                │
└────────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ai-chat/index.ts` | Substituir regra específica por regra genérica |

---

## Seção Técnica

### Código a Substituir (linhas ~3602-3619)

**Remover:**
```typescript
### REGRA ESPECÍFICA: STATUS "DESQUALIFICADO" ###

🚨 CENÁRIO CRÍTICO DE DESQUALIFICAÇÃO:
Quando o cliente NÃO tem direito à revisão (ex: aposentadoria há mais de 10 anos, prazo decadencial expirado):

1. Você DEVE chamar a tool "change_status" com status_name="Desqualificado" (ou nome equivalente)
2. NÃO chame change_status com "Qualificado" neste cenário - isso é um ERRO
3. FAÇA APENAS UMA chamada de change_status com o status CORRETO desde o início
4. Se o prompt menciona "@status:Desqualificado" para uma situação específica, use EXATAMENTE esse status

EXEMPLO DE RACIOCÍNIO CORRETO:
- Cliente diz: "me aposentei em 2015" (mais de 10 anos)
- Ação: chamar change_status com status_name="Desqualificado"
- ERRADO: Marcar como "Qualificado" e depois tentar corrigir

LEMBRE-SE: O status do CRM deve refletir a CONCLUSÃO da análise, não um estado intermediário.
```

**Adicionar:**
```typescript
### REGRA DE EXECUÇÃO DE STATUS (OBRIGATÓRIO) ###

Quando uma situação descrita no seu prompt de configuração indicar um status específico usando @status:X:

1. ANALISE a situação ANTES de decidir qual status usar
2. IDENTIFIQUE qual condição do seu prompt foi atendida
3. EXECUTE change_status com o status EXATO mencionado naquela condição
4. NÃO use status intermediários - vá direto para o status correto

REGRA CRÍTICA DE CONSISTÊNCIA:
- Se o prompt diz "quando situação A → @status:X" e a situação A ocorreu
- Você DEVE chamar change_status(status_name="X")
- NÃO chame change_status com outro status e depois tente corrigir

EXEMPLO GENÉRICO:
- Seu prompt diz: "quando condição Y ocorrer, use @status:Z"
- Cliente satisfez a condição Y
- ✅ CORRETO: change_status(status_name="Z")
- ❌ ERRADO: change_status(status_name="W") e depois change_status(status_name="Z")

IMPORTANTE: As regras de negócio específicas (quando usar qual status) estão no SEU PROMPT.
Esta regra apenas garante que você EXECUTE as ações que seu prompt determina.
```

---

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Retrocompatibilidade | NENHUM | Agentes de advocacia continuam funcionando via seus prompts |
| Outros segmentos | CORRIGIDO | Não serão mais confundidos com regras de aposentadoria |
| Clareza | MELHOR | Regra genérica é mais fácil de entender |
| Manutenção | MELHOR | Regras de negócio ficam apenas no prompt do agente |

---

## Resultado Esperado

1. **Maria/Laura** continuam funcionando normalmente (regra de 10 anos está no prompt delas)
2. **Vendas 24hs, Ana, Eloisa** não são mais confundidas com regras irrelevantes
3. **Qualquer novo agente** de qualquer segmento funcionará corretamente
4. **Código do ai-chat** fica agnóstico a regras de negócio específicas

