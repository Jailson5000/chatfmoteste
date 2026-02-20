
## Corrigir suporte a `pre_message` na edge function `agenda-pro-notification`

### Problema
A funcao `process-scheduled-messages` envia notificacoes com `type: "pre_message"`, mas a funcao `agenda-pro-notification` so aceita: `created`, `reminder`, `cancelled`, `updated`, `no_show`. Resultado: pre-messages falham com erro 400 e sao marcadas como `failed` apos 3 tentativas.

### Correcao
Adicionar um bloco `else if (type === "pre_message")` na funcao `agenda-pro-notification/index.ts` (antes do `else` da linha 314) com:

- **Mensagem WhatsApp**: Texto amigavel de preparacao para o atendimento (ex: "Seu atendimento esta chegando! Aqui estao os detalhes...")
- **Assunto de e-mail**: "Preparacao para seu atendimento"
- **HTML do e-mail**: Template visual consistente com os demais tipos

### Detalhes tecnicos

**Arquivo**: `supabase/functions/agenda-pro-notification/index.ts`

Inserir entre a linha 313 (fim do bloco `no_show`) e a linha 314 (inicio do `else`):

```typescript
} else if (type === "pre_message") {
  whatsappMessage = `Ola ${clientName}! \n\n` +
    `Seu atendimento esta chegando! Confira os detalhes:\n\n` +
    `Data: ${dateStr}\n` +
    `Horario: ${timeRangeStr}\n` +
    `Servico: ${serviceName}\n` +
    (professionalName ? `Profissional: ${professionalName}\n` : "") +
    `Local: ${companyName}\n\n` +
    `Confirme sua presenca:\n${confirmationLink}\n\n` +
    `Nos vemos em breve!\n${companyName}`;

  emailSubject = `Preparacao para seu atendimento - ${companyName}`;
  emailHtml = `...`; // Template visual similar aos demais
```

Tambem atualizar a mensagem de erro do `else` para incluir `pre_message` na lista de tipos validos.

### Risco
**Zero**. E uma adicao pura a um bloco `if/else`. Nenhuma logica existente e alterada. Os tipos `created`, `reminder`, `cancelled`, `updated` e `no_show` continuam identicos.

### Resultado
Pre-messages agendadas serao processadas com sucesso, enviando WhatsApp e/ou e-mail ao cliente antes do atendimento.
