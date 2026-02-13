

# Corrigir erro business_management e melhorar Templates

## 1. Erro `business_management` - "(#100) Missing Permission"

**Isso NAO e bug do codigo.** O token temporario gerado na pagina "API Setup" do WhatsApp NAO inclui a permissao `business_management`. Isso e uma limitacao do tipo de token.

**Solucao**: Marcar esse teste como **opcional** no WhatsApp (ja que os outros 3 testes passaram com sucesso). O `business_management` so funciona com token de System User ou OAuth completo. Para o App Review, os 3 testes que passaram (`whatsapp_business_messaging`, `public_profile`, `whatsapp_business_management`) ja sao suficientes.

**Alteracao em `src/pages/admin/MetaTestPage.tsx`**: Mudar `required: false` no teste `wa_business` e adicionar uma nota explicativa.

## 2. Templates completos (HEADER + BODY + FOOTER + BUTTONS)

O formulario atual so tem campo BODY. A Meta espera templates com componentes completos. Vou adicionar suporte a:

- **HEADER** (texto ou imagem)
- **BODY** (texto com variaveis `{{1}}`, `{{2}}`)
- **FOOTER** (texto curto)
- **BUTTONS** (Quick Reply e/ou URL)

### Alteracoes em `src/components/connections/WhatsAppTemplatesManager.tsx`:

Adicionar campos no dialogo de criacao:
- Campo de Header (tipo: texto ou nenhum)
- Campo de Footer (texto opcional)
- Secao de botoes com opcoes:
  - Quick Reply (ate 3 botoes com texto)
  - URL (texto + url)
- Montar o array `components` dinamicamente com todos os tipos preenchidos

### Alteracoes em `supabase/functions/meta-api/index.ts`:

Nenhuma alteracao necessaria - o endpoint `create_template` ja envia o array `components` que recebe do frontend. A logica e passthrough.

## Detalhes tecnicos do formulario de template

```text
+----------------------------------+
| Novo Template de Mensagem        |
+----------------------------------+
| Nome: [________________]         |
| Categoria: [UTILITY v]          |
| Idioma: [pt_BR v]               |
+----------------------------------+
| HEADER (opcional)                |
| Tipo: [Nenhum | Texto v]        |
| Texto: [________________]       |
+----------------------------------+
| BODY (obrigatorio)              |
| [                    ]           |
| Use {{1}}, {{2}} para variaveis |
+----------------------------------+
| FOOTER (opcional)               |
| [________________]               |
+----------------------------------+
| BOTOES (opcional)               |
| [+ Quick Reply] [+ URL]        |
| - "Confirmar" (QUICK_REPLY)  X |
| - "Ver site" -> url         X  |
+----------------------------------+
```

O array `components` sera montado assim:
```typescript
const components = [];
if (headerText) components.push({ type: "HEADER", format: "TEXT", text: headerText });
components.push({ type: "BODY", text: bodyText });
if (footerText) components.push({ type: "FOOTER", text: footerText });
if (buttons.length > 0) {
  components.push({
    type: "BUTTONS",
    buttons: buttons.map(b => 
      b.type === "QUICK_REPLY" 
        ? { type: "QUICK_REPLY", text: b.text }
        : { type: "URL", text: b.text, url: b.url }
    )
  });
}
```

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `MetaTestPage.tsx` | Marcar `wa_business` como `required: false` + nota |
| `WhatsAppTemplatesManager.tsx` | Formulario completo com Header, Footer, Botoes |

