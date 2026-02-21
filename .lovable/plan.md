
## Corrigir nome da voz no badge "Audio ativo"

### Problema

O badge mostra "Audio ativo - el_felipe" em vez de "Audio ativo - Felipe" porque o componente `AudioModeIndicator` tem um mapa de nomes que so inclui vozes OpenAI (shimmer, nova, etc.) e nao inclui as vozes ElevenLabs (el_felipe, el_laura, el_eloisa).

Quando a voz nao esta no mapa, o codigo mostra o ID cru (`el_felipe`) como fallback.

### Solucao

**Arquivo: `src/components/conversations/AudioModeIndicator.tsx`**

1. Importar `getVoiceName` de `src/lib/voiceConfig.ts` (que ja existe e resolve nomes corretamente para todas as vozes)
2. Remover o mapa local `VOICE_NAMES` duplicado
3. Usar `getVoiceName(voiceId)` para resolver o nome amigavel
4. Unificar o texto do badge para mostrar "Audio ativo - Felipe" em uma unica linha, sem separar em dois spans

### Detalhes tecnicos

```text
// ANTES (linha 48):
const voiceName = voiceId ? VOICE_NAMES[voiceId] || voiceId : "Padrão";

// DEPOIS:
const voiceName = voiceId ? getVoiceName(voiceId) : null;
```

O badge passara a mostrar:
- Com voz configurada: "Audio ativo - Felipe"
- Sem voz: "Audio ativo"

### Arquivo modificado

| Arquivo | Alteracao |
|---|---|
| `src/components/conversations/AudioModeIndicator.tsx` | Usar `getVoiceName` do voiceConfig; remover mapa duplicado; melhorar layout do badge |
