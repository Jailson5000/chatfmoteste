import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Volume2, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import { supabase } from "@/integrations/supabase/client";

// Available voices with descriptions
const AVAILABLE_VOICES = [
  { id: "camila", name: "Camila", gender: "female", description: "Voz feminina brasileira, profissional e acolhedora" },
  { id: "nova", name: "Nova", gender: "female", description: "Voz feminina suave e elegante" },
  { id: "onyx", name: "Onyx", gender: "male", description: "Voz masculina grave e profissional" },
  { id: "echo", name: "Echo", gender: "male", description: "Voz masculina clara e amigável" },
] as const;

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
    ai_voice_id: "camila",
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
            ai_voice_id: data.ai_voice_id || "camila",
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
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-text-to-speech`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            text: testText,
            voiceId: settings.ai_voice_id,
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

        {/* Voice Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Escolher Voz</Label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AVAILABLE_VOICES.map((voice) => (
              <div
                key={voice.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  settings.ai_voice_id === voice.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-primary/50"
                }`}
                onClick={() => setSettings({ ...settings, ai_voice_id: voice.id })}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{voice.name}</span>
                  <Badge variant={voice.gender === "female" ? "default" : "secondary"}>
                    {voice.gender === "female" ? "Feminina" : "Masculina"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{voice.description}</p>
              </div>
            ))}
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

        {/* Info Note */}
        <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Nota:</strong> As respostas por áudio utilizam tecnologia de síntese de voz da OpenAI. 
            Para funcionar, é necessário ter uma chave API da OpenAI configurada no sistema.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
