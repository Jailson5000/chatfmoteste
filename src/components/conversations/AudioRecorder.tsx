import { useState } from "react";
import { Mic, Square, X, Send, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function AudioRecorder({ onSend, onCancel, disabled }: AudioRecorderProps) {
  const {
    isRecording,
    recordingTime,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    clearRecording,
  } = useAudioRecorder();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      console.error("Erro ao iniciar gravação:", error);
    }
  };

  const handlePlayPause = () => {
    if (!audioUrl) return;
    
    if (isPlaying && audioElement) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setAudioElement(audio);
      setIsPlaying(true);
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
      clearRecording();
    }
  };

  const handleCancel = () => {
    cancelRecording();
    onCancel();
  };

  // Recording state - show recording UI
  if (isRecording) {
    return (
      <div className="flex items-center gap-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 animate-fade-in">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-600"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-2 flex-1">
          <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-red-600">
            {formatTime(recordingTime)}
          </span>
          <div className="flex-1 h-1 bg-red-200 dark:bg-red-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-500 rounded-full animate-pulse"
              style={{ width: `${Math.min((recordingTime / 120) * 100, 100)}%` }}
            />
          </div>
        </div>
        
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8 bg-red-600 hover:bg-red-700"
          onClick={stopRecording}
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Preview state - show recorded audio with send/cancel
  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-3 p-2 bg-primary/10 rounded-lg border border-primary/20 animate-fade-in">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handlePlayPause}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        
        <div className="flex-1">
          <audio src={audioUrl} className="hidden" />
          <div className="flex items-center gap-2">
            <div className="flex-1 h-8 bg-muted rounded flex items-center px-2">
              <div className="flex gap-0.5 items-end h-4">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1 bg-primary/60 rounded-full",
                      isPlaying && "animate-pulse"
                    )}
                    style={{ 
                      height: `${Math.random() * 100}%`,
                      animationDelay: `${i * 50}ms`
                    }}
                  />
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground min-w-[40px]">
              {formatTime(recordingTime)}
            </span>
          </div>
        </div>
        
        <Button
          size="icon"
          className="h-8 w-8"
          onClick={handleSend}
          disabled={disabled}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Default state - show record button
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-primary"
      onClick={handleStartRecording}
      disabled={disabled}
      title="Gravar áudio"
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
