

# Exibir conteudo real de mensagens de template

## Problema

Quando um template WhatsApp e enviado (via Cloud API ou Evolution API), o chat mostra apenas `[Mensagem de template]` ou `[template: hello_world]` em vez do conteudo real da mensagem (texto, botoes, header, etc).

Isso acontece em dois locais:

1. **`supabase/functions/meta-api/index.ts`** (linha 399-400): Ao enviar template de teste, salva `[template: hello_world]` como conteudo fixo, sem buscar o corpo real do template.

2. **`supabase/functions/evolution-webhook/index.ts`** (linhas 4856-4863): Quando o payload `templateMessage` nao tem `hydratedTemplate`, cai no fallback `[Mensagem de template]`.

## Solucao

### 1. `meta-api/index.ts` - Buscar conteudo real do template antes de salvar

Quando `useTemplate = true`, apos enviar com sucesso, buscar o template na Graph API para extrair o conteudo real:

```text
GET /v22.0/{WABA_ID}/message_templates?name={templateName}
```

Extrair os componentes (HEADER, BODY, FOOTER, BUTTONS) e montar o conteudo legivel:

```
[Header texto se houver]
Corpo do template com {{1}} etc
---
[Opcoes: Botao1 | Botao2]
```

Se a busca falhar (ex: permissao), usar fallback: `[template: {nome}]` (comportamento atual).

**Alteracao** (linhas 394-406):
```typescript
// Montar conteudo legivel do template
let templateContent = `[template: ${templateName || "hello_world"}]`;
if (useTemplate && conn.waba_id) {
  try {
    const tplRes = await fetch(
      `${GRAPH_API_BASE}/${conn.waba_id}/message_templates?name=${templateName || "hello_world"}`,
      { headers: { Authorization: `Bearer ${testToken}` } }
    );
    if (tplRes.ok) {
      const tplData = await tplRes.json();
      const tpl = tplData.data?.[0];
      if (tpl?.components) {
        const parts: string[] = [];
        for (const comp of tpl.components) {
          if (comp.type === "HEADER" && comp.text) parts.push(comp.text);
          if (comp.type === "BODY" && comp.text) parts.push(comp.text);
          if (comp.type === "FOOTER" && comp.text) parts.push(`_${comp.text}_`);
          if (comp.type === "BUTTONS") {
            const btnTexts = comp.buttons?.map(b => b.text).filter(Boolean);
            if (btnTexts?.length) parts.push(`[Opcoes: ${btnTexts.join(" | ")}]`);
          }
        }
        if (parts.length > 0) templateContent = parts.join("\n\n");
      }
    }
  } catch (e) { /* manter fallback */ }
}
// Inserir com conteudo real
await supabaseAdmin.from("messages").insert({
  content: useTemplate ? templateContent : (message || "Mensagem de teste"),
  ...
});
```

### 2. `evolution-webhook/index.ts` - Melhorar fallback de template

Quando `templateMessage` existe mas nao tem `hydratedTemplate`, tentar extrair dados de outras estruturas comuns do payload:

**Alteracao** (linhas 4856-4864):
```typescript
} else if (template.fourRowTemplate) {
  // fourRowTemplate format
  const frt = template.fourRowTemplate;
  messageContent = frt.hydratedContentText || frt.content?.namespace || '';
  // Tentar botoes do fourRowTemplate
  if (frt.hydratedButtons?.length) {
    const btns = frt.hydratedButtons.map(b =>
      b.quickReplyButton?.displayText || b.urlButton?.displayText || null
    ).filter(Boolean);
    if (btns.length) messageContent += '\n\n[Opcoes: ' + btns.join(' | ') + ']';
  }
  if (!messageContent) messageContent = '[Mensagem de template]';
} else {
  // Fallback: tentar extrair qualquer texto do payload
  const raw = JSON.stringify(template);
  // Procurar por campos de texto conhecidos
  const textMatch = raw.match(/"(?:text|body|content)"\s*:\s*"([^"]{5,})"/);
  if (textMatch) {
    messageContent = textMatch[1];
  } else {
    messageContent = '[Mensagem de template]';
    // Logar payload completo para debug
    console.warn('[evolution-webhook] Unknown template format:', raw.slice(0, 500));
  }
}
```

### 3. `MessageBubble.tsx` - Renderizar `[template: X]` de forma visual

Verificar se o conteudo comeca com `[template:` e renderizar com icone e nome, ao inves de texto cru.

## Resumo de arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/meta-api/index.ts` | Buscar conteudo real do template na Graph API antes de salvar no banco |
| `supabase/functions/evolution-webhook/index.ts` | Melhorar parsing de `templateMessage` com fallbacks mais inteligentes |
| `src/components/conversations/MessageBubble.tsx` | Renderizar visualmente mensagens que comecam com `[template:` |

Deploy: `meta-api` e `evolution-webhook`

