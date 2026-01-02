// Configuração centralizada de vozes disponíveis
// Atualizar aqui reflete em AIVoiceSettings e AIAgentEdit

export interface VoiceConfig {
  id: string;
  name: string;
  gender: "female" | "male";
  description: string;
  provider: "speaktor" | "openai";
}

export const AVAILABLE_VOICES: VoiceConfig[] = [
  // Speaktor Pro voices - Brasileiras (PT-BR)
  { id: "clara", name: "Clara", gender: "female", description: "Voz feminina brasileira jovem", provider: "speaktor" },
  { id: "larissa", name: "Larissa", gender: "female", description: "Voz feminina brasileira jovem adulto", provider: "speaktor" },
  { id: "ines", name: "Inês", gender: "female", description: "Voz feminina brasileira adulto", provider: "speaktor" },
  { id: "vanessa", name: "Vanessa", gender: "female", description: "Voz feminina brasileira adulto", provider: "speaktor" },
  { id: "lucas", name: "Lucas", gender: "male", description: "Voz masculina brasileira jovem adulto", provider: "speaktor" },
  { id: "caio", name: "Caio", gender: "male", description: "Voz masculina brasileira adulto", provider: "speaktor" },
  // OpenAI voices (fallback)
  { id: "shimmer", name: "Shimmer", gender: "female", description: "Voz feminina clara (OpenAI)", provider: "openai" },
];

export const DEFAULT_VOICE_ID = "clara";

// Mapeamento para Speaktor API (usado na edge function)
export const SPEAKTOR_VOICE_MAPPING: Record<string, string> = {
  'clara': 'Clara',
  'larissa': 'Larissa',
  'ines': 'Inês',
  'vanessa': 'Vanessa',
  'lucas': 'Lucas',
  'caio': 'Caio',
  'shimmer': 'Clara', // fallback para OpenAI
};
