
# Corrigir envio de mensagens e conversas duplicadas no WhatsApp Cloud

## Diagnostico

Analisando os logs da edge function e o banco de dados, identifiquei a **causa raiz** dos dois problemas:

### O que acontece com numeros brasileiros na Meta API

Numeros brasileiros moveis tem 11 digitos: `(63) 9 8462-2450`. Quando voce envia para `5563984622450`, a Meta resolve o `wa_id` como `556384622450` (removendo o "9"). Sao o mesmo numero fisico, mas dois formatos diferentes.

### Problema 1: Meta-test cria conversa com numero errado

O `send_test_message` salva `remote_jid: 5563984622450` (formato original). Mas quando a pessoa responde, o webhook recebe `msg.from: 556384622450` (formato wa_id). Como os numeros sao diferentes, o sistema cria **duas conversas separadas** para a mesma pessoa.

### Problema 2: Envio falha com erro 131030

A conversa "Jailson Ferreira" tem `remote_jid: 556384622450` (sem o 9). Quando o sistema tenta enviar para esse numero, a Meta rejeita porque o app esta em **Modo de Desenvolvimento** e so aceita numeros exatamente como cadastrados na lista de teste (`5563984622450` com o 9).

O log confirma:
```
"(#131030) Recipient phone number not in allowed list"
```

## Solucao

### 1. Normalizar remote_jid no send_test_message (meta-api)

**Arquivo:** `supabase/functions/meta-api/index.ts`

Na secao `send_test_message` (linha ~322), apos receber a resposta da Meta com o `wa_id` resolvido, usar o `wa_id` como `remote_jid` em vez do numero digitado. Isso garante que a conversa criada pelo teste tenha o mesmo `remote_jid` que o webhook usara.

```typescript
// Antes: const remoteJid = recipientPhone.replace(/[^0-9]/g, "");
// Depois: usar o wa_id retornado pela Meta
const waId = data.contacts?.[0]?.wa_id;
const remoteJid = waId || recipientPhone.replace(/[^0-9]/g, "");
```

### 2. Normalizar remote_jid no envio principal (meta-api)

**Arquivo:** `supabase/functions/meta-api/index.ts`

Na funcao principal de envio (linha ~595-606), quando o envio for bem-sucedido e a Meta retornar o `wa_id`, atualizar o `remote_jid` da conversa se for diferente. Isso corrige conversas existentes com formato errado.

### 3. Limpar conversas duplicadas no banco

Executar migracao SQL para:
- Identificar a conversa duplicada com `remote_jid: 5563984622450` (formato incorreto)
- Mover as mensagens para a conversa com `remote_jid: 556384622450` (formato correto)
- Deletar a conversa duplicada

### 4. Acao manual necessaria (voce)

Enquanto o app estiver em **Modo de Desenvolvimento** na Meta, voce precisa adicionar o numero do destinatario na lista de teste:

1. Meta Developers > WhatsApp > API Setup
2. Na secao "To", adicionar o numero `+55 63 8462-2450` (formato sem o 9, que e o wa_id)
3. OU melhor: adicionar AMBOS os formatos (`5563984622450` e `556384622450`)

Quando o app for para producao, essa restricao desaparece.

---

## Detalhes tecnicos

### Alteracao 1: meta-api send_test_message (linha ~326-329)

Apos `const remoteJid = recipientPhone.replace(...)`, substituir por:
```typescript
const waId = data.contacts?.[0]?.wa_id;
const remoteJid = waId || recipientPhone.replace(/[^0-9]/g, "");
```

Tambem atualizar a busca de conversa existente para tentar ambos os formatos:
```typescript
const { data: existingConv } = await supabaseAdmin.from("conversations")
  .select("id")
  .eq("law_firm_id", lawFirmId)
  .in("remote_jid", [remoteJid, recipientPhone.replace(/[^0-9]/g, "")])
  .eq("origin", "WHATSAPP_CLOUD")
  .limit(1)
  .maybeSingle();
```

### Alteracao 2: meta-api envio principal (linha ~612-646)

Apos envio bem-sucedido, verificar se o `wa_id` retornado difere do `remote_jid` atual e atualizar:
```typescript
const returnedWaId = graphResult.contacts?.[0]?.wa_id;
if (returnedWaId && returnedWaId !== recipientId) {
  await supabaseAdmin.from("conversations")
    .update({ remote_jid: returnedWaId, contact_phone: returnedWaId })
    .eq("id", conversationId);
}
```

### Alteracao 3: Migracao SQL

```sql
-- Mover mensagens da conversa duplicada para a correta
UPDATE messages SET conversation_id = '35d24df9-fbb0-4644-a2e6-7478e4b53d5d'
WHERE conversation_id IN ('5d6210ed-9997-4894-87da-a5ae499c70cc', '068f991e-b071-4b99-bff2-03b5331d4ac9');

-- Deletar conversas duplicadas
DELETE FROM conversations WHERE id IN ('5d6210ed-9997-4894-87da-a5ae499c70cc', '068f991e-b071-4b99-bff2-03b5331d4ac9');
```

### Deploy

Deployar `meta-api` com as correcoes de normalizacao.

## Resultado esperado

1. Meta-test usa o `wa_id` resolvido pela Meta como `remote_jid`, evitando duplicatas
2. Conversas existentes sao corrigidas automaticamente quando uma mensagem e enviada
3. Conversas duplicadas sao limpas do banco
4. Envio funciona corretamente para a conversa "Jailson Ferreira"
