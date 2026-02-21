import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  'el_beatriz': { name: 'Beatriz (Custom)', voiceId: 'l6FLf2CbjEZfa48s6Gck' },
  'el_jorge': { name: 'Jorge (Custom)', voiceId: 'uVjqQW6FUVXNhcTeUUb7' },
  'el_paula': { name: 'Paula (Custom)', voiceId: 'ORLvcAP49ax15SjxlQXk' },
};

// Valid models for validation
const VALID_MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_turbo_v2', 'eleven_monolingual_v1'];

// Max text length to prevent quota abuse
const MAX_TEXT_LENGTH = 5000;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to generate error reference ID
function generateErrorRef(): string {
  return crypto.randomUUID().slice(0, 8);
}


serve(async (req) => {
  console.log('[ElevenLabs-TTS] Request received:', req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const errorRef = generateErrorRef();

  try {
    // ============= AUTHENTICATION =============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${errorRef}] No authorization header provided`);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", ref: errorRef }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create client with user's auth token
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error(`[${errorRef}] Authentication failed`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication", ref: errorRef }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('[ElevenLabs-TTS] Authenticated user:', user.id);

    // ============= INPUT VALIDATION =============
    let body;
    try {
      body = await req.json();
    } catch {
      console.error(`[${errorRef}] Invalid JSON body`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request format", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, voiceId = 'sarah', model = 'eleven_multilingual_v2', lawFirmId } = body;
    
    // Validate text
    if (!text || typeof text !== 'string') {
      console.error(`[${errorRef}] Missing or invalid text`);
      return new Response(
        JSON.stringify({ success: false, error: "Text is required", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      console.error(`[${errorRef}] Text too long: ${text.length} chars`);
      return new Response(
        JSON.stringify({ success: false, error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`, ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate model
    if (!VALID_MODELS.includes(model)) {
      console.error(`[${errorRef}] Invalid model: ${model}`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid model specified", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate lawFirmId if provided
    if (lawFirmId && !UUID_REGEX.test(lawFirmId)) {
      console.error(`[${errorRef}] Invalid lawFirmId format`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request format", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= TENANT AUTHORIZATION =============
    // Verify user belongs to a law firm
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('law_firm_id')
      .eq('id', user.id)
      .single();

    if (!profile?.law_firm_id) {
      console.error(`[${errorRef}] User has no law firm association`);
      return new Response(
        JSON.stringify({ success: false, error: "Access denied", ref: errorRef }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If lawFirmId was provided, verify it matches user's law firm
    if (lawFirmId && lawFirmId !== profile.law_firm_id) {
      console.error(`[${errorRef}] Law firm mismatch`);
      return new Response(
        JSON.stringify({ success: false, error: "Access denied", ref: errorRef }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('[ElevenLabs-TTS] Request validated for law_firm:', profile.law_firm_id);

    // ============= TTS PROCESSING =============
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    
    if (!ELEVENLABS_API_KEY) {
      console.error(`[${errorRef}] ELEVENLABS_API_KEY is not set`);
      return new Response(
        JSON.stringify({ success: false, error: "Service configuration error", ref: errorRef }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve voice ID - can be internal name or direct ElevenLabs voice ID
    let resolvedVoiceId: string;
    const voiceLower = typeof voiceId === 'string' ? voiceId.toLowerCase() : 'sarah';
    
    if (ELEVENLABS_VOICES[voiceLower]) {
      resolvedVoiceId = ELEVENLABS_VOICES[voiceLower].voiceId;
      console.log(`[ElevenLabs-TTS] Voice mapped: ${voiceId} -> ${ELEVENLABS_VOICES[voiceLower].name}`);
    } else if (typeof voiceId === 'string' && voiceId.length > 15 && voiceId.length < 50) {
      // Assume it's a direct ElevenLabs voice ID (validate length)
      resolvedVoiceId = voiceId;
      console.log(`[ElevenLabs-TTS] Using direct voice ID`);
    } else {
      // Default to Sarah
      resolvedVoiceId = ELEVENLABS_VOICES['sarah'].voiceId;
      console.log(`[ElevenLabs-TTS] Unknown voice, defaulting to Sarah`);
    }

    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}?output_format=opus_48000_128`;
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

    if (!response.ok) {
      // Log the actual error internally but return generic message
      const errorText = await response.text();
      console.error(`[${errorRef}] ElevenLabs API error: ${response.status}`, errorText);
      
      // Return generic error without exposing internal details
      return new Response(
        JSON.stringify({ success: false, error: "Voice generation failed", ref: errorRef }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read as binary (arrayBuffer) - NEVER use res.json() or res.text() for audio
    const audioBuffer = await response.arrayBuffer();
    console.log(`[ElevenLabs-TTS] Audio buffer size: ${audioBuffer.byteLength} bytes`);
    
    if (audioBuffer.byteLength === 0) {
      console.error(`[${errorRef}] Empty audio buffer received`);
      return new Response(
        JSON.stringify({ success: false, error: "Voice generation failed", ref: errorRef }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const base64Audio = base64Encode(audioBuffer);
    console.log(`[ElevenLabs-TTS] SUCCESS: Audio generated, length: ${base64Audio.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        mimeType: "audio/mpeg",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${errorRef}] Critical error:`, error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred", ref: errorRef }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
