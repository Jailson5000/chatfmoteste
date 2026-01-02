import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ElevenLabs top voices
const ELEVENLABS_VOICES: Record<string, { name: string; voiceId: string }> = {
  // Default recommended voices
  'roger': { name: 'Roger', voiceId: 'CwhRBWXzGAHq8TQ4Fs17' },
  'sarah': { name: 'Sarah', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
  'laura': { name: 'Laura', voiceId: 'FGY2WhTYpPnrIDTdsKH5' },
  'charlie': { name: 'Charlie', voiceId: 'IKne3meq5aSn9XLyUdCD' },
  'george': { name: 'George', voiceId: 'JBFqnCBsd6RMkjVDRZzb' },
  'callum': { name: 'Callum', voiceId: 'N2lVS1w4EtoT3dr4eOWO' },
  'river': { name: 'River', voiceId: 'SAz9YHcvj6GT2YYXdXww' },
  'liam': { name: 'Liam', voiceId: 'TX3LPaxmHKxFdv7VOQHJ' },
  'alice': { name: 'Alice', voiceId: 'Xb7hH8MSUJpSbSDYk0k2' },
  'matilda': { name: 'Matilda', voiceId: 'XrExE9yKIg1WjnnlVkGX' },
  'will': { name: 'Will', voiceId: 'bIHbv24MWmeRgasZH58o' },
  'jessica': { name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  'eric': { name: 'Eric', voiceId: 'cjVigY5qzO86Huf0OWal' },
  'chris': { name: 'Chris', voiceId: 'iP95p4xoKVk53GoZ742B' },
  'brian': { name: 'Brian', voiceId: 'nPczCjzI2devNBz1zQrb' },
  'daniel': { name: 'Daniel', voiceId: 'onwK4e9ZLuTAKqWW03F9' },
  'lily': { name: 'Lily', voiceId: 'pFZP5JQG7iQjIQuC4Bku' },
  'bill': { name: 'Bill', voiceId: 'pqHfZKP75CvOlQylNhV4' },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId = 'sarah', model = 'eleven_multilingual_v2' } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("[ElevenLabs-TTS] ELEVENLABS_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve voice ID - can be internal name or direct ElevenLabs voice ID
    let resolvedVoiceId: string;
    if (ELEVENLABS_VOICES[voiceId.toLowerCase()]) {
      resolvedVoiceId = ELEVENLABS_VOICES[voiceId.toLowerCase()].voiceId;
    } else if (voiceId.length > 15) {
      // Assume it's a direct ElevenLabs voice ID
      resolvedVoiceId = voiceId;
    } else {
      // Default to Sarah
      resolvedVoiceId = ELEVENLABS_VOICES['sarah'].voiceId;
    }

    console.log(`[ElevenLabs-TTS] Generating audio - voice: ${voiceId} (${resolvedVoiceId}), model: ${model}, text length: ${text.length}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs-TTS] API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);
    
    console.log(`[ElevenLabs-TTS] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        mimeType: "audio/mpeg",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ElevenLabs-TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
