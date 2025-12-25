import { Bot, Check, CheckCheck, Clock, FileText, Download, Reply, Play, Pause, Loader2, RotateCcw, AlertCircle, X, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, ReactNode, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuotedMessage } from "./ReplyPreview";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAudio, setCachedAudio, cleanupOldCache } from "@/lib/audioCache";

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

// Custom audio player component with decryption support, progress bar, and speed control
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

  // Calculate progress percentage for visual bar
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isDecrypting) {
    return (
      <div className="flex items-center gap-3 min-w-[240px] max-w-[300px] p-2 rounded-xl bg-background/20">
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
        <div className="flex-1">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary/50 rounded-full animate-pulse w-1/3" />
          </div>
          <span className="text-xs opacity-70 mt-1 block">Carregando...</span>
        </div>
      </div>
    );
  }

  if (error || (!audioSrc && needsDecryption)) {
    return (
      <div className="flex items-center gap-3 min-w-[200px] p-2 rounded-xl bg-destructive/10">
        <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <X className="h-5 w-5 text-destructive" />
        </div>
        <span className="text-xs text-destructive">Áudio não disponível</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-3 min-w-[260px] max-w-[320px] p-2 rounded-xl transition-all",
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
      <div className="flex-1 space-y-1.5">
        {/* Visual progress bar */}
        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden cursor-pointer group">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={!audioSrc}
          />
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-100 relative"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Animated pulse at the end */}
            <div className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary shadow-lg transition-opacity",
              isPlaying ? "opacity-100 animate-pulse" : "opacity-0 group-hover:opacity-100"
            )} />
          </div>
        </div>
        
        {/* Time and speed controls */}
        <div className="flex justify-between items-center">
          <span className="text-xs opacity-70 tabular-nums">{formatTime(currentTime)}</span>
          <button
            onClick={cycleSpeed}
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded transition-colors",
              "hover:bg-primary/20 active:scale-95",
              playbackSpeed !== 1 ? "text-primary" : "opacity-70"
            )}
            title="Velocidade de reprodução"
          >
            {playbackSpeed}x
          </button>
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

  // Check if needs decryption
  const needsDecryption = src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

  // Decrypt image on mount if needed
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
          console.error("Failed to decrypt image:", response.error || response.data?.error);
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
        console.error("Error decrypting image:", err);
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
      <div className="flex items-center justify-center min-w-[200px] min-h-[150px] bg-muted/50 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs opacity-70">Carregando imagem...</span>
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
      <img
        src={imageSrc || src}
        alt="Imagem"
        className="max-w-[240px] max-h-[240px] rounded-lg cursor-pointer object-cover hover:opacity-90 transition-opacity"
        onClick={() => setImageOpen(true)}
        onError={() => setError(true)}
      />
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
      <div className="flex items-center justify-center min-w-[200px] min-h-[120px] bg-muted/50 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs opacity-70">Carregando vídeo...</span>
        </div>
      </div>
    );
  }

  if (error || (!videoSrc && needsDecryption)) {
    return (
      <div className="flex items-center justify-center min-w-[200px] min-h-[120px] bg-muted/50 rounded-lg">
        <span className="text-xs opacity-70">Vídeo não disponível</span>
      </div>
    );
  }

  return (
    <video
      controls
      className="max-w-[280px] max-h-[200px] rounded-lg"
      preload="metadata"
    >
      <source src={videoSrc || src} type={mimeType || "video/mp4"} />
      Seu navegador não suporta vídeo.
    </video>
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
  onReply,
  onScrollToMessage,
  onRetry,
  highlightText,
  isHighlighted = false,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  // Determine actual status based on read_at if available
  const actualStatus: MessageStatus = (() => {
    if (!isFromMe) return status;
    if (readAt) return "read";
    if (status === "sending" || status === "error") return status;
    // For sent messages, use "sent" (1 tick), "delivered" will be set when we have delivery confirmation
    return status === "delivered" ? "delivered" : "sent";
  })();

  const renderStatusIcon = () => {
    if (!isFromMe) return null;

    switch (actualStatus) {
      case "sending":
        return (
          <div className="flex items-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        );
      case "sent":
        // 1 tick - message sent to server
        return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
      case "delivered":
        // 2 gray ticks - message delivered to recipient
        return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
      case "read":
        // 2 blue ticks - message read by recipient
        return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
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
        return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
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
      const fileName = mediaUrl.split("/").pop() || "Documento";
      return (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 p-2 rounded-lg transition-colors",
            isFromMe 
              ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" 
              : "bg-muted-foreground/10 hover:bg-muted-foreground/20"
          )}
        >
          <FileText className="h-8 w-8 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            <p className="text-xs opacity-70">Clique para abrir</p>
          </div>
          <Download className="h-4 w-4 flex-shrink-0" />
        </a>
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

  return (
    <div
      className={cn(
        "flex group",
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
          "max-w-[80%] rounded-2xl px-4 py-2.5 transition-all",
          isFromMe
            ? aiGenerated
              ? "bg-purple-100 text-foreground rounded-br-md dark:bg-purple-900/30"
              : "bg-primary text-primary-foreground rounded-br-md"
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
        
        {aiGenerated && isFromMe && (
          <div className="flex items-center gap-1 text-xs text-purple-600 mb-1 dark:text-purple-400">
            <Bot className="h-3 w-3" />
            Assistente IA
          </div>
        )}
        
        {/* Render media content */}
        {hasMedia && (
          <div className="mb-2">
            {renderMedia()}
          </div>
        )}
        
        {/* Render text content */}
        {content && !content.startsWith("[") && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {highlightText ? highlightText(content) : content}
          </p>
        )}

        {/* Show placeholder for media without preview */}
        {!hasMedia && !content && (
          <p className="text-sm leading-relaxed text-muted-foreground italic">
            {messageType === "audio" ? "🎵 Áudio" : messageType === "image" ? "📷 Imagem" : "📎 Mídia"}
          </p>
        )}
        
        <div className={cn(
          "flex items-center justify-end gap-1 mt-1",
          isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
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
