import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ElevenLabs voice mapping
const ELEVENLABS_VOICES: Record<string, string> = {
  'el_laura': 'FGY2WhTYpPnrIDTdsKH5',
};

// OpenAI TTS voices
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// Check if voice is OpenAI
function isOpenAIVoice(voiceId: string): boolean {
  return voiceId === 'openai_nova' || OPENAI_VOICES.includes(voiceId);
}

interface TenantAIConfig {
  elevenLabsEnabled: boolean;
  openaiEnabled: boolean;
  elevenLabsVoice: string | null;
}

async function getTenantAIConfig(lawFirmId: string): Promise<TenantAIConfig> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settings } = await supabase
      .from('law_firm_settings')
      .select('ai_capabilities')
      .eq('law_firm_id', lawFirmId)
      .single();

    const caps = settings?.ai_capabilities as Record<string, unknown> | null;
    
    return {
      // Default: ElevenLabs enabled, OpenAI as fallback
      elevenLabsEnabled: caps?.elevenlabs_active !== false, // true by default
      openaiEnabled: caps?.openai_active === true,
      elevenLabsVoice: (caps?.elevenlabs_voice as string) || null,
    };
  } catch (error) {
    console.log('[TTS] Error fetching tenant config, using defaults:', error);
    return {
      elevenLabsEnabled: true,
      openaiEnabled: false,
      elevenLabsVoice: null,
    };
  }
}

async function generateElevenLabsAudio(text: string, voiceId: string): Promise<{ success: boolean; audioContent?: string; error?: string }> {
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  if (!ELEVENLABS_API_KEY) {
    return { success: false, error: "ElevenLabs API key not configured" };
  }

  // Resolve voice ID - default to Laura
  let resolvedVoiceId: string;
  if (ELEVENLABS_VOICES[voiceId]) {
    resolvedVoiceId = ELEVENLABS_VOICES[voiceId];
  } else if (voiceId.length > 15) {
    resolvedVoiceId = voiceId;
  } else {
    resolvedVoiceId = ELEVENLABS_VOICES['el_laura'];
  }

  console.log(`[TTS-ElevenLabs] Generating audio - voice: ${voiceId} -> ${resolvedVoiceId}`);

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
    console.error("[TTS-ElevenLabs] API error:", response.status, errorText);
    return { success: false, error: `ElevenLabs API error: ${response.status}` };
  }

  const audioBuffer = await response.arrayBuffer();
  const base64Audio = base64Encode(audioBuffer);
  
  console.log(`[TTS-ElevenLabs] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
  return { success: true, audioContent: base64Audio };
}

async function generateOpenAIAudio(text: string, voice: string = 'nova'): Promise<{ success: boolean; audioContent?: string; error?: string }> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return { success: false, error: "OpenAI API key not configured" };
  }

  // Validate/default voice
  const validVoice = OPENAI_VOICES.includes(voice) ? voice : 'nova';

  console.log(`[TTS-OpenAI] Generating audio - voice: ${validVoice}`);

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text,
      voice: validVoice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TTS-OpenAI] API error:", response.status, errorText);
    return { success: false, error: `OpenAI API error: ${response.status}` };
  }

  const audioBuffer = await response.arrayBuffer();
  const base64Audio = base64Encode(audioBuffer);
  
  console.log(`[TTS-OpenAI] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
  return { success: true, audioContent: base64Audio };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId = 'el_laura', lawFirmId } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant-specific AI configuration
    let config: TenantAIConfig = {
      elevenLabsEnabled: true,
      openaiEnabled: false,
      elevenLabsVoice: null,
    };

    if (lawFirmId) {
      config = await getTenantAIConfig(lawFirmId);
      console.log(`[TTS] Tenant config for ${lawFirmId}:`, config);
    }

    // Determine which voice to use (tenant default or request parameter)
    const effectiveVoiceId = config.elevenLabsVoice || voiceId;

    // If voice is explicitly OpenAI, use OpenAI directly
    if (isOpenAIVoice(effectiveVoiceId)) {
      console.log(`[TTS] Voice is OpenAI type, using OpenAI directly`);
      const result = await generateOpenAIAudio(text, 'nova');
      
      if (result.success) {
        return new Response(
          JSON.stringify({
            success: true,
            audioContent: result.audioContent,
            mimeType: "audio/mpeg",
            provider: "openai",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: result.error || "OpenAI TTS generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Priority: ElevenLabs > OpenAI > Error
    if (config.elevenLabsEnabled) {
      console.log(`[TTS] Using ElevenLabs (enabled for tenant)`);
      const result = await generateElevenLabsAudio(text, effectiveVoiceId);
      
      if (result.success) {
        return new Response(
          JSON.stringify({
            success: true,
            audioContent: result.audioContent,
            mimeType: "audio/mpeg",
            provider: "elevenlabs",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // ElevenLabs failed, try OpenAI if enabled
      console.log(`[TTS] ElevenLabs failed, checking OpenAI fallback...`);
      if (config.openaiEnabled) {
        console.log(`[TTS] Falling back to OpenAI`);
        const openaiResult = await generateOpenAIAudio(text, 'nova');
        
        if (openaiResult.success) {
          return new Response(
            JSON.stringify({
              success: true,
              audioContent: openaiResult.audioContent,
              mimeType: "audio/mpeg",
              provider: "openai",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      
      // Both failed
      return new Response(
        JSON.stringify({ error: result.error || "TTS generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ElevenLabs disabled, use OpenAI if enabled
    if (config.openaiEnabled) {
      console.log(`[TTS] ElevenLabs disabled, using OpenAI`);
      const result = await generateOpenAIAudio(text, 'nova');
      
      if (result.success) {
        return new Response(
          JSON.stringify({
            success: true,
            audioContent: result.audioContent,
            mimeType: "audio/mpeg",
            provider: "openai",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: result.error || "OpenAI TTS generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No TTS provider enabled
    console.log(`[TTS] No TTS provider enabled for tenant`);
    return new Response(
      JSON.stringify({ error: "No TTS provider enabled for this company" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
