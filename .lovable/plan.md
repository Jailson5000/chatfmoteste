# Plano: Correção das Contagens de Consumo (IA, Áudio, Agentes)

## ✅ IMPLEMENTADO

### Correções Aplicadas

#### 1. TTS Frontend Agora é Contabilizado ✅

**Arquivos modificados:**
- `supabase/functions/elevenlabs-tts/index.ts`
- `supabase/functions/ai-text-to-speech/index.ts`

Adicionada função `recordTTSUsage()` que:
- Estima a duração do áudio baseado no tamanho do texto (750 chars/min)
- Registra em `usage_records` com `source: 'frontend_preview'`
- Executa de forma não-bloqueante (não impacta performance)

#### 2. Metadado 'source' Adicionado ao WhatsApp ✅

**Arquivo modificado:** `supabase/functions/evolution-webhook/index.ts`

A função `recordAIConversationUsage` agora:
- Aceita parâmetro `source` (default: 'whatsapp')
- Registra `source` nos metadados de `usage_records`
- Permite análise de origem das conversas IA

## Fluxo TTS Corrigido

```text
┌─────────────────────────────────────────────────────────────────┐
│ FLUXO TTS (completo)                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [evolution-webhook] → recordTTSUsage() ✅ Registra (whatsapp)   │
│                                                                 │
│ [elevenlabs-tts]    → recordTTSUsage() ✅ Registra (frontend)   │
│ [ai-text-to-speech] → recordTTSUsage() ✅ Registra (frontend)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Checklist de Validação

- [x] TTS gerado no preview de agente registra `usage_records`
- [x] TTS gerado em configurações de voz registra `usage_records`
- [x] Conversas IA do webhook incluem `source: 'whatsapp'` nos metadados
- [x] Contagem de agentes permanece correta (só ativos)
- [x] Contagem de conversas IA permanece correta
- [x] Dashboard mostra métricas de TTS atualizadas
- [x] CompanyUsageTable mostra TTS minutos corretamente
