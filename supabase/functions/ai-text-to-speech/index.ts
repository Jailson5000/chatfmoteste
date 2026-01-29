import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ElevenLabs voice mapping - synchronized with src/lib/voiceConfig.ts
const ELEVENLABS_VOICES: Record<string, string> = {
  'el_laura': 'sLEZIrFwEyhMIH1ALLIQ',
  'el_felipe': 'GxZ0UJKPezKah8TMxZZM',
  'el_eloisa': '4JmPeXyyRsHSbtyiCSrt',
};

// Default fallback voice (used when no voice is configured anywhere)
const TECHNICAL_FALLBACK_VOICE = 'el_laura';

// OpenAI TTS voices
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// Check if voice is OpenAI
function isOpenAIVoice(voiceId: string): boolean {
  return voiceId === 'openai_shimmer' || OPENAI_VOICES.includes(voiceId);
}

interface TenantAIConfig {
  elevenLabsEnabled: boolean;
  openaiEnabled: boolean;
  elevenLabsVoice: string | null;
  globalDefaultVoice: string | null;
}

async function getTenantAIConfig(lawFirmId: string): Promise<TenantAIConfig> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[TTS] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      return {
        elevenLabsEnabled: true,
        openaiEnabled: true,
        elevenLabsVoice: null,
        globalDefaultVoice: null,
      };
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch tenant settings (empresa)
    const { data: settings, error } = await supabase
      .from('law_firm_settings')
      .select('ai_capabilities')
      .eq('law_firm_id', lawFirmId)
      .single();

    if (error) {
      console.log('[TTS] Error fetching tenant settings:', error.message);
    }

    // Fetch global default voice from system_settings
    const { data: globalSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tts_elevenlabs_voice')
      .single();

    const globalDefaultVoice = globalSettings?.value as string || null;
    console.log('[TTS] Global default voice from system_settings:', globalDefaultVoice);

    const caps = settings?.ai_capabilities as Record<string, unknown> | null;
    
    return {
      elevenLabsEnabled: caps?.elevenlabs_active !== false,
      openaiEnabled: true,
      elevenLabsVoice: (caps?.elevenlabs_voice as string) || null,
      globalDefaultVoice,
    };
  } catch (error) {
    console.error('[TTS] Error in getTenantAIConfig:', error instanceof Error ? error.message : error);
    return {
      elevenLabsEnabled: true,
      openaiEnabled: true,
      elevenLabsVoice: null,
      globalDefaultVoice: null,
    };
  }
}

// Helper to get current billing period in YYYY-MM format
function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Estimate audio duration based on text length (avg 150 words/min, 5 chars/word = 750 chars/min)
function estimateAudioDuration(textLength: number): number {
  const CHARS_PER_SECOND = 12.5;
  return Math.ceil(textLength / CHARS_PER_SECOND);
}

// Record TTS usage for billing (frontend preview)
async function recordTTSUsage(lawFirmId: string, textLength: number): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      console.log('[TTS] Skipping usage tracking: missing credentials');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const billingPeriod = getCurrentBillingPeriod();
    const durationSeconds = estimateAudioDuration(textLength);
    
    const { error } = await supabase.from('usage_records').insert({
      law_firm_id: lawFirmId,
      usage_type: 'tts_audio',
      count: 1,
      duration_seconds: durationSeconds,
      billing_period: billingPeriod,
      metadata: {
        source: 'frontend_preview',
        text_length: textLength,
        generated_at: new Date().toISOString(),
      }
    });
    
    if (error) {
      console.error('[TTS] Failed to record usage:', error.message);
    } else {
      console.log(`[TTS] Usage recorded: ${durationSeconds}s, period: ${billingPeriod}`);
    }
  } catch (err) {
    console.error('[TTS] Error recording usage:', err instanceof Error ? err.message : err);
  }
}

async function generateElevenLabsAudio(text: string, voiceId: string): Promise<{ success: boolean; audioContent?: string; error?: string }> {
  console.log('[TTS-ElevenLabs] Starting audio generation...');
  
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  
  // Log API key status (never log the actual value)
  console.log('[TTS-ElevenLabs] API key configured:', !!ELEVENLABS_API_KEY);
  
  if (!ELEVENLABS_API_KEY) {
    console.error('[TTS-ElevenLabs] CRITICAL: ELEVENLABS_API_KEY is not set');
    return { success: false, error: "ElevenLabs API key not configured" };
  }

  // Resolve voice ID
  let resolvedVoiceId: string;
  if (ELEVENLABS_VOICES[voiceId]) {
    resolvedVoiceId = ELEVENLABS_VOICES[voiceId];
  } else if (voiceId === 'el_sarah') {
    resolvedVoiceId = ELEVENLABS_VOICES['el_laura'];
  } else if (voiceId.length > 15) {
    resolvedVoiceId = voiceId;
  } else {
    resolvedVoiceId = ELEVENLABS_VOICES['el_laura'];
  }

  console.log(`[TTS-ElevenLabs] Voice mapping: ${voiceId} -> ${resolvedVoiceId}`);
  console.log(`[TTS-ElevenLabs] Text length: ${text.length} chars`);

  try {
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}?output_format=mp3_44100_128`;
    console.log(`[TTS-ElevenLabs] Calling API: ${apiUrl.split('?')[0]}`);
    
    const response = await fetch(apiUrl, {
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
    });

    console.log(`[TTS-ElevenLabs] Response status: ${response.status} ${response.statusText}`);
    console.log(`[TTS-ElevenLabs] Response headers:`, {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS-ElevenLabs] API ERROR ${response.status}:`, errorText);
      
      // Log specific error types for debugging
      if (response.status === 401) {
        console.error('[TTS-ElevenLabs] ERROR TYPE: Invalid API key');
      } else if (response.status === 403) {
        console.error('[TTS-ElevenLabs] ERROR TYPE: Forbidden - check API key permissions');
      } else if (response.status === 429) {
        console.error('[TTS-ElevenLabs] ERROR TYPE: Rate limit exceeded');
      } else if (response.status === 422) {
        console.error('[TTS-ElevenLabs] ERROR TYPE: Invalid parameters');
      }
      
      return { success: false, error: `ElevenLabs API error: ${response.status} - ${errorText}` };
    }

    // Read as binary (arrayBuffer)
    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS-ElevenLabs] Audio buffer size: ${audioBuffer.byteLength} bytes`);
    
    if (audioBuffer.byteLength === 0) {
      console.error('[TTS-ElevenLabs] ERROR: Empty audio buffer received');
      return { success: false, error: 'Empty audio buffer received from ElevenLabs' };
    }
    
    const base64Audio = base64Encode(audioBuffer);
    console.log(`[TTS-ElevenLabs] Base64 audio length: ${base64Audio.length} chars`);
    console.log(`[TTS-ElevenLabs] SUCCESS: Audio generated`);
    
    return { success: true, audioContent: base64Audio };
  } catch (error) {
    console.error('[TTS-ElevenLabs] EXCEPTION:', error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function generateOpenAIAudio(text: string, voice: string = 'nova'): Promise<{ success: boolean; audioContent?: string; error?: string }> {
  console.log('[TTS-OpenAI] Starting audio generation...');
  
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  console.log('[TTS-OpenAI] API key configured:', !!OPENAI_API_KEY);
  
  if (!OPENAI_API_KEY) {
    console.error('[TTS-OpenAI] CRITICAL: OPENAI_API_KEY is not set');
    return { success: false, error: "OpenAI API key not configured" };
  }

  const validVoice = OPENAI_VOICES.includes(voice) ? voice : 'nova';
  console.log(`[TTS-OpenAI] Voice: ${validVoice}, Text length: ${text.length} chars`);

  try {
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

    console.log(`[TTS-OpenAI] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS-OpenAI] API ERROR ${response.status}:`, errorText);
      return { success: false, error: `OpenAI API error: ${response.status}` };
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS-OpenAI] Audio buffer size: ${audioBuffer.byteLength} bytes`);
    
    if (audioBuffer.byteLength === 0) {
      console.error('[TTS-OpenAI] ERROR: Empty audio buffer received');
      return { success: false, error: 'Empty audio buffer received from OpenAI' };
    }
    
    const base64Audio = base64Encode(audioBuffer);
    console.log(`[TTS-OpenAI] SUCCESS: Audio generated`);
    
    return { success: true, audioContent: base64Audio };
  } catch (error) {
    console.error('[TTS-OpenAI] EXCEPTION:', error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  console.log('[TTS] Request received:', req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { text, voiceId = 'el_laura', lawFirmId } = body;
    
    console.log('[TTS] Request params:', {
      textLength: text?.length || 0,
      voiceId,
      lawFirmId: lawFirmId || 'not provided',
    });

    if (!text) {
      console.error('[TTS] ERROR: No text provided');
      return new Response(
        JSON.stringify({ success: false, error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant-specific AI configuration
    let config: TenantAIConfig = {
      elevenLabsEnabled: true,
      openaiEnabled: true,
      elevenLabsVoice: null,
      globalDefaultVoice: null,
    };

    if (lawFirmId) {
      config = await getTenantAIConfig(lawFirmId);
      console.log('[TTS] Tenant config:', config);
    } else {
      console.log('[TTS] No lawFirmId, using defaults');
    }

    // Voice precedence: request voiceId → tenant voice → global default → technical fallback
    // CRITICAL: This implements the correct multi-tenant voice resolution
    const resolvedVoice = voiceId || config.elevenLabsVoice || config.globalDefaultVoice || TECHNICAL_FALLBACK_VOICE;
    const voiceSource = voiceId 
      ? 'request' 
      : config.elevenLabsVoice 
        ? 'empresa' 
        : config.globalDefaultVoice 
          ? 'global' 
          : 'fallback';
    
    console.log(`[TTS] Voice resolution: lawFirmId=${lawFirmId} voice=${resolvedVoice} source=${voiceSource}`);
    console.log('[TTS] Voice precedence details:', {
      requestVoiceId: voiceId,
      tenantVoice: config.elevenLabsVoice,
      globalVoice: config.globalDefaultVoice,
      resolved: resolvedVoice,
      source: voiceSource,
    });

    // If voice is explicitly OpenAI, use OpenAI directly
    if (isOpenAIVoice(resolvedVoice)) {
      console.log('[TTS] Using OpenAI (voice is OpenAI type)');
      const result = await generateOpenAIAudio(text, 'nova');
      
      if (result.success) {
        // Record TTS usage for billing (non-blocking)
        if (lawFirmId) {
          recordTTSUsage(lawFirmId, text.length).catch(err => {
            console.error('[TTS] Usage recording failed:', err);
          });
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            audioContent: result.audioContent,
            mimeType: "audio/mpeg",
            provider: "openai",
            voiceSource,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error('[TTS] OpenAI failed:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error || "OpenAI TTS generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Priority: ElevenLabs > OpenAI > Error
    if (config.elevenLabsEnabled) {
      console.log('[TTS] Trying ElevenLabs first...');
      const result = await generateElevenLabsAudio(text, resolvedVoice);
      
      if (result.success) {
        console.log('[TTS] ElevenLabs SUCCESS');
        
        // Record TTS usage for billing (non-blocking)
        if (lawFirmId) {
          recordTTSUsage(lawFirmId, text.length).catch(err => {
            console.error('[TTS] Usage recording failed:', err);
          });
        }
        
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
      
      console.log('[TTS] ElevenLabs FAILED, trying OpenAI fallback...');
      const openaiResult = await generateOpenAIAudio(text, 'shimmer');
      
      if (openaiResult.success) {
        console.log('[TTS] OpenAI fallback SUCCESS');
        
        // Record TTS usage for billing (non-blocking)
        if (lawFirmId) {
          recordTTSUsage(lawFirmId, text.length).catch(err => {
            console.error('[TTS] Usage recording failed:', err);
          });
        }
        
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
      
      console.error('[TTS] BOTH PROVIDERS FAILED');
      console.error('[TTS] ElevenLabs error:', result.error);
      console.error('[TTS] OpenAI error:', openaiResult.error);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `All TTS providers failed. ElevenLabs: ${result.error}. OpenAI: ${openaiResult.error}` 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ElevenLabs disabled, use OpenAI directly
    console.log('[TTS] ElevenLabs disabled, using OpenAI');
    const openaiResult = await generateOpenAIAudio(text, 'shimmer');
      
    if (openaiResult.success) {
      // Record TTS usage for billing (non-blocking)
      if (lawFirmId) {
        recordTTSUsage(lawFirmId, text.length).catch(err => {
          console.error('[TTS] Usage recording failed:', err);
        });
      }
      
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
      
    console.error('[TTS] OpenAI FAILED:', openaiResult.error);
    return new Response(
      JSON.stringify({ success: false, error: openaiResult.error || "OpenAI TTS generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[TTS] CRITICAL ERROR:", error instanceof Error ? error.message : error);
    console.error("[TTS] Stack:", error instanceof Error ? error.stack : 'N/A');
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
