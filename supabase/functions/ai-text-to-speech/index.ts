import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Available voices for TTS
const VOICES = {
  // Female voices
  'camila': { name: 'Camila', gender: 'female', description: 'Voz feminina brasileira, profissional e acolhedora' },
  'nova': { name: 'Nova', gender: 'female', description: 'Voz feminina suave e elegante' },
  // Male voices  
  'onyx': { name: 'Onyx', gender: 'male', description: 'Voz masculina grave e profissional' },
  'echo': { name: 'Echo', gender: 'male', description: 'Voz masculina clara e amigável' },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId = 'camila' } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate voice
    const voice = voiceId in VOICES ? voiceId : 'camila';

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("[TTS] OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "TTS service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[TTS] Generating audio with voice: ${voice}, text length: ${text.length}`);

    // Call OpenAI TTS API
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TTS] OpenAI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(audioBuffer))
    );

    console.log(`[TTS] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);

    return new Response(
      JSON.stringify({ 
        success: true,
        audioContent: base64Audio,
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
