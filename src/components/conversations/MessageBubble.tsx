import { Bot, Check, CheckCheck, Clock, FileText, Download, Reply, Play, Pause, Loader2, RotateCcw, AlertCircle, X, Mic, Lock, Zap, FileAudio, ChevronDown, Star, Trash2, MoreVertical, Smile, StickyNote, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderWithLinks } from "@/lib/linkify";
import { useState, useRef, ReactNode, useEffect, useCallback, memo, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { QuotedMessage } from "./ReplyPreview";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAudio, setCachedAudio, cleanupOldCache } from "@/lib/audioCache";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ImageViewerDialog } from "./ImageViewerDialog";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "error" | "failed";

// Common emoji reactions for WhatsApp
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

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
  remoteJid?: string; // For delete action
  isInternal?: boolean;
  isPontual?: boolean;
  aiAgentName?: string | null; // Name of the AI agent that sent this message
  isRevoked?: boolean; // Indicates if the message was deleted by sender
  isStarred?: boolean; // Indicates if message is favorited
  myReaction?: string | null; // Emoji reaction sent by the user on this message
  clientReaction?: string | null; // Emoji reaction sent by the client on our outgoing message
  replyTo?: {
    id: string;
    content: string | null;
    is_from_me: boolean;
  } | null;
  onReply?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  onRetry?: (messageId: string, content: string) => void;
  onToggleStar?: (messageId: string, isStarred: boolean) => void;
  onDelete?: (messageId: string, whatsappMessageId: string, remoteJid: string) => void;
  onDownloadMedia?: (whatsappMessageId: string, conversationId: string, fileName?: string) => void;
  onReact?: (messageId: string, whatsappMessageId: string, remoteJid: string, emoji: string, isFromMe: boolean, currentReaction?: string | null) => void;
  onAddNote?: (messageId: string, content: string) => void;
  highlightText?: (text: string) => ReactNode;
  isHighlighted?: boolean;
}

// Simple in-memory cache for decrypted media (session-level)
const memoryCache = new Map<string, string>();

// Check if URL is encrypted WhatsApp media
function isEncryptedMedia(url: string): boolean {
  return url.includes(".enc") || url.includes("mmg.whatsapp.net");
}

// Check if URL is a public storage URL (doesn't need decryption)
function isPublicStorageUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('/storage/v1/object/public/');
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
  const [blobFailed, setBlobFailed] = useState(false);

  // Check if URL is already directly playable (blob URL, public URL, or data URL)
  const isBlobUrl = src?.startsWith('blob:');
  const isDataUrl = src?.startsWith('data:');
  const isPublicUrl = isPublicStorageUrl(src || '');
  const isDirectlyPlayable = isBlobUrl || isDataUrl || isPublicUrl || (src && !isEncryptedMedia(src));

  // Only need decryption for WhatsApp encrypted media that isn't already playable
  // Also decrypt if blob URL failed (e.g., was revoked)
  const needsDecryption = (blobFailed || !isDirectlyPlayable) && !!whatsappMessageId && !!conversationId;

  // Decrypt audio on mount if needed - check IndexedDB first, then memory cache, then fetch
  useEffect(() => {
    if (!needsDecryption) return;
    let cancelled = false;
    
    const loadAudio = async () => {
      // Check memory cache first (fastest)
      const memoryCached = memoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        if (!cancelled) setDecryptedSrc(memoryCached);
        return;
      }

      // Check IndexedDB cache (persistent)
      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (cancelled) return;
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

        if (cancelled) return;

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
        
        if (!cancelled) setDecryptedSrc(dataUrl);
      } catch (err) {
        console.error("Error decrypting audio:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    };

    loadAudio();
    
    // Cleanup old cache entries periodically
    cleanupOldCache();
    return () => { cancelled = true; };
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
      // If blob URL failed, try to decrypt as fallback
      if (isBlobUrl && !blobFailed) {
        console.log("[AudioPlayer] Blob URL failed, attempting decryption fallback");
        setBlobFailed(true);
        return;
      }
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
            <span className="text-xs text-primary/70 font-medium">
              {isFromMe ? "Enviando áudio..." : "Baixando áudio..."}
            </span>
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

// isPublicStorageUrl is now defined at the top of the file

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

  // CRITICAL FIX: Don't decrypt public URLs (e.g., template media from Supabase Storage)
  // Public URLs can be accessed directly without WhatsApp decryption
  const isPublicUrl = isPublicStorageUrl(src);
  
  // Check if this is an internal chat file (from private bucket)
  const isInternalFile = src.startsWith('internal-chat-files://');
  
  // Only need WhatsApp decryption for encrypted media (not public URLs or internal files)
  const needsDecryption = !isPublicUrl && !isInternalFile && !!whatsappMessageId && !!conversationId;

  // Load internal files via signed URL
  useEffect(() => {
    if (!isInternalFile) return;
    
    const loadInternalImage = async () => {
      const filePath = src.replace('internal-chat-files://', '');
      
      // Check memory cache first
      const cacheKey = `internal-${filePath}`;
      const memoryCached = memoryCache.get(cacheKey);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }
      
      setIsDecrypting(true);
      try {
        const { data, error: signedUrlError } = await supabase.storage
          .from('internal-chat-files')
          .createSignedUrl(filePath, 300); // 5 minutes expiry
        
        if (signedUrlError || !data?.signedUrl) {
          console.error("Failed to get signed URL for internal image:", signedUrlError);
          setError(true);
          return;
        }
        
        // Cache the signed URL
        memoryCache.set(cacheKey, data.signedUrl);
        setDecryptedSrc(data.signedUrl);
      } catch (err) {
        console.error("Error loading internal image:", err);
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };
    
    loadInternalImage();
  }, [isInternalFile, src]);

  // Decrypt/fetch WhatsApp image on mount if needed
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

  // Use decryptedSrc for both WhatsApp decryption AND internal files (signed URLs)
  const imageSrc = (needsDecryption || isInternalFile) ? decryptedSrc : src;

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

  // Show error if: explicit error, or waiting for signed URL/decryption but none provided
  if (error || (!imageSrc && (needsDecryption || isInternalFile))) {
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
      <ImageViewerDialog
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        images={[{ src: imageSrc || src, alt: "Imagem" }]}
        initialIndex={0}
      />
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

  // CRITICAL FIX: Don't decrypt public URLs (e.g., template media from Supabase Storage)
  const isPublicUrl = isPublicStorageUrl(src);
  
  // Only need decryption for WhatsApp encrypted media (not public URLs)
  const needsDecryption = !isPublicUrl && !!whatsappMessageId && !!conversationId;

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

// Contact card viewer for shared vCard contacts
function ContactCardViewer({ content, isFromMe }: { content: string; isFromMe?: boolean }) {
  // Parse content formatted by backend: "📇 Contato: Name\n📞 +55..."
  const lines = content.split('\n');
  const nameLine = lines.find(l => l.includes('Contato:') || l.includes('contatos:'));
  const phoneLine = lines.find(l => l.includes('📞'));
  
  // Handle multiple contacts
  const isMultiple = nameLine?.includes('contatos:');
  
  let name = 'Contato';
  if (isMultiple && nameLine) {
    // Format: "📇 3 contatos: Nome1, Nome2, Nome3"
    name = nameLine.replace(/📇\s*/g, '').trim();
  } else if (nameLine) {
    name = nameLine.replace(/📇\s*Contato:\s*/i, '').trim();
  }
  
  const phone = phoneLine?.replace(/📞\s*/g, '').trim() || '';

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      isFromMe 
        ? "bg-primary-foreground/10 border-primary-foreground/20" 
        : "bg-background/50 border-border/50"
    )}>
      <div className={cn(
        "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
        isFromMe ? "bg-primary-foreground/20" : "bg-primary/20"
      )}>
        <User className={cn(
          "h-5 w-5",
          isFromMe ? "text-primary-foreground" : "text-primary"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        {phone && (
          <p className="text-xs text-muted-foreground">{phone}</p>
        )}
      </div>
    </div>
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

  // CRITICAL FIX: Don't decrypt public URLs (e.g., template media from Supabase Storage)
  const isPublicUrl = isPublicStorageUrl(src);
  
  // Only need decryption for WhatsApp encrypted media (not public URLs)
  const needsDecryption = !isPublicUrl && !!whatsappMessageId && !!conversationId;
  
  // Check if this is an internal chat file (private bucket)
  // Support both new format (internal-chat-files://) and old format (supabase URL with internal-chat-files)
  const isInternalFile = src.startsWith('internal-chat-files://') || 
    src.includes('/internal-chat-files/');

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
    // Handle internal chat files (private bucket) - need signed URL
    if (isInternalFile) {
      setIsDecrypting(true);
      setError(false);
      try {
        let filePath: string;
        
        // Handle new format: internal-chat-files://path
        if (src.startsWith('internal-chat-files://')) {
          filePath = src.replace('internal-chat-files://', '');
        } else {
          // Handle old format: extract path from Supabase URL
          // URL format: .../storage/v1/object/public/internal-chat-files/path or .../storage/v1/object/sign/internal-chat-files/path
          // We need to extract everything after internal-chat-files/
          const match = src.match(/internal-chat-files\/(.+?)(\?|$)/);
          if (match) {
            filePath = decodeURIComponent(match[1]);
          } else {
            console.error('Could not extract file path from URL:', src);
            setError(true);
            return;
          }
        }
        
        // Use download option to get file with Content-Disposition: attachment
        const { data, error: signError } = await supabase.storage
          .from('internal-chat-files')
          .createSignedUrl(filePath, 60, {
            download: displayName // Sets Content-Disposition header with filename
          });
        
        if (signError || !data?.signedUrl) {
          console.error('Failed to create signed URL:', signError);
          setError(true);
          return;
        }
        
        // Fetch the file and trigger download directly
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error('Failed to fetch file');
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = displayName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup blob URL
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (err) {
        console.error('Error downloading internal file:', err);
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
      return;
    }
    
    if (!needsDecryption) {
      // Direct download via blob (prevents opening new tab)
      setIsDecrypting(true);
      setError(false);
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        let fileName = displayName;
        if (fileName === "Documento" || !fileName.includes(".")) {
          fileName = `documento${getFileExtension()}`;
        }
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } catch (dlErr) {
        console.warn("Direct blob download failed, trying get_media fallback:", dlErr);
        // Fallback: try get_media if we have whatsappMessageId
        if (whatsappMessageId && conversationId) {
          try {
            const response = await supabase.functions.invoke("evolution-api", {
              body: { action: "get_media", conversationId, whatsappMessageId },
            });
            if (response.data?.success && response.data?.base64) {
              const actualMimeType = response.data.mimetype || mimeType || "application/pdf";
              const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
              downloadDataUrl(dataUrl);
            } else {
              setError(true);
            }
          } catch {
            setError(true);
          }
        } else {
          // Last resort: open in new tab
          window.open(src, "_blank");
        }
      } finally {
        setIsDecrypting(false);
      }
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

// Sticker viewer component - displays stickers at a smaller size (max 160x160px) like WhatsApp
function StickerViewer({ 
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

  // Check if this is a public URL (e.g., Supabase Storage)
  const isPublicUrl = isPublicStorageUrl(src);
  
  // For WhatsApp stickers, always need decryption unless it's a public URL
  const needsDecryption = !isPublicUrl && !!whatsappMessageId && !!conversationId;

  // Decrypt sticker on mount if needed
  useEffect(() => {
    if (!needsDecryption) return;
    
    const loadSticker = async () => {
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
          console.error("Failed to decrypt sticker:", response.error || response.data?.error);
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "image/webp";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
        
        // Cache in both memory and IndexedDB
        memoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);
        
        setDecryptedSrc(dataUrl);
      } catch (err) {
        console.error("Error decrypting sticker:", err);
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    loadSticker();
  }, [needsDecryption, whatsappMessageId, conversationId, mimeType]);

  const stickerSrc = needsDecryption ? decryptedSrc : src;

  if (isDecrypting) {
    return (
      <div className="flex items-center justify-center w-[120px] h-[120px] rounded-lg bg-muted/30 animate-pulse">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || (!stickerSrc && needsDecryption)) {
    return (
      <div className="flex items-center justify-center w-[120px] h-[120px] rounded-lg bg-muted/30">
        <span className="text-xs text-muted-foreground">Figurinha</span>
      </div>
    );
  }

  return (
    <div className="max-w-[160px] max-h-[160px]">
      <img
        src={stickerSrc || src}
        alt="Figurinha"
        className="max-w-full max-h-[160px] object-contain"
        onError={() => setError(true)}
      />
    </div>
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
  remoteJid,
  replyTo,
  isInternal = false,
  isPontual = false,
  aiAgentName,
  isRevoked = false,
  isStarred = false,
  myReaction,
  clientReaction,
  onReply,
  onScrollToMessage,
  onRetry,
  onToggleStar,
  onDelete,
  onDownloadMedia,
  onReact,
  onAddNote,
  highlightText,
  isHighlighted = false,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
    if (status === "sending" || status === "error" || status === "failed") return status;
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
  
  // Normalize "failed" to "error" for styling purposes
  const displayStatus = actualStatus === "failed" ? "error" : actualStatus;

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
      case "failed":
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
    // Allow fetching media via get_media API for all media types when URL is missing
    const canFetchWithoutUrl =
      !mediaUrl &&
      !!whatsappMessageId &&
      !!conversationId &&
      (messageType === "image" || messageType === "document" || 
       messageType === "audio" || messageType === "video" || messageType === "ptt" ||
       messageType === "sticker");

    const srcForMedia = mediaUrl || "";

    // Sticker detection: explicit type or webp mime type (typical for WhatsApp stickers)
    const isSticker = messageType === "sticker" || (mediaMimeType === "image/webp" && messageType !== "image");
    const isImage = !isSticker && (mediaMimeType?.startsWith("image/") || messageType === "image");
    const isAudio = mediaMimeType?.startsWith("audio/") || messageType === "audio" || messageType === "ptt";
    const isVideo = mediaMimeType?.startsWith("video/") || messageType === "video";
    const isDocument = messageType === "document" || (!isSticker && !isImage && !isAudio && !isVideo && !!mediaUrl);

    // Render stickers as small images (max 160x160px, like WhatsApp)
    if (isSticker && (mediaUrl || canFetchWithoutUrl)) {
      return (
        <StickerViewer
          src={srcForMedia}
          mimeType={mediaMimeType || "image/webp"}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
        />
      );
    }

    if (isImage && (mediaUrl || canFetchWithoutUrl)) {
      return (
        <ImageViewer
          src={srcForMedia}
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
        />
      );
    }

    // Allow audio to render with fallback fetch when URL is missing
    if (isAudio && (mediaUrl || canFetchWithoutUrl)) {
      return (
        <AudioPlayer
          src={srcForMedia}
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
          isFromMe={isFromMe}
        />
      );
    }

    // Allow video to render with fallback fetch when URL is missing
    if (isVideo && (mediaUrl || canFetchWithoutUrl)) {
      return (
        <VideoPlayer
          src={srcForMedia}
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
        />
      );
    }

    if (isDocument && (mediaUrl || canFetchWithoutUrl)) {
      return (
        <DocumentViewer
          src={srcForMedia}
          mimeType={mediaMimeType || undefined}
          whatsappMessageId={whatsappMessageId || undefined}
          conversationId={conversationId}
          isFromMe={isFromMe}
          content={content}
        />
      );
    }

    // Contact card (vCard) - shared contact messages
    if (messageType === 'contact' && content) {
      return <ContactCardViewer content={content} isFromMe={isFromMe} />;
    }

    return null;
  };

  // Also update the outer canFetchWithoutUrl for hasMedia detection
  const canFetchWithoutUrl =
    !mediaUrl &&
    !!whatsappMessageId &&
    !!conversationId &&
    (messageType === "image" || messageType === "document" || 
     messageType === "audio" || messageType === "video" || messageType === "ptt" ||
     messageType === "sticker");

  const hasMedia =
    (!!mediaUrl &&
      (mediaMimeType?.startsWith("image/") ||
        mediaMimeType?.startsWith("audio/") ||
        mediaMimeType?.startsWith("video/") ||
        messageType === "image" ||
        messageType === "audio" ||
        messageType === "video" ||
        messageType === "ptt" ||
        messageType === "document" ||
        messageType === "sticker")) ||
    canFetchWithoutUrl;

  const displayContent = (() => {
    if (!content) return "";

    // Strip the WhatsApp placeholder used for AI audio messages, even when it comes
    // appended to a normal text message (common on mobile due to line wrapping).
    let processed = content
      .replace(/\[\s*mensagem de [áa]udio\s*\]/gi, "")
      .replace(/\[\s*[áaÁA]udio\s*\]/gi, "") // Remove [Áudio], [Audio], [áudio], etc.
      .replace(/\r\n/g, "\n");

    // Remove media patterns [IMAGE]url, [VIDEO]url, [AUDIO]url, [DOCUMENT]url
    // These are already rendered as native media, so don't show the raw link
    processed = processed.replace(/\[?(IMAGE|VIDEO|AUDIO|DOCUMENT)\]?(https?:\/\/[^\s\n]+)/gi, "");

    const normalized = processed
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // For media messages, WhatsApp often sets the content as just a filename.
    // We render the player/preview separately, so avoid duplicating the filename.
    const isSingleLine = !normalized.includes("\n");
    const looksLikeFileName =
      isSingleLine &&
      /\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|webp|mp3|wav|m4a|oga|ogg|webm|mp4|mov)$/i.test(normalized);

    // Audio/PTT: also accept dynamic names like audio_173....webm
    if (messageType === "audio" || messageType === "ptt") {
      const looksLikeAudioFileName =
        isSingleLine &&
        /^(audio(_\d+)?|ptt(_\d+)?)\.(webm|ogg|mp3|m4a|wav|oga)$/i.test(normalized);

      if (looksLikeAudioFileName || looksLikeFileName) return "";
    }

    // Images/videos: hide a pure filename when there's no real caption
    // Also hide system placeholders like "[Imagem]", "[Vídeo]", etc.
    if (messageType === "image" || messageType === "video") {
      if (looksLikeFileName) return "";
      
      // Hide media placeholders when no caption was provided
      const mediaPlaceholders = /^\[(imagem|vídeo|video|imagen|image)\]$/i;
      if (mediaPlaceholders.test(normalized)) return "";
    }

    // Documents: we already render the filename in the document card
    if (messageType === "document") {
      const singleLine = !normalized.includes("\n");
      const looksLikeFileName =
        singleLine && /\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|webp|mp3|wav|mp4)$/i.test(normalized);

      if (looksLikeFileName) return "";
    }

    // Detect [template: X] - will render as card below, suppress text (single or multiline)
    const templateOnlyMatch = normalized.match(/^\[template:\s*(.+)\]$/i);
    if (templateOnlyMatch) return "";
    // Multiline template: suppress entire content since card renders it
    if (/^\[template:\s*.+\]/im.test(normalized)) return "";

    return normalized;
  })();

  // Template card detection
  const rawContent = content || "";
  const templateNameMatchSingle = rawContent.match(/^\[template:\s*(.+)\]$/i);
  const templateNameMatchMulti = rawContent.match(/^\[template:\s*(.+)\]/im);
  const hasOptionsLine = /\[Opç?o?e?s?:\s*.+\|.+\]/i.test(rawContent);
  const isTemplateCard = !!templateNameMatchMulti || hasOptionsLine;
  const templateCardName = templateNameMatchSingle?.[1] || templateNameMatchMulti?.[1];

  // Parse expanded template content into sections
  const parseTemplateContent = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    const body: string[] = [];
    let footer = '';
    const buttons: string[] = [];

    for (const line of lines) {
      const optMatch = line.match(/\[Opç?o?e?s?:\s*(.+)\]/i);
      if (optMatch) {
        buttons.push(...optMatch[1].split('|').map(b => b.trim()).filter(Boolean));
        continue;
      }
      const footerMatch = line.match(/^_(.+)_$/);
      if (footerMatch) {
        footer = footerMatch[1];
        continue;
      }
      // Skip the [template: X] line itself
      if (/^\[template:/i.test(line)) continue;
      body.push(line);
    }
    return { body, footer, buttons };
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-0 group animate-fade-in",
        isFromMe ? "justify-end" : "justify-start"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!menuOpen) setShowActions(false);
      }}
    >
      {/* Actions menu for outgoing messages */}
      {isFromMe && (showActions || menuOpen) && !isRevoked && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 mr-1 transition-opacity self-center",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 z-50 bg-popover">
            {onReply && (
              <DropdownMenuItem onClick={() => onReply(id)}>
                <Reply className="h-4 w-4 mr-2" />
                Responder mensagem
              </DropdownMenuItem>
            )}
            {/* React with emoji - only for messages with whatsappMessageId */}
            {whatsappMessageId && remoteJid && onReact && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Smile className="h-4 w-4 mr-2" />
                  {myReaction ? `Alterar reação (${myReaction})` : "Reagir à mensagem"}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-2 bg-popover">
                  <div className="flex gap-1">
                    {REACTION_EMOJIS.filter(emoji => emoji !== myReaction).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          onReact(id, whatsappMessageId, remoteJid, emoji, isFromMe, myReaction);
                          setMenuOpen(false);
                        }}
                        className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {hasMedia && whatsappMessageId && conversationId && onDownloadMedia && (
              <DropdownMenuItem onClick={() => onDownloadMedia(whatsappMessageId, conversationId)}>
                <Download className="h-4 w-4 mr-2" />
                Baixar
              </DropdownMenuItem>
            )}
            {onToggleStar && (
              <DropdownMenuItem onClick={() => onToggleStar(id, !isStarred)}>
                <Star className={cn("h-4 w-4 mr-2", isStarred && "fill-yellow-500 text-yellow-500")} />
                {isStarred ? "Remover favorito" : "Favoritar mensagem"}
              </DropdownMenuItem>
            )}
            {/* Add internal note */}
            {onAddNote && content && (
              <DropdownMenuItem onClick={() => onAddNote(id, content)}>
                <StickyNote className="h-4 w-4 mr-2" />
                Adicionar nota
              </DropdownMenuItem>
            )}
            {whatsappMessageId && remoteJid && onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(id, whatsappMessageId, remoteJid)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar mensagem
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      
      <div
        className={cn(
          "relative max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 transition-all",
          "break-words [overflow-wrap:anywhere] [word-break:break-word] [hyphens:auto]",
          isRevoked
            ? "bg-muted/50 rounded-br-md opacity-70"
            : isInternal
              ? "bg-yellow-100 text-yellow-900 rounded-br-md dark:bg-yellow-900/40 dark:text-yellow-100 border border-yellow-300 dark:border-yellow-700"
              : isFromMe
                ? aiGenerated
                  ? "bg-purple-100 text-purple-900 rounded-br-md dark:bg-purple-900/30 dark:text-purple-100"
                  : (displayStatus === "error")
                    ? "bg-red-100 text-red-900 rounded-br-md dark:bg-red-900/30 dark:text-red-100 border border-red-300 dark:border-red-700"
                    : "bg-green-100 text-green-900 rounded-br-md dark:bg-green-900/30 dark:text-green-100"
                : "bg-muted rounded-bl-md",
          isHighlighted && "ring-2 ring-yellow-400 ring-offset-2",
          isFromMe && clientReaction && "mb-3" // Add margin for reaction badge
        )}
      >
        {/* Revoked message indicator */}
        {isRevoked && (
          <div className="flex items-center gap-1.5 text-muted-foreground italic">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span className="text-sm">Mensagem apagada</span>
          </div>
        )}
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
        
        {/* Template message card */}
        {isTemplateCard && (() => {
          const parsed = parseTemplateContent(rawContent);
          return (
            <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950/30 rounded-r-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                <FileText className="h-3.5 w-3.5" />
                <span>Template{templateCardName ? `: ${templateCardName}` : ''}</span>
              </div>
              {parsed.body.length > 0 && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {renderWithLinks(parsed.body.join('\n'))}
                </p>
              )}
              {parsed.footer && (
                <p className="text-xs text-muted-foreground italic border-t border-green-200 dark:border-green-800 pt-1">
                  {parsed.footer}
                </p>
              )}
              {parsed.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-green-200 dark:border-green-800">
                  {parsed.buttons.map((btn, i) => (
                    <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-green-900/50 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700">
                      {btn}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Render text content with linkified URLs */}
        {displayContent && !isTemplateCard && (
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
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {isFromMe ? "Enviando..." : "Baixando..."}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Show placeholder for other media without preview */}
        {/* Don't show placeholder for text messages without content (these may be reaction ghost messages) */}
        {!hasMedia && !content && messageType !== "audio" && messageType !== "text" && (
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
                : (displayStatus === "error")
                  ? "text-red-700/80 dark:text-red-300/80"
                  : "text-green-700/80 dark:text-green-300/80"
              : "text-muted-foreground"
        )}>
          {/* Reaction indicator */}
          {myReaction && (
            <span className="text-sm" title="Sua reação">
              {myReaction}
            </span>
          )}
          {/* Star indicator for favorited messages */}
          {isStarred && (
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
          )}
          <span className="text-xs">
            {new Date(createdAt).toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          {renderStatusIcon()}
        </div>
        
        {/* Client reaction indicator (for outgoing messages) */}
        {isFromMe && clientReaction && (
          <div 
            className="absolute -bottom-2.5 -left-1 bg-muted rounded-full px-1.5 py-0.5 border border-border shadow-sm text-sm z-10"
            title="Reação do cliente"
          >
            {clientReaction}
          </div>
        )}
      </div>
      
      {/* Actions menu for incoming messages */}
      {!isFromMe && (showActions || menuOpen) && !isRevoked && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 ml-1 transition-opacity self-center",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 z-50 bg-popover">
            {onReply && (
              <DropdownMenuItem onClick={() => onReply(id)}>
                <Reply className="h-4 w-4 mr-2" />
                Responder mensagem
              </DropdownMenuItem>
            )}
            {/* React with emoji - for incoming messages */}
            {whatsappMessageId && remoteJid && onReact && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Smile className="h-4 w-4 mr-2" />
                  {myReaction ? `Alterar reação (${myReaction})` : "Reagir à mensagem"}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-2 bg-popover">
                  <div className="flex gap-1">
                    {REACTION_EMOJIS.filter(emoji => emoji !== myReaction).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          onReact(id, whatsappMessageId, remoteJid, emoji, isFromMe, myReaction);
                          setMenuOpen(false);
                        }}
                        className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {hasMedia && whatsappMessageId && conversationId && onDownloadMedia && (
              <DropdownMenuItem onClick={() => onDownloadMedia(whatsappMessageId, conversationId)}>
                <Download className="h-4 w-4 mr-2" />
                Baixar
              </DropdownMenuItem>
            )}
            {onToggleStar && (
              <DropdownMenuItem onClick={() => onToggleStar(id, !isStarred)}>
                <Star className={cn("h-4 w-4 mr-2", isStarred && "fill-yellow-500 text-yellow-500")} />
                {isStarred ? "Remover favorito" : "Favoritar mensagem"}
              </DropdownMenuItem>
            )}
            {/* Add internal note */}
            {onAddNote && content && (
              <DropdownMenuItem onClick={() => onAddNote(id, content)}>
                <StickyNote className="h-4 w-4 mr-2" />
                Adicionar nota
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes (e.g., input typing)
export default memo(MessageBubble);
