// Configuração centralizada de vozes disponíveis
// Atualizar aqui reflete em AIVoiceSettings e AIAgentEdit

export interface VoiceConfig {
  id: string;
  name: string;
  gender: "female" | "male";
  description: string;
  // ElevenLabs voice ID
  externalId: string;
}

// Available TTS voices
export const AVAILABLE_VOICES: VoiceConfig[] = [
  { id: "el_laura", name: "Laura", gender: "female", description: "Voz feminina profissional de alta qualidade", externalId: "sLEZIrFwEyhMIH1ALLIQ" },
  { id: "el_felipe", name: "Felipe", gender: "male", description: "Voz masculina profissional de alta qualidade", externalId: "GxZ0UJKPezKah8TMxZZM" },
  { id: "el_eloisa", name: "Eloisa", gender: "female", description: "Voz feminina profissional de alta qualidade", externalId: "4JmPeXyyRsHSbtyiCSrt" },
  { id: "openai_shimmer", name: "Shimmer", gender: "female", description: "Voz feminina padrão", externalId: "shimmer" },
];

export const DEFAULT_VOICE_ID = "el_laura";

// Helper to get voice by ID
export function getVoiceById(id: string): VoiceConfig | undefined {
  return AVAILABLE_VOICES.find(v => v.id === id);
}

// Helper to get ElevenLabs external ID from internal ID
export function getElevenLabsVoiceId(id: string): string {
  const voice = AVAILABLE_VOICES.find(v => v.id === id);
  // If not found, check if it's already an external ID
  if (!voice) {
    const byExternal = AVAILABLE_VOICES.find(v => v.externalId === id);
    return byExternal?.externalId || AVAILABLE_VOICES[0].externalId;
  }
  return voice.externalId;
}

// Helper to get voice name by ID
export function getVoiceName(id: string): string {
  const voice = AVAILABLE_VOICES.find(v => v.id === id);
  return voice?.name || "Sarah";
}
