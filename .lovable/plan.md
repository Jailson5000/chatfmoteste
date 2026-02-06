

# Plano: Proibir Repetição da Lista de Serviços

## Problema Identificado

Na imagem:
- **17:46** → IA lista os 4 serviços (correto, primeira vez)
- **17:46** → Cliente escolhe: "o 4, pra quarta feira, as 13:30"
- **17:47** → IA confirma: "deseja agendar Head Spa na quarta-feira, 11/02, às 13:30?"
- **17:47** → Cliente: "isso mesmo, pode confirmar"
- **17:48** → IA **REPETE** toda a lista de 4 serviços ❌
- **17:48** → IA confirma novamente: "Confirma que deseja agendar..."

A regra 5 atual diz apenas "NÃO repita a lista", mas não proíbe chamar `list_services` novamente. A IA está chamando a ferramenta desnecessariamente.

## Resposta à Pergunta

**Não vai quebrar nada!** A lista de serviços é apenas informativa. O agendamento usa o `service_id` que a IA já tem em memória da primeira listagem. Repetir a lista é:
- Redundante
- Irritante para o cliente
- Gasto desnecessário de tokens

## Correção Proposta

### 1. Reforçar Regra 5 (mais específica)

Substituir a regra atual por uma versão mais forte e explícita:

```
5. PROIBIDO REPETIR SERVIÇOS: 
   - Chame list_services APENAS UMA VEZ por conversa
   - Se o cliente já conhece os serviços, NÃO chame list_services novamente
   - Na confirmação final, mencione apenas o serviço escolhido (ex: "Head Spa"), NÃO liste todos
   - Se precisar do service_id, use o que você já obteve anteriormente
```

### 2. Atualizar Descrição da Ferramenta `list_services`

Adicionar na descrição da ferramenta que ela deve ser chamada apenas uma vez:

```typescript
description: "Lista todos os serviços disponíveis para agendamento. REGRAS: 
1) Chame esta função APENAS UMA VEZ por conversa. 
2) Se você já listou os serviços anteriormente, NÃO chame novamente - use o service_id que você já tem. 
3) Ao apresentar, mostre TODOS os serviços retornados. 
4) Use o campo 'services_list_for_response' para a lista formatada."
```

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `ai-chat/index.ts` | Descrição `list_services` (~linha 367) | Adicionar regra "chamar apenas UMA VEZ" |
| `ai-chat/index.ts` | Regra 5 (~linha 3315) | Expandir com proibição explícita |

## Fluxo Após Correção

```text
17:46 → IA chama list_services (ÚNICA VEZ)
17:46 → IA lista os 4 serviços
17:46 → Cliente: "o 4, pra quarta feira, as 13:30"
17:47 → IA confirma: "Só para confirmar: Head Spa na quarta-feira, 11/02, às 13:30?"
17:47 → Cliente: "isso mesmo, pode confirmar"
17:48 → IA chama book_appointment (SEM chamar list_services novamente!)
17:48 → "Seu agendamento foi realizado com sucesso! ✅"
```

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Primeira listagem | Lista 4 serviços ✓ | Lista 4 serviços ✓ |
| Confirmação | ❌ Lista 4 serviços DE NOVO | ✅ Confirma só "Head Spa" |
| Chamadas a list_services | Múltiplas (2-3x) | ✅ Apenas 1x |

## Risco de Quebra

**Nenhum**
- Não altera lógica de agendamento
- Apenas orienta a IA a não repetir informação
- O `service_id` continua disponível na memória da conversa

