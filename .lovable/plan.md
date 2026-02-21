

## Auditoria de Vozes: Agentes de IA vs Audio Gerado

### Situacao Atual no Banco de Dados

| Empresa | Agente | Voz no Agente | Voz na Empresa (tenant) | Audio Ativo |
|---|---|---|---|---|
| FMO Advogados | Maria | `el_laura` (Laura) | `el_eloisa` (Eloisa) | Sim |
| FMO Advogados | Caio | `el_felipe` (Felipe) | `el_eloisa` (Eloisa) | Sim |
| FMO Advogados | Davi | `el_eloisa` (Eloisa) | `el_eloisa` (Eloisa) | Sim |
| FMO Advogados | Ana - Proposta | `el_laura` (Laura) | `el_eloisa` (Eloisa) | Sim |
| Suporte MiauChat | Davi | `el_felipe` (Felipe) | `el_felipe` (Felipe) | Sim |
| Instituto Neves | Ana | `el_laura` (Laura) | `el_eloisa` (Eloisa) | Sim |
| PNH Importacao | Triagem | *nenhuma* | `camila` (INVALIDA) | Nao |
| PNH Importacao | Vendas 24hs | `el_laura` (Laura) | `camila` (INVALIDA) | Nao |

### Fluxo de Resolucao de Voz (como funciona)

```text
1. Agente (trigger_config.voice_id)  -- prioridade maxima
2. Empresa (law_firm_settings.ai_capabilities.elevenlabs_voice)
3. Global (system_settings.tts_elevenlabs_voice)
4. Fallback tecnico (el_laura)
```

O fluxo esta **correto** -- a voz do agente sempre tem prioridade. Entao:
- **Maria com Laura**: OK, vai usar Laura (voz do agente)
- **Caio com Felipe**: OK, vai usar Felipe (voz do agente)
- **Davi com Eloisa**: OK, vai usar Eloisa (voz do agente)

### Problemas Encontrados

#### 1. CRITICO - Voz global configurada como `openai_nova`
A configuracao global (`system_settings.tts_elevenlabs_voice`) esta com valor `openai_nova`. Quando um agente nao tem voz configurada e a empresa tambem nao, o sistema tenta usar `openai_nova` como voz ElevenLabs -- isso nao vai funcionar no ElevenLabs, mas o codigo detecta que e OpenAI e redireciona corretamente. Nao e um bug funcional, mas e confuso ter uma voz OpenAI como "default ElevenLabs".

#### 2. MEDIO - PNH tem voz `camila` que nao existe
A empresa PNH Importacao tem `camila` como voz do tenant. Essa voz nao existe no mapa `ELEVENLABS_VOICES`. Se o agente "Triagem" (que nao tem voz propria) ativar audio, vai receber `camila`, que vai cair no fallback do ElevenLabs para `el_laura`. Funciona, mas nao e intencional.

#### 3. INFO - Maria agora com Laura (corrigido pelo usuario)
O usuario informou que alterou Maria de Heloisa para Laura. O banco confirma: `agent_voice_id = el_laura`. Esta correto.

### Verificacao: Cada agente fala com a voz certa?

| Agente | Voz Configurada | Voz que Realmente Fala | Correto? |
|---|---|---|---|
| Maria (FMO) | el_laura | Laura (ElevenLabs) | SIM |
| Caio (FMO) | el_felipe | Felipe (ElevenLabs) | SIM |
| Davi (FMO) | el_eloisa | Eloisa (ElevenLabs) | SIM |
| Ana Proposta (FMO) | el_laura | Laura (ElevenLabs) | SIM |
| Davi (Suporte) | el_felipe | Felipe (ElevenLabs) | SIM |
| Ana (Instituto) | el_laura | Laura (ElevenLabs) | SIM |
| Triagem (PNH) | nenhuma | Cairia em `camila` -> fallback Laura | ATENCAO |
| Vendas (PNH) | el_laura | Laura (ElevenLabs) | SIM |

**Conclusao: Todos os agentes com voz configurada estao corretos.** O unico caso de atencao e o agente "Triagem" da PNH que nao tem voz propria e herdaria `camila` (voz invalida), mas o audio esta desativado para PNH entao nao gera problema na pratica.

### Correcoes Recomendadas

| # | Prioridade | Correcao |
|---|---|---|
| 1 | MEDIO | Atualizar voz global de `openai_nova` para `el_laura` na tabela `system_settings` (key: `tts_elevenlabs_voice`) |
| 2 | BAIXA | Atualizar voz tenant da PNH de `camila` para `el_laura` (voz valida) |

Essas correcoes sao no banco de dados (SQL simples), nao requerem alteracao de codigo.

### SQL para Correcao

```text
-- 1. Corrigir voz global
UPDATE system_settings SET value = 'el_laura' WHERE key = 'tts_elevenlabs_voice';

-- 2. Corrigir voz tenant da PNH (remover 'camila' invalida)
UPDATE law_firm_settings 
SET ai_capabilities = jsonb_set(
  COALESCE(ai_capabilities, '{}'::jsonb), 
  '{elevenlabs_voice}', 
  '"el_laura"'
)
WHERE law_firm_id = (SELECT id FROM law_firms WHERE name LIKE 'PNH%');
```

### Resumo

As vozes dos agentes da FMO estao todas corretas apos a correcao manual da Maria. O sistema de precedencia (agente > empresa > global > fallback) funciona bem. As unicas limpezas necessarias sao dados invalidos no banco: a voz global `openai_nova` e a voz `camila` da PNH.

