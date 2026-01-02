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

// ElevenLabs voices - High quality multilingual
export const AVAILABLE_VOICES: VoiceConfig[] = [
  { id: "el_sarah", name: "Sarah", gender: "female", description: "Voz feminina natural e expressiva", externalId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "el_laura", name: "Laura", gender: "female", description: "Voz feminina profissional", externalId: "FGY2WhTYpPnrIDTdsKH5" },
  { id: "el_alice", name: "Alice", gender: "female", description: "Voz feminina jovem e amigável", externalId: "Xb7hH8MSUJpSbSDYk0k2" },
  { id: "el_jessica", name: "Jessica", gender: "female", description: "Voz feminina clara e confiante", externalId: "cgSgspJ2msm6clMCkdW9" },
  { id: "el_lily", name: "Lily", gender: "female", description: "Voz feminina suave e calma", externalId: "pFZP5JQG7iQjIQuC4Bku" },
  { id: "el_matilda", name: "Matilda", gender: "female", description: "Voz feminina elegante", externalId: "XrExE9yKIg1WjnnlVkGX" },
  { id: "el_roger", name: "Roger", gender: "male", description: "Voz masculina profissional", externalId: "CwhRBWXzGAHq8TQ4Fs17" },
  { id: "el_charlie", name: "Charlie", gender: "male", description: "Voz masculina amigável", externalId: "IKne3meq5aSn9XLyUdCD" },
  { id: "el_george", name: "George", gender: "male", description: "Voz masculina grave e séria", externalId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "el_daniel", name: "Daniel", gender: "male", description: "Voz masculina clara e articulada", externalId: "onwK4e9ZLuTAKqWW03F9" },
  { id: "el_brian", name: "Brian", gender: "male", description: "Voz masculina neutra e versátil", externalId: "nPczCjzI2devNBz1zQrb" },
  { id: "el_liam", name: "Liam", gender: "male", description: "Voz masculina jovem e dinâmica", externalId: "TX3LPaxmHKxFdv7VOQHJ" },
];

export const DEFAULT_VOICE_ID = "el_sarah";

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
