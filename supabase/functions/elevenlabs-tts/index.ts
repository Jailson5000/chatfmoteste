import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ElevenLabs top voices - synchronized with src/lib/voiceConfig.ts
const ELEVENLABS_VOICES: Record<string, { name: string; voiceId: string }> = {
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
  // Custom voices - synchronized with src/lib/voiceConfig.ts
  'el_laura': { name: 'Laura (Custom)', voiceId: 'sLEZIrFwEyhMIH1ALLIQ' },
  'el_felipe': { name: 'Felipe (Custom)', voiceId: 'GxZ0UJKPezKah8TMxZZM' },
  'el_eloisa': { name: 'Eloisa (Custom)', voiceId: '4JmPeXyyRsHSbtyiCSrt' },
};

serve(async (req) => {
  console.log('[ElevenLabs-TTS] Request received:', req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { text, voiceId = 'sarah', model = 'eleven_multilingual_v2' } = body;
    
    console.log('[ElevenLabs-TTS] Request params:', {
      textLength: text?.length || 0,
      voiceId,
      model,
    });

    if (!text) {
      console.error('[ElevenLabs-TTS] ERROR: No text provided');
      return new Response(
        JSON.stringify({ success: false, error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    
    // Log API key status (never log the actual value)
    console.log('[ElevenLabs-TTS] API key configured:', !!ELEVENLABS_API_KEY);
    
    if (!ELEVENLABS_API_KEY) {
      console.error("[ElevenLabs-TTS] CRITICAL: ELEVENLABS_API_KEY is not set");
      return new Response(
        JSON.stringify({ success: false, error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve voice ID - can be internal name or direct ElevenLabs voice ID
    let resolvedVoiceId: string;
    const voiceLower = voiceId.toLowerCase();
    
    if (ELEVENLABS_VOICES[voiceLower]) {
      resolvedVoiceId = ELEVENLABS_VOICES[voiceLower].voiceId;
      console.log(`[ElevenLabs-TTS] Voice mapped: ${voiceId} -> ${ELEVENLABS_VOICES[voiceLower].name} (${resolvedVoiceId})`);
    } else if (voiceId.length > 15) {
      // Assume it's a direct ElevenLabs voice ID
      resolvedVoiceId = voiceId;
      console.log(`[ElevenLabs-TTS] Using direct voice ID: ${resolvedVoiceId}`);
    } else {
      // Default to Sarah
      resolvedVoiceId = ELEVENLABS_VOICES['sarah'].voiceId;
      console.log(`[ElevenLabs-TTS] Unknown voice "${voiceId}", defaulting to Sarah`);
    }

    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}?output_format=mp3_44100_128`;
    console.log(`[ElevenLabs-TTS] Calling API...`);

    const response = await fetch(apiUrl, {
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
    });

    console.log(`[ElevenLabs-TTS] Response status: ${response.status} ${response.statusText}`);
    console.log(`[ElevenLabs-TTS] Response headers:`, {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ElevenLabs-TTS] API ERROR ${response.status}:`, errorText);
      
      // Log specific error types
      if (response.status === 401) {
        console.error('[ElevenLabs-TTS] ERROR TYPE: Invalid API key');
      } else if (response.status === 403) {
        console.error('[ElevenLabs-TTS] ERROR TYPE: Forbidden - check API key permissions');
      } else if (response.status === 429) {
        console.error('[ElevenLabs-TTS] ERROR TYPE: Rate limit exceeded');
      } else if (response.status === 422) {
        console.error('[ElevenLabs-TTS] ERROR TYPE: Invalid parameters');
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `ElevenLabs API error: ${response.status} - ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read as binary (arrayBuffer) - NEVER use res.json() or res.text() for audio
    const audioBuffer = await response.arrayBuffer();
    console.log(`[ElevenLabs-TTS] Audio buffer size: ${audioBuffer.byteLength} bytes`);
    
    if (audioBuffer.byteLength === 0) {
      console.error('[ElevenLabs-TTS] ERROR: Empty audio buffer received');
      return new Response(
        JSON.stringify({ success: false, error: "Empty audio buffer received from ElevenLabs" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const base64Audio = base64Encode(audioBuffer);
    console.log(`[ElevenLabs-TTS] Base64 audio length: ${base64Audio.length} chars`);
    console.log(`[ElevenLabs-TTS] SUCCESS: Audio generated`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        mimeType: "audio/mpeg",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ElevenLabs-TTS] CRITICAL ERROR:", error instanceof Error ? error.message : error);
    console.error("[ElevenLabs-TTS] Stack:", error instanceof Error ? error.stack : 'N/A');
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
