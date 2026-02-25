

# Correção: Steps 3 e 4 do uazapi-webhook estão ROUBANDO conversas de outras instâncias

## Diagnóstico Confirmado nos Logs

Acabei de capturar nos logs o bug acontecendo em tempo real com o "Jailson Ferreira":

```
13:49:09 - Found orphan conversation 0e08e890, reassigning from instance fc9dbbd6 to 10b70877
13:49:09 - Conversation resolved: 0e08e890 (via: orphan_jid)  ← ROUBOU a conversa!
```

O Jailson já tem 2 registros de cliente separados (a correção anterior funcionou para isso):
- `9fb2ade8` → instância `10b70877` (FMOANTIGO)
- `ebcea5c6` → instância `fc9dbbd6`

Mas a **conversa** é uma só (`0e08e890`) e fica sendo MOVIDA de uma instância para outra a cada mensagem.

## Causa Raiz

Os Steps 3 e 4 (linhas 754-811) buscam conversas **SEM filtrar por `whatsapp_instance_id IS NULL`**. Ou seja, eles encontram conversas que JA PERTENCEM a outra instância ativa e as ROUBAM para a instância atual.

```text
Fluxo do bug:
1. Jailson manda msg na instância A
2. Step 1 (jid + instância A) → encontra conversa → OK
3. Jailson manda msg na instância B
4. Step 1 (jid + instância B) → NÃO encontra
5. Step 2 (phone + instância B) → NÃO encontra
6. Step 3 (jid, QUALQUER instância) → ENCONTRA a conversa da instância A → MOVE para B!
7. Agora a conversa pertence a B, o cliente da A fica "solto"
```

O Step 3 deveria buscar APENAS conversas verdadeiramente órfãs (`whatsapp_instance_id IS NULL`), não conversas de outras instâncias.

## Correção

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Step 3 (linhas 754-781):** Adicionar `.is("whatsapp_instance_id", null)` na query. Se a conversa já pertence a outra instância, ela NÃO é órfã — é uma conversa separada e deve ser respeitada.

**Step 4 (linhas 783-811):** Mesma correção — adicionar `.is("whatsapp_instance_id", null)`.

Com isso, quando não encontra conversa nos Steps 1-4, o Step 5 (criar nova conversa) será executado corretamente, criando uma conversa separada para a instância B.

### Migration SQL: Corrigir o caso do Jailson Ferreira

A conversa `0e08e890` foi movida para a instância `10b70877`, mas deveria ter ficado na instância original `fc9dbbd6`. Precisamos:
1. Restaurar a conversa `0e08e890` para a instância `fc9dbbd6` e vincular ao cliente `ebcea5c6`
2. Criar uma nova conversa para a instância `10b70877` vinculada ao cliente `9fb2ade8`
3. Mover as mensagens recentes (da instância errada) para a conversa correta

### Auditoria adicional

Verificar se existem outros casos de conversas com `last_whatsapp_instance_id` preenchido (indicando que foram movidas) e corrigir em lote.

## Resumo das mudanças

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Steps 3 e 4: adicionar `.is("whatsapp_instance_id", null)` para só pegar conversas verdadeiramente órfãs |
| Migration SQL | Restaurar conversa do Jailson e criar conversa separada na instância correta |

