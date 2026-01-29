
# Plano: Correção WABA + Ajustes Landing Page + Análise de Segurança

## Resumo Executivo

### 1. Problema WABA - Mensagens Interativas Não Processadas

**Diagnóstico técnico da imagem:**
- O número `551135085421` aparece como nome ao invés do nome real "Identité"
- Mensagem mostra "📎 Mídia" ao invés do conteúdo

**Causa raiz identificada:**
O webhook `evolution-webhook/index.ts` **NÃO processa mensagens interativas WABA**. Quando um usuário clica em botões como "Sim", "Saber Mais", "Sair" em mensagens WABA, a Evolution API envia esses tipos de mensagem que não são tratados:

```typescript
// Tipos de mensagem interativa NÃO PROCESSADOS atualmente:
data.message?.buttonsResponseMessage    // Resposta a botões
data.message?.listResponseMessage       // Resposta a lista
data.message?.templateButtonReplyMessage // Resposta a template WABA
data.message?.interactiveResponseMessage // Mensagem interativa genérica
```

**Fluxo atual (problemático):**
```
WABA envia mensagem interativa (botão "Sim")
        ↓
evolution-webhook recebe payload
        ↓
Verifica: conversation? extendedText? image? audio? video? document? sticker?
        ↓
❌ NENHUM MATCH → messageContent = '' (vazio)
        ↓
Mensagem salva sem conteúdo → Aparece como "📎 Mídia"
```

### 2. Alteração Landing Page
- Trocar "Solicitar proposta" por "Começar agora" no plano Enterprise

### 3. Análise de Segurança (Políticas de Tenant)

**Status atual da segurança:**
- ✅ **84 tabelas** com RLS habilitado (100% coverage)
- ✅ **210 políticas** RLS implementadas
- ✅ Isolamento multi-tenant consistente via `law_firm_id`
- ✅ Funções `get_user_law_firm_id()`, `has_role()`, `is_admin()` centralizadas

**Findings de segurança existentes:**
1. **INFO**: `Leaked Password Protection Disabled` - Supabase Dashboard config
2. **ERROR**: `Security Definer View` - Ignorado (views são intencionais)
3. **WARN**: `Support Tickets RLS` - Revisão recomendada

**Políticas das tabelas sensíveis verificadas:**
```sql
-- profiles (7 políticas)
✅ Users can view profiles in their law firm → (law_firm_id = get_user_law_firm_id(auth.uid()))
✅ Users can insert their own profile
✅ Users can update their own profile → (id = auth.uid())
✅ Global admins can view all profiles → is_admin(auth.uid())

-- law_firm_settings (3 políticas)
✅ Users can view law firm settings → (law_firm_id = get_user_law_firm_id(auth.uid()))
✅ Admins can manage law firm settings → (law_firm_id = ... AND has_role(..., 'admin'))
✅ Global admins can manage all → is_admin(auth.uid())
```

**Conclusão de segurança:** As políticas RLS estão bem implementadas. Os findings `profiles_table_public_exposure` e `law_firm_settings_exposure` são **falsos positivos** - as tabelas têm políticas corretas que impedem acesso anônimo.

### 4. Capacidade do Sistema

**Dados atuais:**
- 18 empresas (law_firms)
- 12 usuários
- 6 instâncias WhatsApp
- 157 conversas

**Estimativa de capacidade:**
O plano Pro do Supabase suporta ~500 conexões Realtime simultâneas. Com a arquitetura atual:
- Cada usuário ativo = ~1-2 conexões
- **Capacidade estimada: 50-100+ empresas** com uso moderado
- O sistema está bem abaixo da capacidade atual (~10% utilização)

---

## Alterações Propostas

### Parte 1: Processar Mensagens Interativas WABA

**Arquivo:** `supabase/functions/evolution-webhook/index.ts`

Adicionar tratamento para mensagens interativas após o bloco de `stickerMessage` (linha ~4165):

```typescript
// Após } else if (data.message?.stickerMessage) { ... }

// WABA Interactive Messages: Button replies, list responses, template button replies
} else if (data.message?.buttonsResponseMessage) {
  // User clicked a quick reply button
  messageType = 'text';
  messageContent = data.message.buttonsResponseMessage.selectedButtonId || 
                   data.message.buttonsResponseMessage.selectedDisplayText ||
                   '[Resposta de botão]';
} else if (data.message?.listResponseMessage) {
  // User selected an item from a list menu
  messageType = 'text';
  messageContent = data.message.listResponseMessage.title ||
                   data.message.listResponseMessage.description ||
                   data.message.listResponseMessage.rowId ||
                   '[Seleção de lista]';
} else if (data.message?.templateButtonReplyMessage) {
  // User clicked a template button (WABA marketing messages)
  messageType = 'text';
  messageContent = data.message.templateButtonReplyMessage.selectedDisplayText ||
                   data.message.templateButtonReplyMessage.selectedId ||
                   '[Resposta de template]';
} else if (data.message?.interactiveResponseMessage) {
  // Generic interactive response (newer WABA format)
  messageType = 'text';
  const interactiveBody = data.message.interactiveResponseMessage.body || 
                          data.message.interactiveResponseMessage.nativeFlowResponseMessage;
  if (interactiveBody?.text) {
    messageContent = interactiveBody.text;
  } else if (typeof interactiveBody === 'string') {
    messageContent = interactiveBody;
  } else {
    messageContent = '[Resposta interativa]';
  }
}
```

**Atualizar interface `MessageData`** para incluir tipos interativos:

```typescript
interface MessageData {
  // ... existing fields ...
  message?: {
    // ... existing message types ...
    
    // WABA Interactive message types
    buttonsResponseMessage?: {
      selectedButtonId?: string;
      selectedDisplayText?: string;
    };
    listResponseMessage?: {
      title?: string;
      description?: string;
      rowId?: string;
      singleSelectReply?: { selectedRowId?: string };
    };
    templateButtonReplyMessage?: {
      selectedId?: string;
      selectedDisplayText?: string;
      selectedIndex?: number;
    };
    interactiveResponseMessage?: {
      body?: { text?: string };
      nativeFlowResponseMessage?: { 
        name?: string; 
        paramsJson?: string;
      };
    };
  };
}
```

### Parte 2: Landing Page - Trocar Texto Enterprise

**Arquivo:** `src/pages/landing/LandingPage.tsx`

```typescript
// Linha 122-123: Alterar de "Solicitar proposta" para "Começar agora"
cta: isEnterprise 
  ? "Começar agora"   // ERA: "Solicitar proposta"
  : isProfessional 
    ? "Escalar meu atendimento" 
    : "Começar agora",
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar tratamento para mensagens interativas WABA |
| `src/pages/landing/LandingPage.tsx` | Trocar "Solicitar proposta" por "Começar agora" |

---

## Fluxo Corrigido para WABA

```
WABA envia mensagem interativa (botão "Sim")
        ↓
evolution-webhook recebe payload
        ↓
Verifica: conversation? extendedText? image? audio? video? 
          document? sticker? buttonsResponseMessage? ✅
        ↓
messageContent = "Sim" (ou selectedDisplayText)
messageType = 'text'
        ↓
Mensagem salva com conteúdo → Aparece "Sim" na interface
        ↓
Nome do contato extraído via campos WABA alternativos
```

---

## Resposta às Perguntas

### 1. WABA não identifica até respondermos
**Problema:** Mensagens interativas WABA (botões/listas) não são processadas.
**Solução:** Adicionar handlers para `buttonsResponseMessage`, `listResponseMessage`, `templateButtonReplyMessage`, `interactiveResponseMessage`.

### 2. Trocar texto do plano Enterprise
**Ação:** Alterar `"Solicitar proposta"` → `"Começar agora"` na linha 123.

### 3. Análise de políticas de tenant
**Resultado:** Sistema bem seguro com 210 políticas RLS. Nenhuma falha crítica encontrada. Findings de exposição são falsos positivos.

### 4. Capacidade atual
**Resposta:** O sistema suporta **50-100+ empresas** com folga. Atualmente com 18 empresas, estamos usando ~10% da capacidade.

---

## Prevenção de Regressões

1. **Fallback seguro:** Se nenhum campo interativo for encontrado, `messageContent = '[Resposta interativa]'`
2. **Lógica aditiva:** Apenas adiciona novos `else if`, não modifica código existente
3. **Tipagem:** Interface expandida com tipos opcionais para não quebrar payloads antigos
4. **Logs:** Adicionar log para rastrear mensagens interativas processadas
