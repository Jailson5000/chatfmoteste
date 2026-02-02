
# Plano: Suporte a Mensagens de Contato (vCard) no WhatsApp

## Diagnóstico

O sistema não processa mensagens de contato compartilhadas pelo WhatsApp. Atualmente, quando um cliente envia um contato (como "Thierry Irmão" na imagem), o sistema mostra apenas "🎤 Mídia" sem informações úteis.

---

## Arquivos a Modificar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `supabase/functions/evolution-webhook/index.ts` | Backend | Adicionar parsing de `contactMessage` e `contactsArrayMessage` |
| `src/components/conversations/MessageBubble.tsx` | Frontend | Adicionar renderização visual para mensagens de contato |

---

## Solução

### 1. Backend - Adicionar Interface de Contato

Adicionar a definição do tipo `contactMessage` na interface `MessageData`:

```typescript
// Em MessageData.message
contactMessage?: {
  displayName?: string;
  vcard?: string;
  contextInfo?: ContextInfo;
};
contactsArrayMessage?: {
  displayName?: string;
  contacts?: Array<{
    displayName?: string;
    vcard?: string;
  }>;
  contextInfo?: ContextInfo;
};
```

### 2. Backend - Extrair Conteúdo do vCard

Adicionar lógica de extração na seção de parsing de mensagens (após `templateMessage`):

```typescript
} else if (data.message?.contactMessage) {
  // Contato único compartilhado
  messageType = 'contact';
  const contact = data.message.contactMessage;
  const displayName = contact.displayName || '';
  
  // Extrair telefone do vCard
  const phoneMatch = contact.vcard?.match(/TEL[^:]*:([+\d\s\-()]+)/i);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : '';
  
  // Formatar conteúdo legível
  messageContent = phone 
    ? `📇 Contato: ${displayName}\n📞 ${phone}`
    : `📇 Contato: ${displayName}`;
    
  logDebug('CONTACT', 'Contact message received', { 
    requestId, 
    displayName, 
    hasVcard: !!contact.vcard,
    phone 
  });
  
} else if (data.message?.contactsArrayMessage) {
  // Múltiplos contatos compartilhados
  messageType = 'contact';
  const contactsArray = data.message.contactsArrayMessage;
  const contacts = contactsArray.contacts || [];
  
  if (contacts.length === 1) {
    // Um contato no array
    const contact = contacts[0];
    const displayName = contact.displayName || contactsArray.displayName || '';
    const phoneMatch = contact.vcard?.match(/TEL[^:]*:([+\d\s\-()]+)/i);
    const phone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : '';
    
    messageContent = phone 
      ? `📇 Contato: ${displayName}\n📞 ${phone}`
      : `📇 Contato: ${displayName}`;
  } else {
    // Múltiplos contatos
    const names = contacts.map(c => c.displayName || 'Contato').join(', ');
    messageContent = `📇 ${contacts.length} contatos: ${names}`;
  }
  
  logDebug('CONTACT', 'Contacts array message received', { 
    requestId, 
    count: contacts.length 
  });
}
```

### 3. Frontend - Renderização Visual

Adicionar um componente `ContactCardViewer` em `MessageBubble.tsx`:

```tsx
// Componente para exibir contatos compartilhados
function ContactCardViewer({ content }: { content: string }) {
  // Parse do conteúdo formatado pelo backend
  // Formato: "📇 Contato: Nome\n📞 +55..."
  
  const lines = content.split('\n');
  const nameLine = lines.find(l => l.includes('Contato:'));
  const phoneLine = lines.find(l => l.includes('📞'));
  
  const name = nameLine?.replace(/📇\s*Contato:\s*/i, '').trim() || 'Contato';
  const phone = phoneLine?.replace(/📞\s*/g, '').trim() || '';
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary-foreground/10 border border-border/50">
      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <User className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        {phone && (
          <p className="text-xs text-muted-foreground">{phone}</p>
        )}
      </div>
    </div>
  );
}
```

### 4. Frontend - Integrar no renderMedia()

Adicionar condição para renderizar contatos:

```tsx
// Em renderMedia(), antes do return null final
const isContact = messageType === 'contact';

if (isContact && content) {
  return <ContactCardViewer content={content} />;
}
```

---

## Exemplo Visual

Após implementação, mensagens de contato aparecerão assim:

```text
┌──────────────────────────────────┐
│  👤  Thierry Irmão               │
│      +55 17 99600-1254           │
└──────────────────────────────────┘
                            16:35 ✓✓
```

---

## Risco de Quebrar o Sistema

**Baixo risco** - As mudanças são:

1. **Backend**: Apenas adiciona novo `else if` para um tipo de mensagem não tratado. Não altera lógica existente de texto, imagem, áudio, vídeo ou documento.

2. **Frontend**: Adiciona componente novo e condição adicional no `renderMedia()`. Não modifica renderização existente.

3. **Compatibilidade**: Se o payload vier em formato diferente, o fallback existente trata como mensagem genérica.

---

## Fluxo de Dados

```text
┌─────────────────────────────────────────────────────────────────────┐
│              WhatsApp (Cliente envia contato)                        │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ contactMessage / contactsArrayMessage
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Evolution API                                    │
│           Webhook: messages.upsert                                   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              evolution-webhook Edge Function                         │
│  - Detecta contactMessage ou contactsArrayMessage                    │
│  - Define messageType = 'contact'                                    │
│  - Extrai displayName e phone do vCard                               │
│  - Formata: "📇 Contato: Nome\n📞 +55..."                             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ INSERT messages (type='contact')
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Supabase DB                                   │
│  messages: { content, message_type: 'contact', ... }                 │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ Realtime
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MessageBubble.tsx (Frontend)                            │
│  - Detecta messageType === 'contact'                                 │
│  - Renderiza ContactCardViewer com nome e telefone                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Validações Pós-Implementação

- [ ] Receber contato único do WhatsApp → exibe nome e telefone
- [ ] Receber múltiplos contatos → exibe contagem e nomes
- [ ] Contato sem telefone no vCard → exibe apenas nome
- [ ] Mensagens existentes (texto, imagem, áudio) continuam funcionando
- [ ] Preview na lista de conversas mostra "📇 Contato: Nome"
