import { Bot, Check, CheckCheck, Clock, FileText, Play, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

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
}

export function MessageBubble({
  content,
  createdAt,
  isFromMe,
  aiGenerated,
  mediaUrl,
  mediaMimeType,
  messageType,
  status = "sent",
}: MessageBubbleProps) {
  const [imageOpen, setImageOpen] = useState(false);

  const renderStatusIcon = () => {
    if (!isFromMe) return null;

    switch (status) {
      case "sending":
        return <Clock className="h-3 w-3 animate-pulse" />;
      case "sent":
        return <Check className="h-3 w-3" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3" />;
      case "read":
        return <CheckCheck className="h-3 w-3 text-blue-400" />;
      case "error":
        return <span className="text-destructive text-xs">!</span>;
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
      return (
        <div className="flex items-center gap-2 min-w-[200px]">
          <audio controls className="w-full h-8" preload="metadata">
            <source src={mediaUrl} type={mediaMimeType || "audio/ogg"} />
            Seu navegador não suporta áudio.
          </audio>
        </div>
      );
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
        "flex",
        isFromMe ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5",
          isFromMe
            ? aiGenerated
              ? "bg-purple-100 text-foreground rounded-br-md dark:bg-purple-900/30"
              : "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        )}
      >
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
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
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
    </div>
  );
}
