

## Auditoria Completa do Projeto MiauChat - Fevereiro 2026

---

### 1. Inconsistencias Encontradas

#### 1.1 MEDIA - Referencia residual a `openai_shimmer` no backend
**Arquivo:** `supabase/functions/ai-text-to-speech/index.ts` (linha 25)
**Problema:** A funcao `isOpenAIVoice()` ainda verifica `openai_shimmer`, que foi removido do `voiceConfig.ts`. Nao causa erro funcional (apenas um check redundante), mas e codigo morto que pode confundir em manutencao futura.
**Correcao:** Remover `voiceId === 'openai_shimmer'` da funcao `isOpenAIVoice()`.

#### 1.2 MEDIA - Fallback de nome padrao incorreto em `getVoiceName()`
**Arquivo:** `src/lib/voiceConfig.ts` (linha 42)
**Problema:** Quando o ID da voz nao e encontrado, retorna `"Sarah"` como fallback -- mas Sarah nao existe mais no catálogo de vozes. O fallback deveria ser `"Laura"` (que e a voz padrao do sistema `DEFAULT_VOICE_ID = "el_laura"`).
**Correcao:** Trocar `return voice?.name || "Sarah"` por `return voice?.name || "Laura"`.

#### 1.3 BAIXA - `elevenlabs-tts` desincronizado com `ai-text-to-speech`
**Arquivo:** `supabase/functions/elevenlabs-tts/index.ts`
**Problema:** O mapa de vozes `ELEVENLABS_VOICES` tem 18+ vozes genericas (Roger, Sarah, Charlie, etc.) que nao sao mais oferecidas no frontend. So 3 vozes customizadas sao usadas (Laura, Felipe, Eloisa). Nao causa bug, mas o arquivo tem codigo desnecessário.

#### 1.4 BAIXA - config.toml referencia funcoes inexistentes
**Arquivo:** `supabase/config.toml`
**Problema:** As funcoes `process-agenda-pro-reminders`, `tray-commerce-api` e `tray-commerce-webhook` estao no config.toml com `verify_jwt = false`, mas seus diretórios nao existem em `supabase/functions/`. Isso nao causa erro em producao, mas e lixo de configuracao.

#### 1.5 ALTA - Volume de 401s em Edge Functions
**Dados:** Nos ultimos logs, uma funcao especifica (ID `1317462e...`) esta gerando dezenas de respostas 401 seguidas. Isso pode indicar:
- Tentativas de acesso nao autenticado repetidas
- Bot/scanner acessando endpoints
- Algum cron job com token expirado

---

### 2. Capacidade Atual do Sistema

#### 2.1 Empresas Ativas
| Empresa | Plano | Usuarios | Instancias WA | Conversas/30d |
|---|---|---|---|---|
| FMO Advogados | ENTERPRISE | 4/8 | 4/6 | 580 |
| PNH Importacao | PROFESSIONAL | 1/4 | 1/4 | 557 |
| Instituto Neves | BASIC | 2/2 | 1/2 | 96 |
| Liz Importados | BASIC | 1/2 | 1/2 | 29 |
| Miau test | PROFESSIONAL | 1/4 | 0/4 | 24 |
| Suporte MiauChat | PROFESSIONAL | 2/4 | 1/4 | 17 |
| Miau teste (x2) | STARTER | 1/3 | 0/3 | 0 |
| Jr | ENTERPRISE | 3/8 | 0/6 | 0 |

**Total ativo:** 9 empresas, ~1.303 conversas/mes

#### 2.2 Volume de Mensagens
- **Ultimos 30 dias:** 27.725 mensagens (14.192 recebidas + 13.533 enviadas)
- **Densidade media:** ~21 mensagens/conversa (dentro do esperado 17-25)

#### 2.3 Uso de IA (Fevereiro 2026)
- **Conversas com IA:** 492 conversas unicas
- **Audio TTS gerado:** 66 audios (~26 minutos)

#### 2.4 Estimativa de Capacidade

Baseado nos dados reais e na memoria do sistema (plano Supabase Pro = 500k invocacoes/mes):

```text
Consumo fixo (cron jobs):           ~45.000 invocacoes/mes
Consumo atual (9 empresas):         ~55.000 invocacoes/mes (estimado)
Total estimado:                     ~100.000 invocacoes/mes
Capacidade restante:                ~400.000 invocacoes/mes

Media por empresa ativa:            ~6.100 invocacoes/mes
Capacidade maxima estimada:         ~75 empresas de baixo volume (< 100 conversas/mes)
                                    ~25 empresas de volume medio (~500 conversas/mes)
                                    ~12 empresas de alto volume (~1.000+ conversas/mes)
```

O sistema esta operando a ~20% da capacidade maxima. Ha folga confortavel para crescer ate ~25 empresas de volume medio antes de precisar considerar upgrade para o plano Team.

---

### 3. Plano de Correcoes

As inconsistencias encontradas serao corrigidas em ordem de prioridade:

| # | Prioridade | Correcao | Arquivo |
|---|---|---|---|
| 1 | MEDIA | Remover referencia a `openai_shimmer` em `isOpenAIVoice()` | `ai-text-to-speech/index.ts` |
| 2 | MEDIA | Trocar fallback "Sarah" por "Laura" em `getVoiceName()` | `src/lib/voiceConfig.ts` |
| 3 | BAIXA | Limpar config.toml (funcoes fantasma) | `supabase/config.toml` (nao editavel) |
| 4 | INVESTIGAR | Analisar fonte dos 401s recorrentes | Logs de Edge Functions |

### 4. Resumo Geral

O sistema esta **saudavel** com margem de crescimento. As inconsistencias encontradas sao de baixa/media severidade -- nenhuma causa falha em producao. O problema mais significativo que tivemos (voz em ingles) ja foi corrigido nas sessoes anteriores. A capacidade suporta crescimento de 2-3x antes de necessitar upgrade de infraestrutura.

