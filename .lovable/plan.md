
# Corrigir extracao do numero de telefone no uazapi-webhook

## Problema raiz

Os logs de debug mostram claramente:

```text
"chat.id": "rcd60f68fb85b37"      <-- ID interno do uazapi (NAO e telefone!)
"chat.phone": "+55 63 8462-2450"  <-- Numero REAL do contato
"extractedPhone": "60688537"       <-- Lixo extraido do chat.id
```

O codigo na linha 331 usa `chat.id` como fallback para o `remoteJid`:
```
const remoteJidRaw = msg.from || msg.remoteJid || msg.key?.remoteJid || chat.id || "";
```

Como `msg.from`, `msg.remoteJid` e `msg.key?.remoteJid` sao todos `undefined` no payload do uazapi, cai no `chat.id` que e um ID interno (`rcd60f68fb85b37`). A funcao `extractPhone` remove letras e pega `60688537` -- um numero incompleto e errado.

O numero correto esta em `chat.phone` = `"+55 63 8462-2450"` = `5563984622450` (apos limpar).

Isso causa:
1. **Recebimento**: Conversa criada com `remote_jid: "60688537@s.whatsapp.net"` (errado)
2. **Envio**: Tenta enviar para `60688537@s.whatsapp.net`, que nao existe no WhatsApp
3. **Duplicatas**: Cada mensagem do mesmo contato pode criar nova conversa pois o JID errado nao bate

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Mudanca 1 -- Priorizar `chat.phone` na extracao do numero (linha 331):**

Antes:
```typescript
const remoteJidRaw = msg.from || msg.remoteJid || msg.key?.remoteJid || chat.id || "";
```

Depois:
```typescript
// Build phone from chat.phone first (uazapi reliable source), then fallbacks
const chatPhoneClean = chat.phone ? chat.phone.replace(/\D/g, "") : "";
const remoteJidRaw = msg.from || msg.remoteJid || msg.key?.remoteJid 
  || (chatPhoneClean.length >= 10 ? chatPhoneClean : null)
  || chat.id || "";
```

Isso garante que quando `chat.phone` tem o numero completo (como `+55 63 8462-2450`), ele sera usado ao inves do `chat.id` interno do uazapi.

**Mudanca 2 -- Corrigir conversas existentes com numero errado:**

Apos salvar a mensagem, se o `phoneNumber` extraido for curto demais (menos de 10 digitos) e `chat.phone` estiver disponivel, atualizar a conversa e o cliente com o numero correto. Isso corrige conversas que ja foram criadas com o numero errado.

**Mudanca 3 -- Remover log de debug excessivo:**

Manter o log de debug por enquanto para confirmar que a correcao funciona, mas simplificar.

## Detalhes tecnicos

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Priorizar `chat.phone` na extracao do telefone |
| | Adicionar fallback para corrigir conversas com numero errado |
| | Garantir `remote_jid` sempre com numero completo (10+ digitos) |

## Resultado esperado

- Mensagens recebidas terao o numero correto (ex: `5563984622450@s.whatsapp.net`)
- Envio de mensagens funcionara pois o numero estara completo
- Novas conversas serao criadas com o telefone real do contato
