// Configuração centralizada de vozes disponíveis
// Atualizar aqui reflete em AIVoiceSettings e AIAgentEdit

export type VoiceProvider = "speaktor" | "openai" | "elevenlabs";

export interface VoiceConfig {
  id: string;
  name: string;
  gender: "female" | "male";
  description: string;
  provider: VoiceProvider;
  // For ElevenLabs, store the actual voice ID
  externalId?: string;
}

// Speaktor voices - Brazilian Portuguese
export const SPEAKTOR_VOICES: VoiceConfig[] = [
  { id: "clara", name: "Clara", gender: "female", description: "Voz feminina brasileira jovem", provider: "speaktor" },
  { id: "larissa", name: "Larissa", gender: "female", description: "Voz feminina brasileira jovem adulto", provider: "speaktor" },
  { id: "ines", name: "Inês", gender: "female", description: "Voz feminina brasileira adulto", provider: "speaktor" },
  { id: "vanessa", name: "Vanessa", gender: "female", description: "Voz feminina brasileira adulto", provider: "speaktor" },
  { id: "lucas", name: "Lucas", gender: "male", description: "Voz masculina brasileira jovem adulto", provider: "speaktor" },
  { id: "caio", name: "Caio", gender: "male", description: "Voz masculina brasileira adulto", provider: "speaktor" },
];

// ElevenLabs voices - High quality multilingual
export const ELEVENLABS_VOICES: VoiceConfig[] = [
  { id: "el_sarah", name: "Sarah", gender: "female", description: "Voz feminina natural e expressiva", provider: "elevenlabs", externalId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "el_laura", name: "Laura", gender: "female", description: "Voz feminina profissional", provider: "elevenlabs", externalId: "FGY2WhTYpPnrIDTdsKH5" },
  { id: "el_alice", name: "Alice", gender: "female", description: "Voz feminina jovem e amigável", provider: "elevenlabs", externalId: "Xb7hH8MSUJpSbSDYk0k2" },
  { id: "el_jessica", name: "Jessica", gender: "female", description: "Voz feminina clara e confiante", provider: "elevenlabs", externalId: "cgSgspJ2msm6clMCkdW9" },
  { id: "el_lily", name: "Lily", gender: "female", description: "Voz feminina suave e calma", provider: "elevenlabs", externalId: "pFZP5JQG7iQjIQuC4Bku" },
  { id: "el_matilda", name: "Matilda", gender: "female", description: "Voz feminina elegante", provider: "elevenlabs", externalId: "XrExE9yKIg1WjnnlVkGX" },
  { id: "el_roger", name: "Roger", gender: "male", description: "Voz masculina profissional", provider: "elevenlabs", externalId: "CwhRBWXzGAHq8TQ4Fs17" },
  { id: "el_charlie", name: "Charlie", gender: "male", description: "Voz masculina amigável", provider: "elevenlabs", externalId: "IKne3meq5aSn9XLyUdCD" },
  { id: "el_george", name: "George", gender: "male", description: "Voz masculina grave e séria", provider: "elevenlabs", externalId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "el_daniel", name: "Daniel", gender: "male", description: "Voz masculina clara e articulada", provider: "elevenlabs", externalId: "onwK4e9ZLuTAKqWW03F9" },
  { id: "el_brian", name: "Brian", gender: "male", description: "Voz masculina neutra e versátil", provider: "elevenlabs", externalId: "nPczCjzI2devNBz1zQrb" },
  { id: "el_liam", name: "Liam", gender: "male", description: "Voz masculina jovem e dinâmica", provider: "elevenlabs", externalId: "TX3LPaxmHKxFdv7VOQHJ" },
];

// OpenAI voices (fallback)
export const OPENAI_VOICES: VoiceConfig[] = [
  { id: "shimmer", name: "Shimmer", gender: "female", description: "Voz feminina clara (OpenAI)", provider: "openai" },
];

// All available voices combined
export const AVAILABLE_VOICES: VoiceConfig[] = [
  ...ELEVENLABS_VOICES,
  ...SPEAKTOR_VOICES,
  ...OPENAI_VOICES,
];

export const DEFAULT_VOICE_ID = "el_sarah";

// Mapeamento para Speaktor API (usado na edge function)
export const SPEAKTOR_VOICE_MAPPING: Record<string, string> = {
  'clara': 'Clara',
  'larissa': 'Larissa',
  'ines': 'Inês',
  'vanessa': 'Vanessa Morgan',
  'lucas': 'Lucas',
  'caio': 'Caio',
  'shimmer': 'Clara', // fallback para OpenAI
};

// Helper to get voice by ID
export function getVoiceById(id: string): VoiceConfig | undefined {
  return AVAILABLE_VOICES.find(v => v.id === id);
}

// Helper to get ElevenLabs external ID
export function getElevenLabsVoiceId(id: string): string | undefined {
  const voice = ELEVENLABS_VOICES.find(v => v.id === id);
  return voice?.externalId;
}

// Helper to check if voice is ElevenLabs
export function isElevenLabsVoice(id: string): boolean {
  return id.startsWith('el_') || ELEVENLABS_VOICES.some(v => v.id === id);
}

// Helper to get provider badge config
export function getProviderBadge(provider: VoiceProvider): { label: string; className: string } {
  switch (provider) {
    case 'elevenlabs':
      return { label: 'ElevenLabs', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
    case 'speaktor':
      return { label: 'Speaktor', className: 'bg-purple-500/10 text-purple-600 border-purple-500/30' };
    case 'openai':
      return { label: 'OpenAI', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' };
  }
}
