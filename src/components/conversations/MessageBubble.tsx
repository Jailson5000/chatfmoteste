import { Bot, Check, CheckCheck, Clock, FileText, Download, Reply, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, ReactNode, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuotedMessage } from "./ReplyPreview";
import { Slider } from "@/components/ui/slider";

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
  replyTo?: {
    id: string;
    content: string | null;
    is_from_me: boolean;
  } | null;
  onReply?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  highlightText?: (text: string) => ReactNode;
  isHighlighted?: boolean;
}

// Custom audio player component for better control
function AudioPlayer({ src, mimeType }: { src: string; mimeType?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => setError(true);

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
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

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

  if (error) {
    return (
      <div className="flex items-center gap-2 min-w-[200px] text-xs opacity-70">
        <Play className="h-4 w-4" />
        <span>Áudio não disponível</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[220px] max-w-[280px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full flex-shrink-0"
        onClick={togglePlay}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>
      <div className="flex-1 space-y-1">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          className="cursor-pointer"
        />
        <div className="flex justify-between text-xs opacity-70">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
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
  replyTo,
  onReply,
  onScrollToMessage,
  highlightText,
  isHighlighted = false,
}: MessageBubbleProps) {
  const [imageOpen, setImageOpen] = useState(false);
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
        return <Clock className="h-3 w-3 animate-pulse" />;
      case "sent":
        // 1 tick - message sent to server
        return <Check className="h-3 w-3" />;
      case "delivered":
        // 2 ticks - message delivered to recipient
        return <CheckCheck className="h-3 w-3" />;
      case "read":
        // 2 blue ticks - message read by recipient
        return <CheckCheck className="h-3 w-3 text-blue-400" />;
      case "error":
        return <span className="text-destructive text-xs font-bold">!</span>;
      default:
        return <Check className="h-3 w-3" />;
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
        <>
          <img
            src={mediaUrl}
            alt="Imagem"
            className="max-w-[240px] max-h-[240px] rounded-lg cursor-pointer object-cover hover:opacity-90 transition-opacity"
            onClick={() => setImageOpen(true)}
          />
          <Dialog open={imageOpen} onOpenChange={setImageOpen}>
            <DialogContent className="max-w-4xl p-0 bg-transparent border-none">
              <img
                src={mediaUrl}
                alt="Imagem ampliada"
                className="w-full h-auto rounded-lg"
              />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    if (isAudio) {
      return <AudioPlayer src={mediaUrl} mimeType={mediaMimeType || undefined} />;
    }

    if (isVideo) {
      return (
        <video
          controls
          className="max-w-[280px] max-h-[200px] rounded-lg"
          preload="metadata"
        >
          <source src={mediaUrl} type={mediaMimeType || "video/mp4"} />
          Seu navegador não suporta vídeo.
        </video>
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
