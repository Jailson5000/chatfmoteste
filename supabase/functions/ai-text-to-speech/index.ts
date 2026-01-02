import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ElevenLabs voice mapping
const ELEVENLABS_VOICES: Record<string, string> = {
  'el_sarah': 'EXAVITQu4vr4xnSDxMaL',
  'el_laura': 'FGY2WhTYpPnrIDTdsKH5',
  'el_alice': 'Xb7hH8MSUJpSbSDYk0k2',
  'el_jessica': 'cgSgspJ2msm6clMCkdW9',
  'el_lily': 'pFZP5JQG7iQjIQuC4Bku',
  'el_matilda': 'XrExE9yKIg1WjnnlVkGX',
  'el_roger': 'CwhRBWXzGAHq8TQ4Fs17',
  'el_charlie': 'IKne3meq5aSn9XLyUdCD',
  'el_george': 'JBFqnCBsd6RMkjVDRZzb',
  'el_daniel': 'onwK4e9ZLuTAKqWW03F9',
  'el_brian': 'nPczCjzI2devNBz1zQrb',
  'el_liam': 'TX3LPaxmHKxFdv7VOQHJ',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId = 'el_sarah' } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("[TTS] ELEVENLABS_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve voice ID
    let resolvedVoiceId: string;
    if (ELEVENLABS_VOICES[voiceId]) {
      resolvedVoiceId = ELEVENLABS_VOICES[voiceId];
    } else if (voiceId.length > 15) {
      resolvedVoiceId = voiceId;
    } else {
      resolvedVoiceId = ELEVENLABS_VOICES['el_sarah'];
    }

    console.log(`[TTS] Generating audio - voice: ${voiceId} -> ${resolvedVoiceId}, text length: ${text.length}`);

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
          model_id: "eleven_multilingual_v2",
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
      console.error("[TTS] ElevenLabs API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);
    
    console.log(`[TTS] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        mimeType: "audio/mpeg",
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
