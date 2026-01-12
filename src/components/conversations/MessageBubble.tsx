import { Bot, Check, CheckCheck, Clock, FileText, Download, Reply, Play, Pause, Loader2, RotateCcw, AlertCircle, X, Mic, Lock, Zap, FileAudio, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderWithLinks } from "@/lib/linkify";
import { useState, useRef, ReactNode, useEffect, useCallback, memo, useReducer } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuotedMessage } from "./ReplyPreview";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAudio, setCachedAudio, cleanupOldCache } from "@/lib/audioCache";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "error";

interface MessageBubbleProps {
  id: string;
  content: string | null;
  createdAt: string;
  isFromMe: boolean;
  senderType: string;
  aiGenerated: boolean;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  messageType?: string;
  status?: MessageStatus;
  readAt?: string | null;
  whatsappMessageId?: string | null;
  conversationId?: string;
  isInternal?: boolean;
  isPontual?: boolean;
  aiAgentName?: string | null; // Name of the AI agent that sent this message
  replyTo?: {
    id: string;
    content: string | null;
    is_from_me: boolean;
  } | null;
  onReply?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  onRetry?: (messageId: string, content: string) => void;
  highlightText?: (text: string) => ReactNode;
  isHighlighted?: boolean;
}

// Simple in-memory cache for decrypted media (session-level)
const memoryCache = new Map<string, string>();

// Check if URL is encrypted WhatsApp media
function isEncryptedMedia(url: string): boolean {
  return url.includes(".enc") || url.includes("mmg.whatsapp.net");
}

// Playback speed options
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Transcription cache
const transcriptionCache = new Map<string, string>();

// Custom audio player component with decryption support, progress bar, speed control, and transcription
function AudioPlayer({ 
  src, 
  mimeType,
  whatsappMessageId,
  conversationId,
  isFromMe,
}: { 
  src: string; 
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
  isFromMe?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedSrc, setDecryptedSrc] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // Transcription state
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);

  // Check if needs decryption
  const needsDecryption = src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

  // Decrypt audio on mount if needed - check IndexedDB first, then memory cache, then fetch
  useEffect(() => {
    if (!needsDecryption) return;
    
    const loadAudio = async () => {
      // Check memory cache first (fastest)
      const memoryCached = memoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }

      // Check IndexedDB cache (persistent)
      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        memoryCache.set(whatsappMessageId!, dbCached); // Also cache in memory
        setDecryptedSrc(dbCached);
        return;
      }

      // Need to fetch from API
      setIsDecrypting(true);
      try {
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "get_media",
            conversationId,
            whatsappMessageId,
          },
        });

        if (response.error || !response.data?.success || !response.data?.base64) {
          console.error("Failed to decrypt audio:", response.error || response.data?.error);
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "audio/ogg";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
        
        // Cache in both memory and IndexedDB
        memoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);
        
        setDecryptedSrc(dataUrl);
      } catch (err) {
        console.error("Error decrypting audio:", err);
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    loadAudio();
    
    // Cleanup old cache entries periodically
    cleanupOldCache();
  }, [needsDecryption, whatsappMessageId, conversationId, mimeType]);

  // Check for cached transcription
  useEffect(() => {
    if (whatsappMessageId) {
      const cached = transcriptionCache.get(whatsappMessageId);
      if (cached) {
        setTranscription(cached);
      }
    }
  }, [whatsappMessageId]);

  // Use decrypted source or original
  const audioSrc = needsDecryption ? decryptedSrc : src;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      // Only set error if we're not still decrypting
      if (!isDecrypting && audioSrc) {
        setError(true);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [isDecrypting, audioSrc]);

  // Update playback rate when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setError(true));
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const cycleSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    setPlaybackSpeed(SPEED_OPTIONS[nextIndex]);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleTranscribe = async () => {
    if (isTranscribing || !audioSrc) return;

    // Check cache first
    if (whatsappMessageId && transcriptionCache.has(whatsappMessageId)) {
      setTranscription(transcriptionCache.get(whatsappMessageId)!);
      setShowTranscription(true);
      return;
    }

    setIsTranscribing(true);
    try {
      // Get base64 from audio source
      let audioBase64: string;
      
      if (audioSrc.startsWith('data:')) {
        // Already base64
        audioBase64 = audioSrc.split(',')[1];
      } else {
        // Fetch and convert
        const response = await fetch(audioSrc);
        const blob = await response.blob();
        const reader = new FileReader();
        audioBase64 = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const response = await supabase.functions.invoke("transcribe-audio", {
        body: {
          audioBase64,
          mimeType: mimeType || "audio/ogg",
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.transcription) {
        const text = response.data.transcription;
        setTranscription(text);
        setShowTranscription(true);
        
        // Cache the transcription
        if (whatsappMessageId) {
          transcriptionCache.set(whatsappMessageId, text);
        }
      } else if (response.data?.error) {
        throw new Error(response.data.error);
      }
    } catch (err) {
      console.error("Error transcribing audio:", err);
      setTranscription("Erro ao transcrever áudio");
      setShowTranscription(true);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Calculate progress percentage for visual bar
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isDecrypting) {
    return (
      <div className="flex items-center gap-3 w-full min-w-0 max-w-[320px] p-3 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 animate-in fade-in duration-300">
        <div className="relative h-12 w-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
          <Mic className="h-5 w-5 text-primary/60 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 bg-muted/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary/60 via-primary/40 to-primary/60 rounded-full animate-shimmer"
                style={{ backgroundSize: "200% 100%" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
            <span className="text-xs text-primary/70 font-medium">Descriptografando áudio...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!audioSrc && needsDecryption)) {
    return (
      <div className="flex items-center gap-3 w-full min-w-0 max-w-[320px] p-2 rounded-xl bg-destructive/10">
        <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <X className="h-5 w-5 text-destructive" />
        </div>
        <span className="text-xs text-destructive">Áudio não disponível</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={cn(
        "flex items-center gap-3 w-full min-w-0 max-w-[320px] p-2 rounded-xl transition-all",
        isFromMe ? "bg-primary-foreground/10" : "bg-background/30"
      )}>
        {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
        
        {/* Mic icon indicator */}
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          isPlaying 
            ? "bg-primary text-primary-foreground" 
            : isFromMe ? "bg-primary/30" : "bg-muted"
        )}>
          <Mic className="h-5 w-5" />
        </div>
        
        {/* Play button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full flex-shrink-0 hover:scale-110 transition-transform"
          onClick={togglePlay}
          disabled={!audioSrc}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>
        
        {/* Progress section */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Waveform visualization */}
          <div 
            className="relative h-8 flex items-center gap-[2px] cursor-pointer group"
            onClick={(e) => {
              if (!audioSrc || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const percentage = clickX / rect.width;
              const newTime = percentage * duration;
              handleSeek([newTime]);
            }}
          >
            {/* Waveform bars */}
            {Array.from({ length: 40 }).map((_, i) => {
              const barProgress = (i + 1) / 40;
              const isPlayed = progressPercent / 100 >= barProgress;
              // Generate pseudo-random heights based on index for consistent waveform
              const seed = (i * 7 + 13) % 17;
              const height = 20 + (seed / 17) * 80; // 20% to 100% height
              
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-full transition-all duration-150",
                    isPlayed 
                      ? "bg-primary" 
                      : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                    isPlaying && isPlayed && "animate-pulse"
                  )}
                  style={{ 
                    height: `${height}%`,
                    opacity: isPlayed ? 1 : 0.6
                  }}
                />
              );
            })}
            
            {/* Progress indicator line */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-lg transition-all duration-100 z-10"
              style={{ left: `${progressPercent}%` }}
            >
              <div className={cn(
                "absolute -top-0.5 -bottom-0.5 -left-1 w-2.5 rounded-full bg-primary/20",
                isPlaying && "animate-pulse"
              )} />
            </div>
          </div>
          
          {/* Time and speed controls */}
          <div className="flex justify-between items-center">
            <span className="text-xs opacity-70 tabular-nums">{formatTime(currentTime)}</span>
            <div className="flex items-center gap-1">
              {/* Speed dropdown selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5",
                      "hover:bg-primary/20 active:scale-95",
                      playbackSpeed !== 1 ? "text-primary bg-primary/10" : "opacity-70"
                    )}
                    title="Velocidade de reprodução"
                  >
                    {playbackSpeed}x
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="min-w-[60px]">
                  {SPEED_OPTIONS.map((speed) => (
                    <DropdownMenuItem
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={cn(
                        "justify-center text-xs cursor-pointer",
                        playbackSpeed === speed && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      {speed}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 rounded transition-colors",
                  transcription ? "text-primary" : "opacity-70 hover:opacity-100"
                )}
                onClick={handleTranscribe}
                disabled={isTranscribing || !audioSrc}
                title="Transcrever áudio"
              >
                {isTranscribing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileAudio className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <span className="text-xs opacity-70 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Transcription display */}
      {showTranscription && transcription && (
        <div className={cn(
          "p-2 rounded-lg text-xs leading-relaxed w-full min-w-0 max-w-[320px] animate-in fade-in slide-in-from-top-1 duration-200",
          isFromMe ? "bg-primary-foreground/10" : "bg-background/30"
        )}>
          <div className="flex items-center gap-1 mb-1 text-muted-foreground">
            <FileAudio className="h-3 w-3" />
            <span className="font-medium">Transcrição:</span>
            <button 
              onClick={() => setShowTranscription(false)}
              className="ml-auto hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="whitespace-pre-wrap">{transcription}</p>
        </div>
      )}
    </div>
  );
}

// AI Audio Player - fetches audio via Evolution API for AI-sent messages without media_url
function AIAudioPlayer({ 
  whatsappMessageId,
  conversationId,
  isFromMe,
}: { 
  whatsappMessageId: string;
  conversationId: string;
  isFromMe?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const loadAudio = useCallback(async () => {
    if (audioSrc) return; // Already loaded
    
    // Check memory cache first
    const memoryCached = memoryCache.get(whatsappMessageId);
    if (memoryCached) {
      setAudioSrc(memoryCached);
      return;
    }

    // Check IndexedDB cache
    const dbCached = await getCachedAudio(whatsappMessageId);
    if (dbCached) {
      memoryCache.set(whatsappMessageId, dbCached);
      setAudioSrc(dbCached);
      return;
    }

    // Fetch from Evolution API
    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId,
          whatsappMessageId,
        },
      });

      if (response.error || !response.data?.success || !response.data?.base64) {
        console.error("Failed to fetch AI audio:", response.error || response.data?.error);
        setError(true);
        return;
      }

      const mimeType = response.data.mimetype || "audio/mpeg";
      const dataUrl = `data:${mimeType};base64,${response.data.base64}`;
      
      // Cache it
      memoryCache.set(whatsappMessageId, dataUrl);
      await setCachedAudio(whatsappMessageId, dataUrl);
      
      setAudioSrc(dataUrl);
    } catch (err) {
      console.error("Error fetching AI audio:", err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [whatsappMessageId, conversationId, audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      if (audioSrc) setError(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioSrc]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const handlePlayPause = async () => {
    if (!audioSrc) {
      await loadAudio();
    }
    
    const audio = audioRef.current;
    if (!audio) return;

    // Wait for audio src to be set
    if (!audioSrc) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setError(true));
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10">
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-destructive/20">
          <X className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-destructive">Áudio não disponível</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-3 w-full min-w-0 max-w-[320px] p-2 rounded-xl transition-all",
      isFromMe ? "bg-primary-foreground/10" : "bg-background/30"
    )}>
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
      
      {/* Mic icon indicator */}
      <div className={cn(
        "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
        isPlaying 
          ? "bg-primary text-primary-foreground" 
          : isFromMe ? "bg-primary/30" : "bg-muted"
      )}>
        <Mic className="h-5 w-5" />
      </div>
      
      {/* Play button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full flex-shrink-0 hover:scale-110 transition-transform"
        onClick={handlePlayPause}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>
      
      {/* Progress section */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Waveform visualization */}
        <div 
          className="relative h-8 flex items-center gap-[2px] cursor-pointer group"
          onClick={(e) => {
            if (!audioSrc || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;
            const newTime = percentage * duration;
            handleSeek([newTime]);
          }}
        >
          {/* Waveform bars */}
          {Array.from({ length: 40 }).map((_, i) => {
            const barProgress = (i + 1) / 40;
            const isPlayed = progressPercent / 100 >= barProgress;
            const seed = (i * 7 + 13) % 17;
            const height = 20 + (seed / 17) * 80;
            
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-all duration-150",
                  isPlayed 
                    ? "bg-primary" 
                    : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                  isPlaying && isPlayed && "animate-pulse"
                )}
                style={{ 
                  height: `${height}%`,
                  opacity: isPlayed ? 1 : 0.6
                }}
              />
            );
          })}
          
          {/* Progress indicator line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-lg transition-all duration-100 z-10"
            style={{ left: `${progressPercent}%` }}
          >
            <div className={cn(
              "absolute -top-0.5 -bottom-0.5 -left-1 w-2.5 rounded-full bg-primary/20",
              isPlaying && "animate-pulse"
            )} />
          </div>
        </div>
        
        {/* Time and speed controls */}
        <div className="flex justify-between items-center">
          <span className="text-xs opacity-70 tabular-nums">{formatTime(currentTime)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5",
                  "hover:bg-primary/20 active:scale-95",
                  playbackSpeed !== 1 ? "text-primary bg-primary/10" : "opacity-70"
                )}
                title="Velocidade de reprodução"
              >
                {playbackSpeed}x
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[60px]">
              {SPEED_OPTIONS.map((speed) => (
                <DropdownMenuItem
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={cn(
                    "justify-center text-xs cursor-pointer",
                    playbackSpeed === speed && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  {speed}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs opacity-70 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

// Custom image component with decryption support
function ImageViewer({ 
  src, 
  mimeType,
  whatsappMessageId,
  conversationId,
}: { 
  src: string; 
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
}) {
  const [error, setError] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedSrc, setDecryptedSrc] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  // Check if needs to fetch from API:
  // 1. Encrypted WhatsApp media
  // 2. No src provided but we have whatsappMessageId (sent images without stored URL)
  const needsDecryption = whatsappMessageId && conversationId && (
    !src || // No source URL - need to fetch from API
    isEncryptedMedia(src) || // Encrypted media
    src.startsWith("blob:") // Blob URLs expire - need to fetch real URL
  );

  // Decrypt/fetch image on mount if needed
  useEffect(() => {
    if (!needsDecryption) return;
    
    const loadImage = async () => {
      // Check memory cache first
      const memoryCached = memoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }

      // Check IndexedDB cache
      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        memoryCache.set(whatsappMessageId!, dbCached);
        setDecryptedSrc(dbCached);
        return;
      }

      // Fetch from API
      setIsDecrypting(true);
      try {
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "get_media",
            conversationId,
            whatsappMessageId,
          },
        });

        if (response.error || !response.data?.success || !response.data?.base64) {
          console.error("Failed to fetch image:", response.error || response.data?.error);
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "image/jpeg";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
        
        // Cache in both memory and IndexedDB
        memoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);
        
        setDecryptedSrc(dataUrl);
      } catch (err) {
        console.error("Error fetching image:", err);
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    loadImage();
  }, [needsDecryption, whatsappMessageId, conversationId, mimeType]);

  const imageSrc = needsDecryption ? decryptedSrc : src;

  if (isDecrypting) {
    return (
      <div className="relative min-w-[200px] min-h-[150px] max-w-[240px] rounded-xl overflow-hidden bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50 animate-in fade-in duration-300">
        {/* Shimmer effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" 
             style={{ backgroundSize: '200% 100%' }} />
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <svg className="h-7 w-7 text-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            </div>
          </div>
          <div className="text-center">
            <span className="text-xs font-medium text-foreground/70">Carregando...</span>
            <div className="flex items-center justify-center gap-1 mt-1">
              <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!imageSrc && needsDecryption)) {
    return (
      <div className="flex items-center justify-center min-w-[200px] min-h-[150px] bg-destructive/10 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <X className="h-6 w-6 text-destructive" />
          <span className="text-xs text-destructive">Imagem não disponível</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div 
        className="max-w-[240px] max-h-[240px] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-muted/30"
        onClick={() => setImageOpen(true)}
      >
        <img
          src={imageSrc || src}
          alt="Imagem"
          className="max-w-full max-h-[240px] object-contain"
          onError={() => setError(true)}
        />
      </div>
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-w-4xl p-0 bg-transparent border-none">
          <img
            src={imageSrc || src}
            alt="Imagem ampliada"
            className="w-full h-auto rounded-lg"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoPlayer({ 
  src, 
  mimeType,
  whatsappMessageId,
  conversationId,
}: { 
  src: string; 
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
}) {
  const [error, setError] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedSrc, setDecryptedSrc] = useState<string | null>(null);

  // Check if needs decryption
  const needsDecryption = src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

  // Decrypt video on mount if needed
  useEffect(() => {
    if (!needsDecryption) return;
    
    const loadVideo = async () => {
      // Check memory cache first
      const memoryCached = memoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }

      // Check IndexedDB cache
      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        memoryCache.set(whatsappMessageId!, dbCached);
        setDecryptedSrc(dbCached);
        return;
      }

      // Fetch from API
      setIsDecrypting(true);
      try {
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "get_media",
            conversationId,
            whatsappMessageId,
          },
        });

        if (response.error || !response.data?.success || !response.data?.base64) {
          console.error("Failed to decrypt video:", response.error || response.data?.error);
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "video/mp4";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
        
        // Cache in both memory and IndexedDB
        memoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);
        
        setDecryptedSrc(dataUrl);
      } catch (err) {
        console.error("Error decrypting video:", err);
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    loadVideo();
  }, [needsDecryption, whatsappMessageId, conversationId, mimeType]);

  const videoSrc = needsDecryption ? decryptedSrc : src;

  if (isDecrypting) {
    return (
      <div className="relative w-full min-w-0 max-w-[280px] min-h-[140px] rounded-xl overflow-hidden bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50 animate-in fade-in duration-300">
        {/* Shimmer effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" 
             style={{ backgroundSize: '200% 100%' }} />
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Play className="h-8 w-8 text-primary/60 ml-1" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border-2 border-primary/30 flex items-center justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            </div>
          </div>
          <div className="text-center">
            <span className="text-xs font-medium text-foreground/70">Descriptografando vídeo...</span>
            <div className="flex items-center justify-center gap-1 mt-1">
              <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!videoSrc && needsDecryption)) {
    return (
      <div className="flex items-center justify-center w-full min-w-0 max-w-[280px] min-h-[120px] bg-muted/50 rounded-lg">
        <span className="text-xs opacity-70">Vídeo não disponível</span>
      </div>
    );
  }

  return (
    <video
      controls
      className="w-full min-w-0 max-w-[280px] max-h-[200px] rounded-lg"
      preload="metadata"
    >
      <source src={videoSrc || src} type={mimeType || "video/mp4"} />
      Seu navegador não suporta vídeo.
    </video>
  );
}

// Document viewer component with decryption support for .enc files
function DocumentViewer({ 
  src, 
  mimeType,
  whatsappMessageId,
  conversationId,
  isFromMe,
  content,
}: { 
  src: string; 
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
  isFromMe?: boolean;
  content?: string | null;
}) {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState(false);

  // Check if needs decryption
  const needsDecryption = src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

  // Extract display name from content or URL
  const getDisplayName = () => {
    const rawLastSegment = src.split("/").pop() || "Documento";
    const withoutQuery = rawLastSegment.split("?")[0] || rawLastSegment;

    let urlFileName = withoutQuery;
    try {
      urlFileName = decodeURIComponent(withoutQuery);
    } catch {
      // ignore
    }

    const contentCandidate = content?.trim();
    const looksLikeFileName = (v?: string | null) =>
      !!v &&
      v.length <= 160 &&
      !v.includes("\n") &&
      /\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|webp|mp3|wav|mp4)$/i.test(v);

    const urlLooksEncrypted =
      urlFileName.length > 80 ||
      /\.enc$/i.test(urlFileName) ||
      /_n\.enc/i.test(urlFileName) ||
      /[A-Za-z0-9_-]{40,}/.test(urlFileName);

    if (looksLikeFileName(contentCandidate)) {
      return contentCandidate as string;
    }
    return urlLooksEncrypted ? "Documento" : urlFileName;
  };

  const displayName = getDisplayName();

  // Get file extension for download
  const getFileExtension = () => {
    // Try to get from content first
    const contentCandidate = content?.trim();
    if (contentCandidate) {
      const match = contentCandidate.match(/\.(pdf|doc|docx|xls|xlsx)$/i);
      if (match) return match[0].toLowerCase();
    }
    // Fallback to mimeType
    if (mimeType?.includes("pdf")) return ".pdf";
    if (mimeType?.includes("word") || mimeType?.includes("doc")) return ".docx";
    if (mimeType?.includes("sheet") || mimeType?.includes("excel")) return ".xlsx";
    return ".pdf"; // Default to PDF
  };

  const handleDownload = async () => {
    if (!needsDecryption) {
      // Direct download for non-encrypted files
      window.open(src, "_blank");
      return;
    }

    // Need to decrypt first
    setIsDecrypting(true);
    setError(false);

    try {
      // Check memory cache first
      const memoryCached = memoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        downloadDataUrl(memoryCached);
        return;
      }

      // Check IndexedDB cache
      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        memoryCache.set(whatsappMessageId!, dbCached);
        downloadDataUrl(dbCached);
        return;
      }

      // Fetch from API
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId,
          whatsappMessageId,
        },
      });

      if (response.error || !response.data?.success || !response.data?.base64) {
        console.error("Failed to decrypt document:", response.error || response.data?.error);
        setError(true);
        return;
      }

      const actualMimeType = response.data.mimetype || mimeType || "application/pdf";
      const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
      
      // Cache in both memory and IndexedDB
      memoryCache.set(whatsappMessageId!, dataUrl);
      await setCachedAudio(whatsappMessageId!, dataUrl);
      
      downloadDataUrl(dataUrl);
    } catch (err) {
      console.error("Error decrypting document:", err);
      setError(true);
    } finally {
      setIsDecrypting(false);
    }
  };

  const downloadDataUrl = (dataUrl: string) => {
    // Convert data URL to blob and download
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const docMimeType = mimeMatch ? mimeMatch[1] : "application/pdf";
    
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: docMimeType });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    
    // Use display name or generate filename with proper extension
    let fileName = displayName;
    if (fileName === "Documento" || !fileName.includes(".")) {
      fileName = `documento${getFileExtension()}`;
    }
    a.download = fileName;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isDecrypting) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-2 rounded-lg w-full",
        isFromMe
          ? "bg-primary-foreground/10"
          : "bg-muted-foreground/10"
      )}>
        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium break-all line-clamp-2">{displayName}</p>
          <p className="text-xs opacity-70">Baixando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-2 rounded-lg w-full",
        "bg-destructive/10"
      )}>
        <div className="h-8 w-8 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <X className="h-4 w-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">Documento não disponível</p>
          <button 
            onClick={handleDownload} 
            className="text-xs text-destructive/70 hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleDownload}
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg transition-colors w-full text-left",
        isFromMe
          ? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
          : "bg-muted-foreground/10 hover:bg-muted-foreground/20"
      )}
    >
      <FileText className="h-8 w-8 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium break-all line-clamp-2">{displayName}</p>
        <p className="text-xs opacity-70">Clique para baixar</p>
      </div>
      <Download className="h-4 w-4 flex-shrink-0" />
    </button>
  );
}

export function MessageBubble({
  id,
  content,
  createdAt,
  isFromMe,
  aiGenerated,
  mediaUrl,
  mediaMimeType,
  messageType,
  status = "sent",
  readAt,
  whatsappMessageId,
  conversationId,
  replyTo,
  isInternal = false,
  isPontual = false,
  aiAgentName,
  onReply,
  onScrollToMessage,
  onRetry,
  highlightText,
  isHighlighted = false,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [, bumpDeliveryRender] = useReducer((x: number) => x + 1, 0);

  // Ensure the "assume delivered after 3s" fallback updates even when this bubble is memoized
  useEffect(() => {
    if (!isFromMe) return;
    if (isInternal) return;
    if (!whatsappMessageId) return;
    if (readAt || status === "read" || status === "delivered" || status === "sending" || status === "error") return;

    const createdMs = new Date(createdAt).getTime();
    if (!Number.isFinite(createdMs)) return;

    const remainingMs = createdMs + 2000 - Date.now();
    if (remainingMs <= 0) return;

    const t = window.setTimeout(() => bumpDeliveryRender(), remainingMs);
    return () => window.clearTimeout(t);
  }, [isFromMe, isInternal, whatsappMessageId, readAt, status, createdAt, bumpDeliveryRender]);

  // Determine actual status based on read_at if available
  const actualStatus: MessageStatus = (() => {
    if (!isFromMe) return status;
    if (readAt || status === "read") return "read";
    if (status === "sending" || status === "error") return status;
    if (status === "delivered") return "delivered";

    // Fallback (WhatsApp-like): if no delivery ACK arrived, assume delivered after 3s
    // (only for external outgoing messages that have a WhatsApp id)
    const createdMs = new Date(createdAt).getTime();
    const assumeDelivered =
      !isInternal &&
      !!whatsappMessageId &&
      Number.isFinite(createdMs) &&
      Date.now() - createdMs > 2000;

    return assumeDelivered ? "delivered" : "sent";
  })();

  const renderStatusIcon = () => {
    if (!isFromMe) return null;

    // Use inherited color from parent div (which has proper theme-aware colors)
    const iconClass = "h-3.5 w-3.5";
    
    switch (actualStatus) {
      case "sending":
        return (
          <div className="flex items-center">
            <Loader2 className={cn(iconClass, "animate-spin")} />
          </div>
        );
      case "sent":
        // 1 tick - message sent to server
        return <Check className={iconClass} />;
      case "delivered":
        // 2 gray ticks - message delivered to recipient
        return <CheckCheck className={iconClass} />;
      case "read":
        // 2 blue ticks - message read by recipient
        return <CheckCheck className={cn(iconClass, "text-blue-600 dark:text-blue-400")} />;
      case "error":
        return (
          <button
            onClick={() => onRetry?.(id, content || "")}
            className="flex items-center gap-0.5 text-destructive hover:text-destructive/80 transition-colors cursor-pointer group"
            title="Erro ao enviar - clique para reenviar"
          >
            <X className="h-3.5 w-3.5" />
            <RotateCcw className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      default:
        // Default to delivered (2 checks) if no status is specified
        return <CheckCheck className={iconClass} />;
    }
  };

  const renderMedia = () => {
    if (!mediaUrl) return null;

    const isImage = mediaMimeType?.startsWith("image/") || messageType === "image";
    const isAudio = mediaMimeType?.startsWith("audio/") || messageType === "audio" || messageType === "ptt";
    const isVideo = mediaMimeType?.startsWith("video/") || messageType === "video";
    const isDocument = messageType === "document" || (!isImage && !isAudio && !isVideo && mediaUrl);

    if (isImage) {
      return (
        <ImageViewer 
          src={mediaUrl} 
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
        />
      );
    }

    if (isAudio) {
      return (
        <AudioPlayer 
          src={mediaUrl} 
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
          isFromMe={isFromMe}
        />
      );
    }

    if (isVideo) {
      return (
        <VideoPlayer 
          src={mediaUrl} 
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
        />
      );
    }

    if (isDocument) {
      return (
        <DocumentViewer
          src={mediaUrl}
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
          isFromMe={isFromMe}
          content={content}
        />
      );
    }

    return null;
  };

  const hasMedia = mediaUrl && (
    mediaMimeType?.startsWith("image/") ||
    mediaMimeType?.startsWith("audio/") ||
    mediaMimeType?.startsWith("video/") ||
    messageType === "image" ||
    messageType === "audio" ||
    messageType === "video" ||
    messageType === "ptt" ||
    messageType === "document"
  );

  const displayContent = (() => {
    if (!content) return "";

    // Strip the WhatsApp placeholder used for AI audio messages, even when it comes
    // appended to a normal text message (common on mobile due to line wrapping).
    const withoutPlaceholder = content
      .replace(/\[\s*mensagem de [áa]udio\s*\]/gi, "")
      .replace(/\r\n/g, "\n");

    const normalized = withoutPlaceholder
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // For document messages, WhatsApp often sets the content as just the filename.
    // We already render the filename in the document card, so avoid duplicating it.
    if (messageType === "document") {
      const singleLine = !normalized.includes("\n");
      const looksLikeFileName =
        singleLine && /\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|webp|mp3|wav|mp4)$/i.test(normalized);

      if (looksLikeFileName) return "";
    }

    return normalized;
  })();

  return (
    <div
      className={cn(
        "flex w-full min-w-0 group animate-fade-in",
        isFromMe ? "justify-end" : "justify-start"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Reply button for outgoing messages */}
      {isFromMe && showActions && onReply && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mr-1 opacity-0 group-hover:opacity-100 transition-opacity self-center"
          onClick={() => onReply(id)}
        >
          <Reply className="h-4 w-4" />
        </Button>
      )}
      
      <div
        className={cn(
          "max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 transition-all",
          "break-words [overflow-wrap:anywhere] [word-break:break-word] [hyphens:auto]",
          isInternal
            ? "bg-yellow-100 text-yellow-900 rounded-br-md dark:bg-yellow-900/40 dark:text-yellow-100 border border-yellow-300 dark:border-yellow-700"
            : isFromMe
              ? aiGenerated
                ? "bg-purple-100 text-purple-900 rounded-br-md dark:bg-purple-900/30 dark:text-purple-100"
                : status === "error"
                  ? "bg-red-100 text-red-900 rounded-br-md dark:bg-red-900/30 dark:text-red-100 border border-red-300 dark:border-red-700"
                  : "bg-green-100 text-green-900 rounded-br-md dark:bg-green-900/30 dark:text-green-100"
              : "bg-muted rounded-bl-md",
          isHighlighted && "ring-2 ring-yellow-400 ring-offset-2"
        )}
      >
        {/* Quoted message if replying */}
        {replyTo && (
          <QuotedMessage
            content={replyTo.content}
            isFromMe={replyTo.is_from_me}
            onClick={() => onScrollToMessage?.(replyTo.id)}
          />
        )}
        
        {isInternal && (
          <div className="flex items-center gap-1 text-xs text-yellow-700 mb-1 dark:text-yellow-300">
            <Lock className="h-3 w-3" />
            Interno
          </div>
        )}
        
        {isPontual && isFromMe && !isInternal && !aiGenerated && (
          <div className="flex items-center gap-1 text-xs text-amber-600 mb-1 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            Intervenção pontual
          </div>
        )}
        
        {aiGenerated && isFromMe && !isInternal && (
          <div className="flex items-center gap-1 text-xs text-purple-600 mb-1 dark:text-purple-400">
            <Bot className="h-3 w-3" />
            {aiAgentName || "Assistente IA"}
          </div>
        )}
        
        {/* Render media content */}
        {hasMedia && (
          <div className="mb-2">
            {renderMedia()}
          </div>
        )}
        
        {/* Render text content with linkified URLs */}
        {displayContent && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
            {highlightText ? highlightText(displayContent) : renderWithLinks(displayContent)}
          </p>
        )}
        {/* Show audio player for AI-sent audio without URL - fetch via WhatsApp message ID */}
        {!hasMedia && messageType === "audio" && whatsappMessageId && conversationId && (
          <AIAudioPlayer 
            whatsappMessageId={whatsappMessageId}
            conversationId={conversationId}
            isFromMe={isFromMe}
          />
        )}

        {/* Show placeholder for audio without whatsappMessageId */}
        {!hasMedia && messageType === "audio" && !whatsappMessageId && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary-foreground/10">
            <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/20">
              <Mic className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Mensagem de áudio</p>
              <p className="text-xs text-muted-foreground">Áudio enviado via WhatsApp</p>
            </div>
          </div>
        )}

        {/* Show placeholder for other media without preview */}
        {!hasMedia && !content && messageType !== "audio" && (
          <p className="text-sm leading-relaxed text-muted-foreground italic">
            {messageType === "image" ? "📷 Imagem" : "📎 Mídia"}
          </p>
        )}
        
        <div className={cn(
          "flex items-center justify-end gap-1 mt-1",
          isInternal
            ? "text-yellow-700/80 dark:text-yellow-300/80"
            : isFromMe
              ? aiGenerated
                ? "text-purple-700/80 dark:text-purple-300/80"
                : status === "error"
                  ? "text-red-700/80 dark:text-red-300/80"
                  : "text-green-700/80 dark:text-green-300/80"
              : "text-muted-foreground"
        )}>
          <span className="text-xs">
            {new Date(createdAt).toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          {renderStatusIcon()}
        </div>
      </div>
      
      {/* Reply button for incoming messages */}
      {!isFromMe && showActions && onReply && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-1 opacity-0 group-hover:opacity-100 transition-opacity self-center"
          onClick={() => onReply(id)}
        >
          <Reply className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes (e.g., input typing)
export default memo(MessageBubble);
