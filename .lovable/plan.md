
# Plano: Correção das Contagens de Consumo (IA, Áudio, Agentes)

## Resumo da Análise

Após análise detalhada do sistema de contagem de consumo, identifiquei **2 problemas principais** e **1 potencial inconsistência**:

## Problemas Encontrados

### 1. TTS Frontend Não é Contabilizado

**Arquivo afetado:** `supabase/functions/elevenlabs-tts/index.ts`

A função `elevenlabs-tts` (usada pelo frontend para preview de voz) **NÃO registra uso de TTS**. Apenas a função `evolution-webhook` registra via `recordTTSUsage()`.

**Impacto:**
- Áudio gerado para preview de agente (página de edição)
- Áudio gerado para teste de voz (configurações)
- Esses minutos NÃO estão sendo contabilizados na fatura

**Correção:**
Adicionar `recordTTSUsage()` na função `elevenlabs-tts` após gerar áudio com sucesso.

```text
┌─────────────────────────────────────────────────────────────────┐
│ FLUXO TTS ATUAL (incompleto)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [evolution-webhook] → recordTTSUsage() ✅ Registra              │
│                                                                 │
│ [elevenlabs-tts]    → NÃO registra    ❌ FALTA                  │
│ [ai-text-to-speech] → NÃO registra    ❌ FALTA                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Metadado 'source' Inconsistente

**Arquivo afetado:** `supabase/functions/evolution-webhook/index.ts`

A função `recordAIConversationUsage` no `evolution-webhook` **NÃO inclui o campo 'source'** nos metadados, enquanto a função `ai-chat` inclui.

**Situação atual na base:**
| Source     | Registros |
|------------|-----------|
| null       | 24        |
| whatsapp   | 18        |
| WIDGET     | 4         |
| unknown    | 1         |

**Impacto:**
- Dificulta análise de origem das conversas IA
- Dados incompletos para relatórios

**Correção:**
Adicionar parâmetro `source: 'whatsapp'` nas chamadas de `recordAIConversationUsage` no `evolution-webhook`.

## Itens Verificados que Estão Corretos ✅

### Contagem de Conversas IA
- Widget (WIDGET): ✅ Sendo contabilizado corretamente
- WhatsApp: ✅ Sendo contabilizado corretamente
- Regra de 1 conversa = 1 contagem por período: ✅ Funcionando

### Contagem de Agentes
- View `company_usage_summary`: ✅ Conta apenas agentes ativos (`is_active = true`)
- Dashboard: ✅ Usa dados corretos da view

### Contagem de Empresas
- Métricas granulares: ✅ Funcionando (Ativas, Trial, Pendentes, etc.)
- Dashboard vs Empresas: ✅ Sincronizados após correção anterior

### Dados Comparativos (Janeiro 2026)
| Empresa         | Conv. IA (BD) | Conv. IA (View) | Match |
|-----------------|---------------|-----------------|-------|
| FMO Advogados   | 28            | 28              | ✅    |
| Jr              | 11            | 11              | ✅    |
| Liz importados  | 6             | 6               | ✅    |
| Suporte MiauChat| 2             | 2               | ✅    |

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/elevenlabs-tts/index.ts` | Adicionar `recordTTSUsage()` |
| `supabase/functions/ai-text-to-speech/index.ts` | Adicionar `recordTTSUsage()` |
| `supabase/functions/evolution-webhook/index.ts` | Adicionar campo `source` nos metadados |

## Implementação Detalhada

### 1. Modificar `elevenlabs-tts/index.ts`

Adicionar função helper e chamada após sucesso:

```typescript
// Helper function to record TTS usage
async function recordTTSUsage(
  lawFirmId: string,
  textLength: number
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) return;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const billingPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  // Estimate duration: avg 150 words/min, 5 chars/word = 750 chars/min
  const estimatedSeconds = Math.ceil((textLength / 750) * 60);
  
  await supabase.from('usage_records').insert({
    law_firm_id: lawFirmId,
    usage_type: 'tts_audio',
    count: 1,
    duration_seconds: estimatedSeconds,
    billing_period: billingPeriod,
    metadata: {
      source: 'frontend_preview',
      text_length: textLength,
    }
  });
}
```

Chamar após gerar áudio com sucesso (linha ~238):
```typescript
// Record TTS usage for billing
if (profile.law_firm_id) {
  await recordTTSUsage(profile.law_firm_id, text.length);
}
```

### 2. Modificar `ai-text-to-speech/index.ts`

Similar ao elevenlabs-tts, adicionar tracking após gerar áudio.

### 3. Modificar `evolution-webhook/index.ts`

Atualizar a função `recordAIConversationUsage` para aceitar `source`:

```typescript
async function recordAIConversationUsage(
  supabaseClient: any,
  lawFirmId: string,
  conversationId: string,
  automationId: string,
  automationName: string,
  source: string = 'whatsapp'  // ← NOVO PARÂMETRO
): Promise<boolean> {
  // ... existing code ...
  
  const { error } = await supabaseClient
    .from('usage_records')
    .insert({
      // ... existing fields ...
      metadata: {
        conversation_id: conversationId,
        automation_id: automationId,
        automation_name: automationName,
        source: source,  // ← NOVO CAMPO
        first_ai_response_at: new Date().toISOString(),
      }
    });
}
```

E atualizar todas as chamadas para incluir o source:
```typescript
await recordAIConversationUsage(
  supabaseClient,
  context.lawFirmId,
  context.conversationId,
  automation.id,
  automation.name,
  'whatsapp'  // ← ADICIONAR
);
```

## Benefícios

1. **Faturamento completo**: Todo uso de TTS será contabilizado
2. **Rastreabilidade**: Origem de cada conversa IA identificável
3. **Relatórios precisos**: Dados mais ricos para análise
4. **Sem regressão**: Mudanças são aditivas, não alteram lógica existente

## Checklist de Validação

- [ ] TTS gerado no preview de agente registra `usage_records`
- [ ] TTS gerado em configurações de voz registra `usage_records`
- [ ] Conversas IA do webhook incluem `source: 'whatsapp'` nos metadados
- [ ] Dashboard mostra métricas de TTS atualizadas
- [ ] CompanyUsageTable mostra TTS minutos corretamente
- [ ] Contagem de agentes permanece correta (só ativos)
- [ ] Contagem de conversas IA permanece correta
