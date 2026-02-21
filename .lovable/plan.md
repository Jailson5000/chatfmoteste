

## Adicionar 3 Novas Vozes ElevenLabs

### Novas vozes

| Nome | ID interno | Voice ID (ElevenLabs) | Genero |
|---|---|---|---|
| Beatriz | el_beatriz | l6FLf2CbjEZfa48s6Gck | Feminino |
| Jorge | el_jorge | uVjqQW6FUVXNhcTeUUb7 | Masculino |
| Paula | el_paula | ORLvcAP49ax15SjxlQXk | Feminino |

### Arquivos a modificar

**1. `src/lib/voiceConfig.ts`** - Configuracao central do frontend
- Adicionar 3 entradas no array `AVAILABLE_VOICES` com os IDs internos `el_beatriz`, `el_jorge`, `el_paula`

**2. `supabase/functions/elevenlabs-tts/index.ts`** - Edge function de teste de voz
- Adicionar 3 entradas no mapa `ELEVENLABS_VOICES` (secao "Custom voices")

**3. `supabase/functions/ai-text-to-speech/index.ts`** - Edge function principal de TTS (usada pelo chat)
- Adicionar 3 entradas no mapa `ELEVENLABS_VOICES`

### Impacto

- As novas vozes aparecerao automaticamente na pagina de configuracao "Voz IA" e na edicao de agentes
- Nenhuma alteracao de banco de dados necessaria
- Nenhuma logica de resolucao precisa mudar (o sistema ja resolve por ID interno)

