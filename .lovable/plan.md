

# Plano: Seletor de Modelo OpenAI por Empresa

## Resumo

Adicionar a capacidade de escolher um **modelo OpenAI específico por empresa**, mantendo o modelo global como padrão. Isso permite usar modelos mais baratos (GPT-4.1 Mini) para a maioria das empresas e modelos mais avançados (GPT-4o) para clientes premium.

---

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Banco de dados | **BAIXO** | Apenas adiciona campo ao JSONB `ai_capabilities` existente |
| Edge Function | **MÉDIO** | Altera lógica de seleção de modelo (bem isolada) |
| UI | **BAIXO** | Adiciona `<Select>` no diálogo existente |
| Retrocompatibilidade | **BAIXO** | Fallback para modelo global se não configurado |
| Quebrar projeto | **BAIXO** | Mudança isolada, não afeta outras funcionalidades |

**Conclusão: VALE A PENA - Risco total BAIXO**

---

## Alterações Necessárias

### 1. CompanyAIConfigDialog.tsx

**Adicionar estado e seletor de modelo OpenAI**

```typescript
// Estado
const [openaiModel, setOpenaiModel] = useState("global"); // "global" = usar padrão do sistema

// No loadSettings(), extrair do ai_capabilities:
const savedModel = caps?.openai_model ?? "global";
setOpenaiModel(savedModel);

// No handleSave(), incluir no enhancedCapabilities:
const enhancedCapabilities = {
  ...capabilities,
  openai_model: openaiModel, // ← ADICIONAR
  ia_site_active: internalEnabled,
  openai_active: openaiEnabled,
  // ...resto
};
```

**Adicionar seletor na UI (dentro do bloco OpenAI)**

```tsx
{openaiEnabled && (
  <div className="space-y-2 pt-2 border-t border-white/10">
    <Label className="text-white/70 text-sm">Modelo OpenAI</Label>
    <Select value={openaiModel} onValueChange={setOpenaiModel}>
      <SelectTrigger className="bg-white/5 border-white/10 text-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1a1a] border-white/10">
        <SelectItem value="global">🌐 Usar Padrão do Sistema</SelectItem>
        <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini (Mais Barato)</SelectItem>
        <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
        <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
        <SelectItem value="gpt-4o">GPT-4o (Mais Inteligente)</SelectItem>
        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-xs text-white/40">
      "Usar Padrão" aplica o modelo configurado em Admin Global → IAs APIs
    </p>
  </div>
)}
```

---

### 2. Edge Function: ai-chat/index.ts

**Alterar lógica para verificar modelo do tenant**

Na seção de carregamento de configurações do tenant (após linha ~3530):

```typescript
// Per-tenant override (Enterprise only - uses their own OpenAI key)
if (context?.lawFirmId) {
  const { data: settings } = await supabase
    .from("law_firm_settings")
    .select("ai_provider, ai_capabilities")
    .eq("law_firm_id", context.lawFirmId)
    .maybeSingle();
  
  if (settings?.ai_capabilities) {
    const caps = settings.ai_capabilities as any;
    const iaOpenAI = caps.openai_active ?? (settings.ai_provider === "openai");
    
    // ========== NOVO: Verificar modelo específico do tenant ==========
    const tenantModel = caps.openai_model;
    if (tenantModel && tenantModel !== "global") {
      openaiModel = tenantModel;
      console.log(`[AI Chat] Using tenant-specific OpenAI model: ${openaiModel}`);
    }
    // ================================================================
    
    if (iaOpenAI && OPENAI_API_KEY) {
      useOpenAI = true;
      console.log(`[AI Chat] Using OpenAI per-tenant override (model=${openaiModel})`);
    }
  }
}
```

---

## Fluxo de Decisão do Modelo

```text
┌─────────────────────────────────────────────────────────────────┐
│                     SELEÇÃO DE MODELO OPENAI                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Empresa tem openai_model no ai_capabilities?                   │
│                    │                                            │
│           ┌───────┴───────┐                                     │
│           │               │                                     │
│        SIM (≠ global)    NÃO ou "global"                       │
│           │               │                                     │
│     Usa modelo da      Usa modelo global                       │
│        empresa          (system_settings)                       │
│           │               │                                     │
│     ex: "gpt-4o"     ex: "gpt-4.1-mini"                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `src/components/global-admin/CompanyAIConfigDialog.tsx` | Adicionar estado e seletor de modelo |
| `supabase/functions/ai-chat/index.ts` | Ler modelo do tenant e aplicar |

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Segurança | **NENHUM** - Não expõe dados sensíveis |
| Performance | **NENHUM** - Apenas uma leitura adicional de campo |
| Retrocompatibilidade | **100%** - Empresas sem configuração usam global |
| Custo | **REDUÇÃO** - Permite otimizar modelo por empresa |

---

## Seção Técnica

### Estrutura do JSONB ai_capabilities (após alteração)

```json
{
  "auto_reply": true,
  "summary": true,
  "transcription": true,
  "classification": true,
  "image_analysis": true,
  "audio_response": true,
  "ia_site_active": true,
  "openai_active": true,
  "elevenlabs_active": true,
  "elevenlabs_voice": "el_laura",
  "openai_model": "gpt-4o-mini"  // ← NOVO CAMPO
}
```

### Valores possíveis para openai_model

| Valor | Descrição |
|-------|-----------|
| `"global"` ou `null` | Usa modelo configurado em Admin Global |
| `"gpt-4.1-mini"` | GPT-4.1 Mini (mais barato, contexto 1M) |
| `"gpt-4.1"` | GPT-4.1 (intermediário) |
| `"gpt-4o-mini"` | GPT-4o Mini (barato, bom equilíbrio) |
| `"gpt-4o"` | GPT-4o (mais inteligente) |
| `"gpt-4-turbo"` | GPT-4 Turbo (legacy) |

