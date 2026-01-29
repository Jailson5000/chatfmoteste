

# Plano: Corrigir Captura de Nomes da API Oficial (WABA)

## Problema Identificado

Analisando os logs do webhook, descobri que:

1. **Eventos `contacts.update` estão sendo ignorados** - marcados como "Unhandled event"
2. **A API oficial usa formato `@lid`** (LID = Linked ID) em vez de `@s.whatsapp.net`
3. **O nome do contato é enviado no evento `contacts.update`**, não no evento de mensagem

### Logs Comprovando o Problema

```
[EVENT] Unhandled event | contacts.update
[PAYLOAD] {"event":"contacts.update","data":[{"remoteJid":"190292904902905@lid","profilePicUrl":"..."}]}
```

O sistema recebe os dados do contato mas não processa.

---

## Solução

Implementar handler para o evento `contacts.update` que:
1. Extrai o nome do contato do payload WABA
2. Atualiza a conversa existente com o nome correto
3. Atualiza o cliente se existir

### Alterações no Arquivo

**Arquivo:** `supabase/functions/evolution-webhook/index.ts`

### Parte 1: Adicionar Interface para ContactsUpdateData

```typescript
interface ContactUpdateData {
  remoteJid: string;
  pushName?: string;
  profilePicUrl?: string;
  // WABA specific fields
  verifiedName?: string;
  name?: string;
  notify?: string;
  formattedName?: string;
}
```

### Parte 2: Adicionar Handler para `contacts.update`

Novo case no switch de eventos:

```typescript
case 'contacts.update': {
  const contacts = body.data as ContactUpdateData[];
  
  for (const contact of contacts) {
    const remoteJid = contact.remoteJid;
    const contactName = contact.pushName || 
                        contact.verifiedName || 
                        contact.name ||
                        contact.notify ||
                        contact.formattedName;
    
    if (!contactName) continue;
    
    // Update conversation contact_name where it's still showing phone number
    const phoneNumber = remoteJid.split('@')[0];
    
    await supabaseClient
      .from('conversations')
      .update({ contact_name: contactName })
      .eq('remote_jid', remoteJid)
      .eq('law_firm_id', lawFirmId)
      .or(`contact_name.eq.${phoneNumber},contact_name.is.null`);
    
    // Also update client name
    await supabaseClient
      .from('clients')
      .update({ name: contactName })
      .eq('law_firm_id', lawFirmId)
      .or(`phone.eq.${phoneNumber},phone.ilike.%${phoneNumber.slice(-8)}%`)
      .or(`name.eq.${phoneNumber},name.is.null`);
    
    logDebug('CONTACTS_UPDATE', 'Updated contact name from WABA event', {
      remoteJid,
      contactName,
      phoneNumber,
    });
  }
  break;
}
```

---

## Fluxo Corrigido

```
ANTES (API Oficial/WABA):
┌─────────────────────────────────────────────┐
│ 1. Mensagem chega (messages.upsert)         │
│    - Sem pushName (WABA não envia no msg)   │
│                                             │
│ 2. contacts.update chega                    │
│    - Contém nome verificado                 │
│    - IGNORADO ❌                            │
│                                             │
│ Resultado: Nome fica como número de telefone│
└─────────────────────────────────────────────┘

DEPOIS:
┌─────────────────────────────────────────────┐
│ 1. Mensagem chega (messages.upsert)         │
│    - Nome = telefone (fallback)             │
│                                             │
│ 2. contacts.update chega                    │
│    - Contém nome verificado                 │
│    - PROCESSADO ✅                          │
│    - Atualiza conversations e clients       │
│                                             │
│ Resultado: Nome atualizado automaticamente  │
└─────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar handler para `contacts.update` |

---

## Prevenção de Regressões

1. **Não altera lógica existente** - apenas adiciona novo handler
2. **Update condicional** - só atualiza se nome atual for telefone ou null
3. **Proteção de edição manual** - não sobrescreve nomes editados pelo usuário
4. **Log detalhado** - para debugging futuro

