import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Volume2, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import { supabase } from "@/integrations/supabase/client";
import { 
  AVAILABLE_VOICES, 
  DEFAULT_VOICE_ID, 
  getProviderBadge, 
  isElevenLabsVoice,
  getElevenLabsVoiceId 
} from "@/lib/voiceConfig";

interface VoiceSettings {
  ai_voice_enabled: boolean;
  ai_voice_id: string;
}

export function AIVoiceSettings() {
  const { toast } = useToast();
  const { lawFirm } = useLawFirm();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [settings, setSettings] = useState<VoiceSettings>({
    ai_voice_enabled: false,
    ai_voice_id: DEFAULT_VOICE_ID,
  });

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      if (!lawFirm?.id) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("law_firm_settings")
          .select("ai_voice_enabled, ai_voice_id")
          .eq("law_firm_id", lawFirm.id)
          .maybeSingle();

        if (error) throw error;
        
        if (data) {
          setSettings({
            ai_voice_enabled: data.ai_voice_enabled || false,
            ai_voice_id: data.ai_voice_id || DEFAULT_VOICE_ID,
          });
        }
      } catch (error) {
        console.error("[AIVoiceSettings] Load error:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [lawFirm?.id]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSave = async () => {
    if (!lawFirm?.id) return;
    
    setIsSaving(true);
    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from("law_firm_settings")
        .select("id")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      const updateData = {
        ai_voice_enabled: settings.ai_voice_enabled,
        ai_voice_id: settings.ai_voice_id,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("law_firm_settings")
          .update(updateData)
          .eq("law_firm_id", lawFirm.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("law_firm_settings")
          .insert({
            law_firm_id: lawFirm.id,
            ...updateData,
          });

        if (error) throw error;
      }

      toast({
        title: "Configurações salvas",
        description: "As configurações de voz da IA foram atualizadas",
      });
    } catch (error: any) {
      console.error("[AIVoiceSettings] Save error:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestVoice = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    setIsTesting(true);
    try {
      const testText = "Olá! Esta é uma demonstração da voz selecionada para as respostas da inteligência artificial.";
      
      // Determine which endpoint to use based on voice provider
      const isElevenlabs = isElevenLabsVoice(settings.ai_voice_id);
      const endpoint = isElevenlabs ? 'elevenlabs-tts' : 'ai-text-to-speech';
      
      // For ElevenLabs, use the external voice ID
      const voiceIdToSend = isElevenlabs 
        ? getElevenLabsVoiceId(settings.ai_voice_id) || settings.ai_voice_id
        : settings.ai_voice_id;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            text: testText,
            voiceId: voiceIdToSend,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao gerar áudio");
      }

      const data = await response.json();
      
      if (data.audioContent) {
        const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        
        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
        };
        
        audio.onerror = () => {
          setIsPlaying(false);
          audioRef.current = null;
          toast({
            title: "Erro ao reproduzir",
            description: "Não foi possível reproduzir o áudio",
            variant: "destructive",
          });
        };
        
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error: any) {
      console.error("[AIVoiceSettings] Test error:", error);
      toast({
        title: "Erro no teste",
        description: error.message || "Não foi possível testar a voz",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const selectedVoice = AVAILABLE_VOICES.find(v => v.id === settings.ai_voice_id);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // Group voices by provider
  const voicesByProvider = {
    elevenlabs: AVAILABLE_VOICES.filter(v => v.provider === 'elevenlabs'),
    speaktor: AVAILABLE_VOICES.filter(v => v.provider === 'speaktor'),
    openai: AVAILABLE_VOICES.filter(v => v.provider === 'openai'),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Resposta por Áudio
            </CardTitle>
            <CardDescription>
              Permita que a IA responda com mensagens de áudio além de texto
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
          <div className="space-y-1">
            <Label className="text-base font-medium">Ativar respostas por áudio</Label>
            <p className="text-sm text-muted-foreground">
              Quando ativado, a IA poderá enviar mensagens de voz para os clientes
            </p>
          </div>
          <Switch
            checked={settings.ai_voice_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, ai_voice_enabled: checked })}
          />
        </div>

        {/* Voice Selection by Provider */}
        <div className="space-y-6">
          <Label className="text-base font-medium">Escolher Voz</Label>
          
          {/* ElevenLabs Voices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getProviderBadge('elevenlabs').className}>
                ElevenLabs
              </Badge>
              <span className="text-sm text-muted-foreground">Alta qualidade multilíngue</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {voicesByProvider.elevenlabs.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isSelected={settings.ai_voice_id === voice.id}
                  onClick={() => setSettings({ ...settings, ai_voice_id: voice.id })}
                />
              ))}
            </div>
          </div>

          {/* Speaktor Voices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getProviderBadge('speaktor').className}>
                Speaktor
              </Badge>
              <span className="text-sm text-muted-foreground">Vozes brasileiras PT-BR</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {voicesByProvider.speaktor.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isSelected={settings.ai_voice_id === voice.id}
                  onClick={() => setSettings({ ...settings, ai_voice_id: voice.id })}
                />
              ))}
            </div>
          </div>

          {/* OpenAI Voices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getProviderBadge('openai').className}>
                OpenAI
              </Badge>
              <span className="text-sm text-muted-foreground">Fallback</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {voicesByProvider.openai.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isSelected={settings.ai_voice_id === voice.id}
                  onClick={() => setSettings({ ...settings, ai_voice_id: voice.id })}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Voice Preview */}
        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Testar voz selecionada</p>
              <p className="text-sm text-muted-foreground">
                {selectedVoice?.name} - {selectedVoice?.description}
              </p>
            </div>
            <Button
              variant={isPlaying ? "destructive" : "outline"}
              onClick={handleTestVoice}
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isPlaying ? (
                <Square className="h-4 w-4 mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isPlaying ? "Parar" : "Ouvir"}
            </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

// Voice Card Component
interface VoiceCardProps {
  voice: typeof AVAILABLE_VOICES[0];
  isSelected: boolean;
  onClick: () => void;
}

function VoiceCard({ voice, isSelected, onClick }: VoiceCardProps) {
  const badge = getProviderBadge(voice.provider);
  
  return (
    <div
      className={`p-3 border rounded-lg cursor-pointer transition-all ${
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:border-primary/50"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm">{voice.name}</span>
        <Badge variant={voice.gender === "female" ? "default" : "secondary"} className="text-xs">
          {voice.gender === "female" ? "F" : "M"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1">{voice.description}</p>
    </div>
  );
}
