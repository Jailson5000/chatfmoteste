import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Helper function to encode ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // Process in chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Available voices for OpenAI TTS
const OPENAI_VOICES: Record<string, { name: string; gender: string; description: string }> = {
  'shimmer': { name: 'Shimmer', gender: 'female', description: 'Voz feminina clara e expressiva' },
  'onyx': { name: 'Onyx', gender: 'male', description: 'Voz masculina grave e profissional' },
  'echo': { name: 'Echo', gender: 'male', description: 'Voz masculina clara e amigável' },
};

// Speaktor voice mapping (voiceId -> Speaktor voice name)
const SPEAKTOR_VOICES: Record<string, string> = {
  // Speaktor Pro voices - Brasileiras (PT-BR)
  'renata': 'Renata',
  'natalia': 'Natália',
  'adriana': 'Adriana',
  'carla': 'Carla',
  'rodrigo': 'Rodrigo',
  'paulo': 'Paulo',
  'carlos': 'Carlos',
  // OpenAI voice fallback mapping
  'shimmer': 'Renata',
};

async function getSpeaktorSettings(supabase: any): Promise<{ enabled: boolean; apiKey: string; voice: string }> {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['tts_speaktor_enabled', 'tts_speaktor_api_key', 'tts_speaktor_voice']);

  const getSetting = (key: string, defaultValue: any) => {
    const setting = settings?.find((s: any) => s.key === key);
    return setting?.value ?? defaultValue;
  };

  const enabled = getSetting('tts_speaktor_enabled', false);
  return {
    enabled: enabled === true || enabled === 'true',
    apiKey: getSetting('tts_speaktor_api_key', ''),
    voice: getSetting('tts_speaktor_voice', 'Vanessa Morgan'),
  };
}

async function generateWithSpeaktor(text: string, voiceId: string, apiKey: string, defaultVoice: string): Promise<{ success: boolean; audioContent?: string; error?: string }> {
  // Map voiceId to Speaktor voice, fallback to default configured voice
  const speaktorVoice = SPEAKTOR_VOICES[voiceId] || defaultVoice;
  
  console.log(`[TTS-Speaktor] Generating audio with voice: ${speaktorVoice} (from voiceId: ${voiceId}), text length: ${text.length}`);

  const response = await fetch("https://api.tor.app/developer/text_to_speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      language: "pt-BR",
      voice_name: speaktorVoice,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TTS-Speaktor] API error:", response.status, errorText);
    return { success: false, error: `Speaktor API error: ${response.status}` };
  }

  const data = await response.json();
  
  // Speaktor returns audioUrl, we need to fetch the audio
  if (data.audioUrl) {
    console.log(`[TTS-Speaktor] Audio URL received, fetching audio...`);
    const audioResponse = await fetch(data.audioUrl);
    if (!audioResponse.ok) {
      return { success: false, error: "Failed to fetch audio from Speaktor URL" };
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);
    console.log(`[TTS-Speaktor] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
    return { success: true, audioContent: base64Audio };
  }

  // If direct audio content is returned
  if (data.audio || data.audioContent) {
    return { success: true, audioContent: data.audio || data.audioContent };
  }

  return { success: false, error: "No audio content in Speaktor response" };
}

async function generateWithOpenAI(text: string, voiceId: string): Promise<{ success: boolean; audioContent?: string; error?: string }> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.error("[TTS-OpenAI] OPENAI_API_KEY is not configured");
    return { success: false, error: "OpenAI TTS service not configured" };
  }

  const voice = voiceId in OPENAI_VOICES ? voiceId : 'shimmer';
  console.log(`[TTS-OpenAI] Generating audio with voice: ${voice}, text length: ${text.length}`);

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: text,
      voice: voice,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TTS-OpenAI] API error:", response.status, errorText);
    return { success: false, error: "Failed to generate audio with OpenAI" };
  }

  const audioBuffer = await response.arrayBuffer();
  const base64Audio = arrayBufferToBase64(audioBuffer);
  console.log(`[TTS-OpenAI] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
  
  return { success: true, audioContent: base64Audio };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId = 'shimmer' } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client to check settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if Speaktor is enabled
    const speaktorSettings = await getSpeaktorSettings(supabase);
    
    let result: { success: boolean; audioContent?: string; error?: string };

    if (speaktorSettings.enabled && speaktorSettings.apiKey) {
      console.log("[TTS] Using Speaktor as TTS provider");
      result = await generateWithSpeaktor(text, voiceId, speaktorSettings.apiKey, speaktorSettings.voice);
      
      // Fallback to OpenAI if Speaktor fails
      if (!result.success) {
        console.log("[TTS] Speaktor failed, falling back to OpenAI");
        result = await generateWithOpenAI(text, voiceId);
      }
    } else {
      console.log("[TTS] Using OpenAI as TTS provider");
      result = await generateWithOpenAI(text, voiceId);
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error || "Failed to generate audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        audioContent: result.audioContent,
        mimeType: "audio/mpeg"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});