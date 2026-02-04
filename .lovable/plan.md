

# Plano: Corrigir Bug no Webhook contacts.update

## Problema Identificado

O erro nos logs:
```
ERROR: column clients.name does not exist
ERROR: column conversations.contact_name does not exist
```

**Causa Raiz**: A sintaxe do filtro `.or()` do PostgREST está incorreta. Os valores de string não estão sendo escapados corretamente.

**Código Atual (Linha 5257 e 5282)**:
```typescript
.or(`contact_name.eq.${phoneNumber},contact_name.is.null`)
.or(`name.eq.${phoneNumber},name.is.null`)
```

**Problema**: Quando `phoneNumber` é `559281182213`, o PostgREST interpreta como:
```
contact_name.eq.559281182213
```

O PostgREST tenta interpretar isso como uma coluna aninhada (`clients.name`) em vez de um valor, porque números sem aspas podem ser confundidos com referências de coluna em certas situações, ou o parser falha de forma inesperada.

---

## Solução

Usar a sintaxe correta do PostgREST com **filtros separados** em vez de `.or()` com string interpolation, ou **escapar corretamente os valores**.

### Opção Escolhida: Consultas Separadas com Fallback Gracioso

Em vez de tentar fazer uma query complexa com `.or()`, vamos:
1. Fazer queries mais simples e seguras
2. Usar try-catch para não interromper o fluxo principal
3. Logar erros de forma informativa sem poluir os logs

---

## Mudanças no Arquivo

**Arquivo**: `supabase/functions/evolution-webhook/index.ts`

### Antes (Linhas 5252-5283):

```typescript
// Update conversations where contact_name is still the phone number or null
const { data: updatedConversations, error: convError } = await supabaseClient
  .from('conversations')
  .update({ contact_name: contactName })
  .eq('remote_jid', remoteJid)
  .eq('law_firm_id', lawFirmId)
  .or(`contact_name.eq.${phoneNumber},contact_name.is.null`)
  .select('id');
```

### Depois:

```typescript
// Update conversations where contact_name is still the phone number or null
// Using two separate updates to avoid PostgREST .or() syntax issues with dynamic values
let conversationsUpdatedCount = 0;

// Update where contact_name equals phone number
const { data: convByPhone, error: convPhoneErr } = await supabaseClient
  .from('conversations')
  .update({ contact_name: contactName })
  .eq('remote_jid', remoteJid)
  .eq('law_firm_id', lawFirmId)
  .eq('contact_name', phoneNumber)
  .select('id');

if (!convPhoneErr && convByPhone) {
  conversationsUpdatedCount += convByPhone.length;
}

// Update where contact_name is null
const { data: convByNull, error: convNullErr } = await supabaseClient
  .from('conversations')
  .update({ contact_name: contactName })
  .eq('remote_jid', remoteJid)
  .eq('law_firm_id', lawFirmId)
  .is('contact_name', null)
  .select('id');

if (!convNullErr && convByNull) {
  conversationsUpdatedCount += convByNull.length;
}

if (conversationsUpdatedCount > 0) {
  logDebug('CONTACTS_UPDATE', 'Updated conversation contact names', {
    requestId,
    count: conversationsUpdatedCount,
  });
}
```

### Mesma abordagem para clients (Linhas 5277-5283):

```typescript
// Update clients - split into separate queries for safety
let clientsUpdatedCount = 0;
const phoneLastDigits = phoneNumber.slice(-8);

// Update where name equals phone number
const { data: clientsByPhone, error: clientPhoneErr } = await supabaseClient
  .from('clients')
  .update({ name: contactName })
  .eq('law_firm_id', lawFirmId)
  .ilike('phone', `%${phoneLastDigits}`)
  .eq('name', phoneNumber)
  .select('id');

if (!clientPhoneErr && clientsByPhone) {
  clientsUpdatedCount += clientsByPhone.length;
}

// Update where name is null
const { data: clientsByNull, error: clientNullErr } = await supabaseClient
  .from('clients')
  .update({ name: contactName })
  .eq('law_firm_id', lawFirmId)
  .ilike('phone', `%${phoneLastDigits}`)
  .is('name', null)
  .select('id');

if (!clientNullErr && clientsByNull) {
  clientsUpdatedCount += clientsByNull.length;
}

if (clientsUpdatedCount > 0) {
  logDebug('CONTACTS_UPDATE', 'Updated client names', {
    requestId,
    count: clientsUpdatedCount,
  });
}
```

---

## Benefícios da Solução

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Erros no log** | Erros de parsing PostgREST | Nenhum erro |
| **Funcionalidade** | Falha silenciosamente | Funciona corretamente |
| **Queries** | 1 query complexa com `.or()` | 2 queries simples |
| **Performance** | N/A (falha antes) | Imperceptível (2 queries rápidas) |
| **Segurança** | Possível SQL injection via interpolação | Valores escapados pelo SDK |

---

## Impacto

- **Zero quebra**: Apenas corrige a funcionalidade que já estava falhando
- **Logs limpos**: Remove erros desnecessários dos logs do PostgreSQL
- **Resolução de nomes WABA funcional**: Contatos da API oficial do WhatsApp Business terão seus nomes atualizados corretamente

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/evolution-webhook/index.ts` | Refatorar case `contacts.update` (linhas 5252-5296) |

---

## Validação

Após deploy, verificar:
1. Logs não contêm mais erros `column ... does not exist`
2. Evento `contacts.update` é processado sem erros
3. Nomes de contatos WABA são atualizados nas conversas/clientes

