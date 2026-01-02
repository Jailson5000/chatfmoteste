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
  { id: "renata", name: "Renata", gender: "female", description: "Voz feminina brasileira jovem adulto", provider: "speaktor" },
  { id: "natalia", name: "Natália", gender: "female", description: "Voz feminina brasileira jovem adulto", provider: "speaktor" },
  { id: "adriana", name: "Adriana", gender: "female", description: "Voz feminina brasileira adulto", provider: "speaktor" },
  { id: "carla", name: "Carla", gender: "female", description: "Voz feminina brasileira adulto", provider: "speaktor" },
  { id: "rodrigo", name: "Rodrigo", gender: "male", description: "Voz masculina brasileira jovem adulto", provider: "speaktor" },
  { id: "paulo", name: "Paulo", gender: "male", description: "Voz masculina brasileira adulto", provider: "speaktor" },
  { id: "carlos", name: "Carlos", gender: "male", description: "Voz masculina brasileira adulto", provider: "speaktor" },
  // OpenAI voices (fallback)
  { id: "shimmer", name: "Shimmer", gender: "female", description: "Voz feminina clara (OpenAI)", provider: "openai" },
];

export const DEFAULT_VOICE_ID = "renata";

// Mapeamento para Speaktor API (usado na edge function)
export const SPEAKTOR_VOICE_MAPPING: Record<string, string> = {
  'renata': 'Renata',
  'natalia': 'Natália',
  'adriana': 'Adriana',
  'carla': 'Carla',
  'rodrigo': 'Rodrigo',
  'paulo': 'Paulo',
  'carlos': 'Carlos',
  'shimmer': 'Renata', // fallback
};
