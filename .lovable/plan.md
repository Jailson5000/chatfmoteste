

# Plano: Suporte a Chave API Gemini Própria + Fallback

## Resumo Executivo

**Resposta às suas perguntas:**

1. ✅ **SIM** - Sua chave API Gemini suportará TODAS as empresas do sistema (é uma configuração global do system admin)

2. ✅ **Fallback pode ser implementado** - Se Lovable AI falhar (429/402/500), o sistema tentará sua chave Gemini

3. ✅ **Escolha manual também é possível** - Você poderá escolher entre:
   - Lovable AI (padrão)
   - Sua chave Gemini (Google AI Studio)
   - Ambos com fallback

---

## Arquitetura Atual vs Proposta

```text
┌─────────────────────────────────────────────────────────────────────┐
│                      ARQUITETURA ATUAL                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Mensagem]  →  [ai-chat Edge Function]  →  [Lovable AI Gateway]    │
│                         │                                           │
│                         └──→ [OpenAI] (se empresa tiver api_key)    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      ARQUITETURA PROPOSTA                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Mensagem]  →  [ai-chat Edge Function]                             │
│                         │                                           │
│                         ├──→ [Lovable AI Gateway] (primário)        │
│                         │           │                               │
│                         │           ↓ se falhar (429/402/500)       │
│                         │                                           │
│                         └──→ [Gemini Direto] (sua chave - fallback) │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Configurações a Adicionar

### No Global Admin Settings (onde você está agora):

| Campo | Descrição | Opções |
|-------|-----------|--------|
| **Provedor IA Principal** | Qual API usar primeiro | `lovable` / `gemini` |
| **Chave API Gemini** | Sua chave do Google AI Studio | `AIza...` |
| **Modelo Gemini** | Qual modelo usar | `gemini-2.5-flash` (recomendado) |
| **Habilitar Fallback** | Se um falhar, tenta o outro | ✅/❌ |

---

## Implementação

### 1. Novas Configurações no system_settings

```sql
-- Novas configurações de IA global
INSERT INTO system_settings (id, key, value, description, category) VALUES
  (gen_random_uuid(), 'ai_primary_provider', '"lovable"', 'Provedor principal: lovable ou gemini', 'ai'),
  (gen_random_uuid(), 'ai_gemini_api_key', '""', 'Chave API do Gemini (Google AI Studio)', 'ai'),
  (gen_random_uuid(), 'ai_gemini_model', '"gemini-2.5-flash"', 'Modelo Gemini a usar', 'ai'),
  (gen_random_uuid(), 'ai_enable_fallback', 'true', 'Se primário falhar, tentar secundário', 'ai');
```

### 2. Modificar Edge Function ai-chat

**Arquivo:** `supabase/functions/ai-chat/index.ts`

Adicionar lógica de fallback no bloco de chamada AI (linhas 3103-3141):

```typescript
// Get global AI settings
const { data: aiSettings } = await supabase
  .from("system_settings")
  .select("key, value")
  .in("key", [
    "ai_primary_provider",
    "ai_gemini_api_key",
    "ai_gemini_model",
    "ai_enable_fallback"
  ]);

const getSettingValue = (key: string, defaultVal: string) => {
  const setting = aiSettings?.find((s: any) => s.key === key);
  return setting?.value ?? defaultVal;
};

const primaryProvider = getSettingValue("ai_primary_provider", "lovable");
const geminiApiKey = getSettingValue("ai_gemini_api_key", "");
const geminiModel = getSettingValue("ai_gemini_model", "gemini-2.5-flash");
const enableFallback = getSettingValue("ai_enable_fallback", true);

// Provider URLs
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Try primary provider first
let response: Response;
let usedProvider = primaryProvider;

try {
  if (primaryProvider === "gemini" && geminiApiKey) {
    response = await callGemini(geminiApiKey, geminiModel, messages, tools);
  } else {
    response = await callLovable(LOVABLE_API_KEY, messages, tools);
  }
  
  // Check for rate limit or payment errors
  if (!response.ok && enableFallback) {
    const status = response.status;
    if (status === 429 || status === 402 || status >= 500) {
      console.log(`[AI Chat] Primary ${primaryProvider} failed (${status}), trying fallback...`);
      
      // Switch to fallback
      if (primaryProvider === "lovable" && geminiApiKey) {
        response = await callGemini(geminiApiKey, geminiModel, messages, tools);
        usedProvider = "gemini";
      } else if (primaryProvider === "gemini") {
        response = await callLovable(LOVABLE_API_KEY, messages, tools);
        usedProvider = "lovable";
      }
    }
  }
} catch (error) {
  if (enableFallback) {
    // Network error - try fallback
    console.log(`[AI Chat] Primary ${primaryProvider} error, trying fallback...`);
    // ... fallback logic
  }
}

console.log(`[AI Chat] Response from ${usedProvider}`);
```

### 3. UI no Global Admin Settings

**Arquivo:** `src/pages/global-admin/GlobalAdminSettings.tsx`

Adicionar seção "Configuração de IA Global":

- Radio buttons: Lovable AI / Gemini / Lovable + Fallback Gemini
- Campo de texto: Chave API Gemini (com máscara)
- Select: Modelo Gemini (gemini-2.5-flash, gemini-2.5-pro)
- Switch: Habilitar Fallback Automático
- Botão "Testar Conexão"

---

## Arquivos a Modificar

| Arquivo | Mudança | Impacto |
|---------|---------|---------|
| `supabase/functions/ai-chat/index.ts` | Adicionar lógica de fallback + suporte Gemini direto | Alto |
| `src/pages/global-admin/GlobalAdminSettings.tsx` | UI para configurar provedor + chave Gemini | Médio |
| **Banco de dados** | Inserir novas configurações em system_settings | Baixo |

---

## Vantagens de Usar Sua Chave Gemini

| Aspecto | Lovable AI | Sua Chave Gemini |
|---------|------------|------------------|
| **Rate Limit** | Compartilhado (workspace) | Dedicado (você) |
| **Custo** | Cobrado no Lovable | Cobrado no Google Cloud |
| **Controle** | Limitado | Total |
| **Fallback** | N/A | ✅ Se Lovable falhar |
| **Modelos** | gemini-2.5-flash, gpt-5, etc | Qualquer Gemini |

---

## Limites do Gemini (com sua chave)

| Modelo | RPM (grátis) | RPM (pago) | TPM |
|--------|--------------|------------|-----|
| gemini-2.5-flash | 15 RPM | 2000 RPM | 4M tokens |
| gemini-2.5-pro | 2 RPM | 1000 RPM | 4M tokens |

**Com conta paga Google Cloud**, você pode escalar para **milhares de requisições/minuto**.

---

## Como Obter Chave Gemini

1. Acesse: https://aistudio.google.com/apikey
2. Clique em "Create API Key"
3. Copie a chave (começa com `AIza...`)
4. Cole no Global Admin Settings

---

## Checklist de Validação

- [ ] Configurar chave Gemini no Global Admin
- [ ] Testar com provedor primário = Lovable
- [ ] Testar com provedor primário = Gemini
- [ ] Simular erro 429 e verificar fallback
- [ ] Verificar logs mostrando qual provedor foi usado
- [ ] Testar com múltiplas empresas simultaneamente

---

## Notas Importantes

1. **Segurança**: A chave Gemini será armazenada no system_settings (criptografada)
2. **Retrocompatibilidade**: Empresas existentes continuam funcionando sem mudança
3. **Log de Auditoria**: Cada resposta mostrará qual provedor foi usado
4. **Fallback Inteligente**: Só ativa em erros 429/402/500, não em erros de prompt

