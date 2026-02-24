

# Corrigir recebimento e envio de mensagens uazapi

## Problemas Identificados

### 1. Recebimento falha: colunas inexistentes na tabela `messages`

Os logs mostram claramente:
```
Could not find the 'file_name' column of 'messages' in the schema cache
```

O webhook tenta inserir nas colunas `file_name` e `mime_type`, mas a tabela `messages` NAO tem essas colunas. As colunas corretas sao:
- `media_mime_type` (nao `mime_type`)
- Nao existe coluna `file_name`

Isso causa 100% das falhas de recebimento atualmente.

### 2. Envio falha: numero sem codigo de pais

Os logs do `evolution-api` mostram:
```
the number 60688537@s.whatsapp.net is not on WhatsApp
```

O numero "60688537" armazenado na conversa esta incompleto (falta codigo do pais, ex: "5560688537" ou "556060688537"). Isso aconteceu porque o webhook salvou o numero exatamente como veio do uazapi, sem validar o formato.

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Correcao 1 - Colunas do insert de mensagem (linhas 498-511):**

Trocar:
```typescript
mime_type: mimeType || null,
file_name: fileName || null,
```

Por:
```typescript
media_mime_type: mimeType || null,
```

Remover `file_name` completamente pois a coluna nao existe na tabela.

**Correcao 2 - Numero de telefone incompleto:**

O uazapi pode enviar numeros sem codigo de pais. Adicionar validacao para garantir que o numero tenha pelo menos 10 digitos (padrao brasileiro). Se o numero for curto demais, o numero completo pode vir de outros campos do payload como `body.chat.id` com formato diferente, ou do `body.SenderJid`.

Adicionar log detalhado dos campos disponiveis no payload para identificar de onde extrair o numero completo.

## Resumo

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | 1. Trocar `mime_type` por `media_mime_type` |
| | 2. Remover campo `file_name` do insert |
| | 3. Adicionar log de campos do payload para debug de numero |

## Resultado

Apos o deploy, mensagens recebidas do uazapi serao salvas corretamente no banco de dados e aparecerao na interface.

