

# Plano: Ocultar Botão "Enviar Agora" para Mensagens reminder_2

## Problema Identificado

Na aba "Mensagens" da Agenda Pro, mensagens do tipo `reminder_2` (segundo lembrete automático) mostram o botão "Enviar Agora" que não funciona. Isso acontece porque:

1. O botão aparece para qualquer mensagem com `appointment_id`
2. A edge function `agenda-pro-notification` só suporta tipos: `created`, `reminder`, `cancelled`, `updated`, `no_show`
3. Não há suporte para envio manual do `reminder_2`

## Solução

Ocultar o botão "Enviar Agora" para mensagens automáticas do sistema (`reminder_2`), deixando apenas para mensagens customizadas e tipos suportados.

---

## Mudanças Necessárias

### Arquivo: `src/components/agenda-pro/AgendaProScheduledMessages.tsx`

| Mudança | Descrição |
|---------|-----------|
| Criar função `canSendNow` | Verificar se o tipo da mensagem suporta envio manual |
| Atualizar condição do botão | Usar a nova função para controlar visibilidade |
| Adicionar label para `reminder_2` | Mostrar "Lembrete 2" em vez de "reminder_2" |

### Código Antes (linha 417-428)

```tsx
<div className="flex items-center gap-1">
  {message.appointment_id && (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => sendNow.mutate(message)}
      disabled={sendNow.isPending}
      title="Enviar agora"
    >
      <Send className="h-4 w-4" />
    </Button>
  )}
```

### Código Depois

```tsx
// Nova função para verificar se pode enviar manualmente
const canSendNow = (message: ScheduledMessage) => {
  // reminder_2 é gerado automaticamente pelo cron e não suporta envio manual
  if (message.type === "reminder_2") return false;
  // Mensagens com appointment_id e tipos suportados podem ser enviadas
  return !!message.appointment_id && ["reminder", "pre_message"].includes(message.type);
};

// No JSX:
<div className="flex items-center gap-1">
  {canSendNow(message) && (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => sendNow.mutate(message)}
      disabled={sendNow.isPending}
      title="Enviar agora"
    >
      <Send className="h-4 w-4" />
    </Button>
  )}
```

### Adicionar Label para reminder_2 (linha 291-299)

```tsx
const getTypeLabel = (type: string) => {
  switch (type) {
    case "reminder": return "Lembrete 24h";
    case "reminder_2": return "Lembrete 2";  // ADICIONAR
    case "pre_message": return "Pré-atendimento";
    case "confirmation": return "Confirmação";
    case "birthday": return "Aniversário";
    case "custom": return "Personalizada";
    default: return type;
  }
};
```

### Adicionar Cor para Badge reminder_2 (linha 302-311)

```tsx
const getTypeBadgeColor = (type: string) => {
  switch (type) {
    case "reminder": return "bg-blue-500/10 text-blue-500";
    case "reminder_2": return "bg-indigo-500/10 text-indigo-500";  // ADICIONAR
    case "pre_message": return "bg-purple-500/10 text-purple-500";
    case "confirmation": return "bg-green-500/10 text-green-500";
    case "birthday": return "bg-pink-500/10 text-pink-500";
    case "custom": return "bg-orange-500/10 text-orange-500";
    default: return "";
  }
};
```

---

## Resultado Visual - Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Badge | `reminder_2` (texto cru) | `Lembrete 2` (label amigável) |
| Cor da Badge | Sem cor (default) | Índigo (diferente do Lembrete 24h) |
| Botão Enviar | Aparece mas não funciona | Não aparece |
| Botão Editar | Não aparece (correto) | Não aparece (correto) |
| Botão Cancelar | Aparece | Aparece |

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/agenda-pro/AgendaProScheduledMessages.tsx` | Adicionar `canSendNow`, atualizar labels e cores |

---

## Impacto em Outras Funcionalidades

| Funcionalidade | Status |
|----------------|--------|
| Lembrete 24h manual | Continua funcionando |
| Pré-atendimento manual | Continua funcionando |
| reminder_2 automático | Continua sendo enviado pelo cron |
| Cancelar mensagens | Continua funcionando para todos os tipos |
| Criar mensagens custom | Continua funcionando |

---

## Segurança da Mudança

- Mudança é **somente visual** (oculta botão)
- Não afeta a lógica de envio automático (cron job)
- Não modifica edge functions ou banco de dados
- Melhora UX ao remover botão que não funciona

