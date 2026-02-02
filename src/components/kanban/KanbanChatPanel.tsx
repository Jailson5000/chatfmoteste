import React, { useState, useEffect, useRef, useMemo, useReducer, useCallback, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useConversations } from "@/hooks/useConversations";
import { useClients } from "@/hooks/useClients";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { useLawFirm } from "@/hooks/useLawFirm";
import { ScheduledFollowUpIndicator } from "@/components/conversations/ScheduledFollowUpIndicator";
import { InlineActivityBadge, ActivityItem } from "@/components/conversations/InlineActivityBadge";
import { DateSeparator, shouldShowDateSeparator } from "@/components/conversations/DateSeparator";
import { useInlineActivities } from "@/hooks/useInlineActivities";
import { useMessagesWithPagination, PaginatedMessage } from "@/hooks/useMessagesWithPagination";
import { useClientActions } from "@/hooks/useClientActions";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { renderWithLinks } from "@/lib/linkify";
import { 
  Send, 
  X, 
  Loader2, 
  CheckCheck, 
  Check, 
  Bot, 
  User,
  Archive,
  Maximize2,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
  Plus,
  Zap,
  Lock,
  Sparkles,
  Paperclip,
  Pencil,
  Folder,
  Tag,
  CircleDot,
  ArrowRightLeft,
  Users,
  Play,
  Pause,
  FileAudio,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Reply
} from "lucide-react";
import { ReplyPreview, QuotedMessage } from "@/components/conversations/ReplyPreview";
import { AddNoteDialog } from "@/components/conversations/AddNoteDialog";
import MessageBubble, { MessageStatus } from "@/components/conversations/MessageBubble";
import { getCachedAudio, setCachedAudio, cleanupOldCache } from "@/lib/audioCache";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { AudioRecorder } from "@/components/conversations/AudioRecorder";
import { MediaPreviewDialog } from "@/components/conversations/MediaPreviewDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Archive reason options (same as Conversations)
const ARCHIVE_REASONS = [
  { value: "resolved", label: "Chat do cliente resolvido com sucesso." },
  { value: "no_response", label: "Cliente não responde mais." },
  { value: "opened_by_mistake", label: "Abri sem querer." },
  { value: "other", label: "Outros." },
] as const;
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Message {
  id: string;
  content: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_type: string;
  ai_generated: boolean;
  status?: string;
  is_internal?: boolean;
  message_type?: string;
  media_url?: string | null;
  media_mime_type?: string | null;
  whatsapp_message_id?: string | null;
  ai_agent_id?: string | null;
  ai_agent_name?: string | null;
}

// Memory cache for decrypted audio
const audioMemoryCache = new Map<string, string>();

// Check if URL is encrypted WhatsApp media
function isEncryptedMedia(url: string): boolean {
  return url.includes(".enc") || url.includes("mmg.whatsapp.net");
}

// Check if URL is a public storage URL (doesn't need decryption)
function isPublicStorageUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('supabase.co/storage/v1/object/public/') || 
         url.includes('.supabase.co/storage/v1/object/public/');
}

// Transcription cache
const transcriptionCache = new Map<string, string>();

// Simple audio player for Kanban chat
function KanbanAudioPlayer({ 
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
  
  // Transcription state
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [blobFailed, setBlobFailed] = useState(false);

  // Check if URL is already directly playable (blob URL, public URL, or data URL)
  const isBlobUrl = src?.startsWith('blob:');
  const isDataUrl = src?.startsWith('data:');
  const isPublicUrl = isPublicStorageUrl(src || '');
  const isDirectlyPlayable = isBlobUrl || isDataUrl || isPublicUrl;

  // Only try to decrypt encrypted WhatsApp media that isn't already playable
  // Also decrypt if blob URL failed (e.g., was revoked)
  const needsDecryption = (blobFailed || !isDirectlyPlayable) && src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

  // Decrypt audio on mount if needed
  useEffect(() => {
    if (!needsDecryption) return;
    
    const loadAudio = async () => {
      // Check memory cache first
      const memoryCached = audioMemoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }

      // Check IndexedDB cache
      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        audioMemoryCache.set(whatsappMessageId!, dbCached);
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
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "audio/ogg";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
        
        audioMemoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);
        
        setDecryptedSrc(dataUrl);
      } catch (err) {
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    loadAudio();
    cleanupOldCache();
  }, [needsDecryption, whatsappMessageId, conversationId, mimeType]);

  // Check for cached transcription
  useEffect(() => {
    if (whatsappMessageId) {
      const cached = transcriptionCache.get(whatsappMessageId);
      if (cached) setTranscription(cached);
    }
  }, [whatsappMessageId]);

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
        console.log("[KanbanAudioPlayer] Blob URL failed, attempting decryption fallback");
        setBlobFailed(true);
        return;
      }
      if (!isDecrypting && audioSrc) setError(true);
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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioSrc || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleTranscribe = async () => {
    if (isTranscribing || !audioSrc) return;

    if (whatsappMessageId && transcriptionCache.has(whatsappMessageId)) {
      setTranscription(transcriptionCache.get(whatsappMessageId)!);
      return;
    }

    setIsTranscribing(true);
    try {
      let audioBase64: string;
      
      if (audioSrc.startsWith('data:')) {
        audioBase64 = audioSrc.split(',')[1];
      } else {
        const response = await fetch(audioSrc);
        const blob = await response.blob();
        const reader = new FileReader();
        audioBase64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
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

      if (response.data?.transcription) {
        const text = response.data.transcription;
        setTranscription(text);
        if (whatsappMessageId) {
          transcriptionCache.set(whatsappMessageId, text);
        }
      }
    } catch (err) {
      setTranscription("Erro ao transcrever");
    } finally {
      setIsTranscribing(false);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isDecrypting) {
    return (
      <div className="flex items-center gap-2 min-w-[200px] p-2 rounded-lg bg-background/30">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
        <span className="text-xs opacity-70">Carregando áudio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 min-w-[160px] p-2 rounded-lg bg-destructive/10">
        <X className="h-4 w-4 text-destructive" />
        <span className="text-xs text-destructive">Áudio indisponível</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 min-w-[200px] max-w-[280px]">
        {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
        
        {/* Play button */}
        <button
          className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
            isPlaying ? "bg-primary text-primary-foreground" : "bg-background/50 hover:bg-background/70"
          )}
          onClick={togglePlay}
          disabled={!audioSrc}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>
        
        {/* Progress bar */}
        <div className="flex-1 space-y-1">
          <div 
            className="h-2 bg-background/50 rounded-full cursor-pointer overflow-hidden"
            onClick={handleSeek}
          >
            <div 
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] opacity-60">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        
        {/* Transcribe button */}
        <button
          className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-background/50 transition-colors"
          onClick={handleTranscribe}
          disabled={isTranscribing}
          title="Transcrever áudio"
        >
          {isTranscribing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileAudio className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      
      {/* Transcription */}
      {transcription && (
        <div className="text-xs opacity-80 italic px-1 py-1 bg-background/20 rounded">
          "{transcription}"
        </div>
      )}
    </div>
  );
}

// ==========================================
// KANBAN IMAGE VIEWER WITH FULL CONTROLS
// (zoom, rotation, download, navigation)
// ==========================================
function KanbanImageViewer({
  src,
  mimeType,
  whatsappMessageId,
  conversationId,
}: {
  src?: string | null;
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
}) {
  const [error, setError] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedSrc, setDecryptedSrc] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Se não existir URL (caso comum no WhatsApp) OU se for URL criptografada, precisamos buscar o arquivo via backend.
  const needsDecryption =
    !!whatsappMessageId && !!conversationId && (!src || isEncryptedMedia(src));

  useEffect(() => {
    if (!needsDecryption) return;

    const loadImage = async () => {
      const memoryCached = audioMemoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }

      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        audioMemoryCache.set(whatsappMessageId!, dbCached);
        setDecryptedSrc(dbCached);
        return;
      }

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
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "image/jpeg";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;

        audioMemoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);

        setDecryptedSrc(dataUrl);
      } catch (err) {
        setError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    loadImage();
  }, [needsDecryption, whatsappMessageId, conversationId, mimeType]);

  const imageSrc = needsDecryption ? decryptedSrc : (src ?? null);

  // Reset zoom/rotation quando abre
  useEffect(() => {
    if (imageOpen) {
      setZoom(1);
      setRotation(0);
    }
  }, [imageOpen]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    if (!imageSrc) return;
    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = `imagem_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClose = () => setImageOpen(false);

  // Keyboard navigation
  useEffect(() => {
    if (!imageOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          handleClose();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        case "r":
        case "R":
          handleRotate();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageOpen]);

  // Quando a imagem não tem media_url no banco, precisamos esperar a descriptografia.
  if (needsDecryption && !imageSrc && !error) {
    return (
      <div className="relative min-w-[180px] min-h-[120px] max-w-[220px] rounded-xl overflow-hidden bg-muted/50 border border-border/50">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-primary/60" />
            </div>
            {isDecrypting && (
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className="flex items-center justify-center min-w-[180px] min-h-[100px] bg-destructive/10 rounded-lg">
        <div className="flex flex-col items-center gap-1">
          <X className="h-5 w-5 text-destructive" />
          <span className="text-xs text-destructive">Imagem não disponível</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="max-w-[220px] max-h-[220px] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-muted/30"
        onClick={() => setImageOpen(true)}
      >
        <img
          src={imageSrc}
          alt="Imagem"
          className="max-w-full max-h-[220px] object-contain"
          onError={() => setError(true)}
        />
      </div>
      {imageOpen && (
        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden">
            {/* Toolbar */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                title="Zoom - (-)"
              >
                <ZoomOut className="h-5 w-5 text-white" />
              </button>
              <span className="text-white text-xs min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                title="Zoom + (+)"
              >
                <ZoomIn className="h-5 w-5 text-white" />
              </button>
              <div className="w-px h-5 bg-white/30 mx-1" />
              <button
                onClick={handleRotate}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                title="Girar (R)"
              >
                <RotateCw className="h-5 w-5 text-white" />
              </button>
              <div className="w-px h-5 bg-white/30 mx-1" />
              <button
                onClick={handleDownload}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                title="Baixar"
              >
                <Download className="h-5 w-5 text-white" />
              </button>
              <div className="w-px h-5 bg-white/30 mx-1" />
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Image */}
            <div className="flex items-center justify-center w-full h-[85vh] overflow-auto">
              <img
                src={imageSrc}
                alt="Imagem"
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
// Video player component with decryption support
function KanbanVideoPlayer({ 
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

  const needsDecryption = !!whatsappMessageId && !!conversationId;

  useEffect(() => {
    if (!needsDecryption) return;
    
    const loadVideo = async () => {
      const memoryCached = audioMemoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        setDecryptedSrc(memoryCached);
        return;
      }

      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        audioMemoryCache.set(whatsappMessageId!, dbCached);
        setDecryptedSrc(dbCached);
        return;
      }

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
          setError(true);
          return;
        }

        const actualMimeType = response.data.mimetype || mimeType || "video/mp4";
        const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
        
        audioMemoryCache.set(whatsappMessageId!, dataUrl);
        await setCachedAudio(whatsappMessageId!, dataUrl);
        
        setDecryptedSrc(dataUrl);
      } catch (err) {
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
      <div className="relative min-w-[180px] min-h-[100px] max-w-[220px] rounded-xl overflow-hidden bg-muted/50 border border-border/50">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Video className="h-5 w-5 text-primary/60" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Carregando vídeo...</span>
        </div>
      </div>
    );
  }

  if (error || (!videoSrc && needsDecryption)) {
    return (
      <div className="flex items-center justify-center min-w-[180px] min-h-[100px] bg-destructive/10 rounded-lg">
        <div className="flex flex-col items-center gap-1">
          <X className="h-5 w-5 text-destructive" />
          <span className="text-xs text-destructive">Vídeo não disponível</span>
        </div>
      </div>
    );
  }

  return (
    <video
      controls
      className="max-w-[220px] max-h-[180px] rounded-lg"
      preload="metadata"
    >
      <source src={videoSrc || src} type={mimeType || "video/mp4"} />
      Seu navegador não suporta vídeo.
    </video>
  );
}

// Document viewer component with decryption support
function KanbanDocumentViewer({
  src,
  mimeType,
  whatsappMessageId,
  conversationId,
  isFromMe,
  content,
}: {
  src?: string | null;
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
  isFromMe?: boolean;
  content?: string | null;
}) {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState(false);

  const safeSrc = src ?? "";

  // Se não existir URL (caso comum no WhatsApp) OU se for URL criptografada, precisamos buscar o arquivo via backend.
  const needsDecryption =
    !!whatsappMessageId && !!conversationId && (!src || isEncryptedMedia(src));

  const getDisplayName = () => {
    const rawLastSegment = safeSrc.split("/").pop() || "Documento";
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

  const getFileExtension = () => {
    const contentCandidate = content?.trim();
    if (contentCandidate) {
      const match = contentCandidate.match(/\.(pdf|doc|docx|xls|xlsx)$/i);
      if (match) return match[0].toLowerCase();
    }
    if (mimeType?.includes("pdf")) return ".pdf";
    if (mimeType?.includes("word") || mimeType?.includes("doc")) return ".docx";
    if (mimeType?.includes("sheet") || mimeType?.includes("excel")) return ".xlsx";
    return ".pdf";
  };

  const handleDownload = async () => {
    if (!needsDecryption) {
      if (safeSrc) window.open(safeSrc, "_blank");
      return;
    }

    setIsDecrypting(true);
    setError(false);

    try {
      const memoryCached = audioMemoryCache.get(whatsappMessageId!);
      if (memoryCached) {
        downloadDataUrl(memoryCached);
        return;
      }

      const dbCached = await getCachedAudio(whatsappMessageId!);
      if (dbCached) {
        audioMemoryCache.set(whatsappMessageId!, dbCached);
        downloadDataUrl(dbCached);
        return;
      }

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId,
          whatsappMessageId,
        },
      });

      if (response.error || !response.data?.success || !response.data?.base64) {
        setError(true);
        return;
      }

      const actualMimeType = response.data.mimetype || mimeType || "application/pdf";
      const dataUrl = `data:${actualMimeType};base64,${response.data.base64}`;
      
      audioMemoryCache.set(whatsappMessageId!, dataUrl);
      await setCachedAudio(whatsappMessageId!, dataUrl);
      
      downloadDataUrl(dataUrl);
    } catch (err) {
      setError(true);
    } finally {
      setIsDecrypting(false);
    }
  };

  const downloadDataUrl = (dataUrl: string) => {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const docMimeType = mimeMatch ? mimeMatch[1] : "application/pdf";
    
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: docMimeType });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    
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
        "flex items-center gap-2 p-2 rounded-lg w-full max-w-[220px]",
        isFromMe ? "bg-primary-foreground/10" : "bg-muted-foreground/10"
      )}>
        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium break-all line-clamp-1">{displayName}</p>
          <p className="text-xs opacity-70">Baixando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg w-full max-w-[220px] bg-destructive/10">
        <div className="h-8 w-8 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <X className="h-4 w-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive line-clamp-1">Documento não disponível</p>
          <button onClick={handleDownload} className="text-xs text-destructive/70 hover:underline">
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
        "flex items-center gap-2 p-2 rounded-lg transition-colors w-full max-w-[220px] text-left",
        isFromMe ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-muted-foreground/10 hover:bg-muted-foreground/20"
      )}
    >
      <FileText className="h-7 w-7 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium break-all line-clamp-1">{displayName}</p>
        <p className="text-xs opacity-70">Clique para baixar</p>
      </div>
    </button>
  );
}

interface CustomStatus {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface Department {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

interface TeamMember {
  id: string;
  full_name: string;
}

interface Automation {
  id: string;
  name: string;
  is_active: boolean;
}

interface KanbanChatPanelProps {
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  remoteJid?: string | null;
  currentHandler: 'ai' | 'human';
  /** The specific AI agent assigned to this conversation (source of truth for prompt selection) */
  currentAutomationId?: string | null;
  /** The name of current automation from backend join - use this for display (source of truth) */
  currentAutomationName?: string | null;
  assignedProfile?: { full_name: string } | null;
  /** The ID of the currently assigned attendant (for auto-transfer logic) */
  assignedTo?: string | null;
  clientId?: string | null;
  clientStatus?: string | null;
  conversationTags?: string[] | null;
  departmentId?: string | null;
  /** Conversation origin - used to route messages correctly (WhatsApp vs Widget/Tray) */
  origin?: string | null;
  /** Avatar URL from client's WhatsApp profile */
  avatarUrl?: string | null;
  /** Archive metadata for archived conversations */
  archivedAt?: string | null;
  archivedReason?: string | null;
  archivedByName?: string | null;
  customStatuses: CustomStatus[];
  tags: TagItem[];
  departments: Department[];
  members: TeamMember[];
  automations: Automation[];
  onClose: () => void;
}

export function KanbanChatPanel({
  conversationId,
  contactName,
  contactPhone,
  remoteJid,
  currentHandler,
  currentAutomationId,
  currentAutomationName,
  assignedProfile,
  assignedTo,
  clientId,
  clientStatus,
  conversationTags,
  departmentId,
  origin,
  avatarUrl,
  archivedAt,
  archivedReason,
  archivedByName,
  customStatuses,
  tags,
  departments,
  members,
  automations,
  onClose,
}: KanbanChatPanelProps) {
  // Determine if this is a WhatsApp conversation (robust detection)
  // Criteria: origin='whatsapp' OR remote_jid ends with @s.whatsapp.net
  // Inverse: NOT widget/tray/site/web origins
  const conversationOrigin = (origin || '').toUpperCase();
  const nonWhatsAppOrigins = ['WIDGET', 'TRAY', 'SITE', 'WEB'];
  const isNonWhatsAppConversation = conversationOrigin && nonWhatsAppOrigins.includes(conversationOrigin);
  
  // isWhatsAppConversation: used to show/hide audio recorder
  // IMPORTANTE: Não assumir WhatsApp se origin vazio - requer confirmação explícita via remoteJid
  const isWhatsAppConversation = !isNonWhatsAppConversation && (
    conversationOrigin === 'WHATSAPP' ||
    (remoteJid && remoteJid.endsWith('@s.whatsapp.net'))
  );
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { transferHandler, updateConversation, updateConversationDepartment } = useConversations();
  const { updateClientStatus, updateClient } = useClients();
  const { lawFirm } = useLawFirm();
  const lawFirmId = lawFirm?.id;

  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = () => reject(new Error("Falha ao converter arquivo para Base64"));
      reader.readAsDataURL(blob);
    });
  }, []);

  const getChatMediaPath = useCallback((fileName: string) => {
    // Storage RLS expects the first folder to be the tenant id (lawFirmId)
    if (!lawFirmId) throw new Error("Empresa não encontrada (lawFirmId ausente)");
    return `${lawFirmId}/${conversationId}/${fileName}`;
  }, [conversationId, lawFirmId]);
  
  // Hook for creating client actions (activity log) - same as ContactDetailsPanel
  const { createAction } = useClientActions(clientId || undefined);
  
  // Message queue to ensure messages are sent in strict order
  const { enqueue: enqueueMessage } = useMessageQueue();
  
  // Get inline activities for this conversation
  const { activities: inlineActivities } = useInlineActivities(conversationId, clientId || null);
  
  // Client tag IDs (single source of truth - same query as ContactStatusTags)
  const { data: clientTagIds = [] } = useQuery({
    queryKey: ["client_tags", clientId],
    queryFn: async () => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from("client_tags")
        .select("tag_id")
        .eq("client_id", clientId);

      if (error) throw error;
      return (data || []).map((t) => t.tag_id);
    },
    enabled: !!clientId,
    staleTime: 10_000,
  });

  // Use backend name (source of truth) with fallback to local lookup
  const resolvedAutomationName = currentAutomationName 
    || (currentAutomationId ? automations.find(a => a.id === currentAutomationId)?.name : null)
    || null;

  // Use paginated messages hook
  const {
    messages,
    setMessages,
    isLoading,
    isLoadingMore,
    hasMoreMessages,
    handleScrollToTop,
  } = useMessagesWithPagination({
    conversationId,
    initialBatchSize: 35,
    loadMoreBatchSize: 30,
    onNewMessage: (msg) => {
      // If user is not at bottom AND this is a client/AI/system message, increment unseen count
      // For AI messages: is_from_me=true but sender_type='ai'
      // For client messages: is_from_me=false
      // For system messages: sender_type='system'
      const isClientMessage = !msg.is_from_me;
      const isAIMessage = msg.sender_type === 'ai';
      const isSystemMessage = msg.sender_type === 'system';
      
      if (!isAtBottomRef.current && (isClientMessage || isAIMessage || isSystemMessage)) {
        console.log('[KanbanChat] New message while not at bottom, incrementing unseen count:', {
          sender_type: msg.sender_type,
          is_from_me: msg.is_from_me,
          isAtBottom: isAtBottomRef.current
        });
        setUnseenMessageCount(prev => prev + 1);
      }
    },
  });

  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPontualMode, setIsPontualMode] = useState(false);
  const [isInternalMode, setIsInternalMode] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenMessageCount, setUnseenMessageCount] = useState(0);
  const lastSeenMessageIdRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Monotonic counter for stable message ordering (prevents visual shuffle during reconciliation)
  const clientOrderRef = useRef(Date.now());

  // Media preview state (for Ctrl+V paste)
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    file: File | null;
    mediaType: "image" | "audio" | "video" | "document";
    previewUrl: string | null;
  }>({ open: false, file: null, mediaType: "image", previewUrl: null });

  const [, bumpDeliveryRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    // Force a re-render at the earliest "assume delivered after 3s" deadline
    const now = Date.now();
    let nextMs: number | null = null;

    for (const m of messages) {
      if (!m.is_from_me) continue;
      if (m.is_internal) continue;
      if (!m.whatsapp_message_id) continue;
      if (m.status === "read" || m.status === "delivered" || m.status === "sending" || m.status === "error") continue;

      const createdMs = new Date(m.created_at).getTime();
      if (!Number.isFinite(createdMs)) continue;

      const remaining = createdMs + 2000 - now;
      if (remaining <= 0) continue;

      if (nextMs === null || remaining < nextMs) nextMs = remaining;
    }

    if (nextMs === null) return;

    const t = window.setTimeout(() => bumpDeliveryRender(), nextMs);
    return () => window.clearTimeout(t);
  }, [messages, bumpDeliveryRender]);

  // Inline edit name state
  const [isEditingNameInline, setIsEditingNameInline] = useState(false);
  const [editingName, setEditingName] = useState(contactName || "");
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  // Status selector state
  const [statusOpen, setStatusOpen] = useState(false);
  
  // Tags selector state
  const [tagsOpen, setTagsOpen] = useState(false);
  
  // Department selector state
  const [departmentOpen, setDepartmentOpen] = useState(false);
  
  // Transfer popover state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  
  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState<string>("resolved");
  const [archiveCustomReason, setArchiveCustomReason] = useState<string>("");
  const [archiveNextResponsible, setArchiveNextResponsible] = useState<string | null>(null);
  const [archiveNextResponsibleType, setArchiveNextResponsibleType] = useState<"human" | "ai" | null>(null);

  // Add note dialog state
  const [addNoteDialogOpen, setAddNoteDialogOpen] = useState(false);
  const [noteTargetMessage, setNoteTargetMessage] = useState<{ id: string; content: string } | null>(null);

  // Reply state
  const [replyToMessage, setReplyToMessage] = useState<PaginatedMessage | null>(null);

  // Handle reply
  const handleReply = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setReplyToMessage(message);
    }
  }, [messages]);

  // Scroll to message
  const scrollToMessage = useCallback((messageId: string) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const el = viewport.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Toggle star/favorite on a message
  const handleToggleStar = useCallback(async (messageId: string, starred: boolean) => {
    try {
      const { error } = await supabase
        .from("messages")
        .update({ is_starred: starred })
        .eq("id", messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_starred: starred } : m
      ));

      toast({
        title: starred ? "Mensagem favoritada" : "Favorito removido",
      });
    } catch (error) {
      console.error("Error toggling star:", error);
      toast({
        title: "Erro ao favoritar",
        description: error instanceof Error ? error.message : "Falha ao favoritar mensagem",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Delete message for everyone on WhatsApp
  const handleDeleteMessage = useCallback(async (messageId: string, whatsappMessageId: string, remoteJid: string) => {
    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "delete_message",
          conversationId,
          whatsappMessageId,
          remoteJid,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Falha ao apagar mensagem");
      }

      // Update local state to show as revoked
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_revoked: true } : m
      ));

      toast({
        title: "Mensagem apagada",
        description: "A mensagem foi apagada para todos.",
      });
    } catch (error) {
      console.error("Error deleting message:", error);
      toast({
        title: "Erro ao apagar",
        description: error instanceof Error ? error.message : "Falha ao apagar mensagem",
        variant: "destructive",
      });
    }
  }, [conversationId, toast]);

  // Send reaction to a message via WhatsApp
  const handleReactToMessage = useCallback(async (
    messageId: string, 
    whatsappMessageId: string, 
    remoteJid: string, 
    emoji: string,
    isFromMe: boolean,
    currentReaction?: string | null
  ) => {
    if (!conversationId) return;

    // Block if trying to react with the same emoji
    if (currentReaction === emoji) {
      toast({
        title: "Mesma reação",
        description: "Escolha uma reação diferente para substituir a atual.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_reaction",
          conversationId,
          whatsappMessageId,
          remoteJid,
          reaction: emoji,
          isFromMe,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar reação");
      }

      // Save reaction to database
      await supabase
        .from("messages")
        .update({ my_reaction: emoji })
        .eq("id", messageId);

      // Update local state for immediate UI feedback
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, my_reaction: emoji } : msg
      ));

      toast({
        title: `Reação ${emoji} enviada`,
      });
    } catch (error) {
      console.error("Error sending reaction:", error);
      toast({
        title: "Erro ao reagir",
        description: error instanceof Error ? error.message : "Falha ao enviar reação",
        variant: "destructive",
      });
    }
  }, [conversationId, toast, setMessages]);

  // Open add note dialog for a specific message
  const handleOpenNoteDialog = useCallback((messageId: string, originalContent: string) => {
    setNoteTargetMessage({ id: messageId, content: originalContent });
    setAddNoteDialogOpen(true);
  }, []);

  // Save internal note (called from dialog)
  const handleSaveNote = useCallback(async (noteText: string) => {
    if (!conversationId || !noteTargetMessage) return;

    const noteContent = `📝 ${noteText}`;
    
    const { data: insertedNote, error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: noteContent,
      sender_type: "agent",
      is_from_me: true,
      is_internal: true,
      ai_generated: false,
      reply_to_message_id: noteTargetMessage.id,
    }).select().single();

    if (error) throw error;

    // Find the original message being replied to for the reply_to data
    const originalMessage = messages.find(m => m.id === noteTargetMessage.id);

    // Add the new note to local state for immediate UI feedback
    if (insertedNote) {
      setMessages(prev => [...prev, {
        ...insertedNote,
        reply_to: originalMessage ? {
          id: originalMessage.id,
          content: originalMessage.content,
          is_from_me: originalMessage.is_from_me,
        } : null,
      }]);
    }

    toast({
      title: "Nota adicionada",
      description: "A nota interna foi criada com sucesso.",
    });
  }, [conversationId, noteTargetMessage, toast, messages, setMessages]);

  // Download media from a message
  const handleDownloadMedia = useCallback(async (whatsappMessageId: string, conversationIdParam: string, fileName?: string) => {
    try {
      toast({ title: "Baixando mídia..." });

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId: conversationIdParam,
          whatsappMessageId,
        },
      });

      if (response.error || !response.data?.success || !response.data?.base64) {
        throw new Error(response.data?.error || "Falha ao baixar mídia");
      }

      const { base64, mimetype } = response.data;
      const dataUrl = `data:${mimetype || "application/octet-stream"};base64,${base64}`;

      // Create download link
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName || `download_${whatsappMessageId.slice(0, 8)}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Download concluído" });
    } catch (error) {
      console.error("Error downloading media:", error);
      toast({
        title: "Erro ao baixar",
        description: error instanceof Error ? error.message : "Falha ao baixar mídia",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Get current status
  const currentStatusObj = customStatuses.find(s => s.id === clientStatus);
  
  // Get current department
  const currentDepartment = departments.find(d => d.id === departmentId);
  
  // Get current tags from client_tags query (single source of truth)
  const currentTags = clientTagIds
    .map(tagId => tags.find(t => t.id === tagId))
    .filter(Boolean) as TagItem[];
    
  // Merge messages with inline activities, sorted by timestamp
  type TimelineItem = 
    | { type: 'message'; data: PaginatedMessage }
    | { type: 'activity'; data: (typeof inlineActivities)[0] };
  
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    
    // Add messages
    messages.forEach(msg => {
      items.push({ type: 'message', data: msg });
    });
    
    // Add activities
    inlineActivities.forEach(activity => {
      items.push({ type: 'activity', data: activity });
    });
    
    // Sort com ordem estável e determinística.
    // Regra: ordenar por timestamp; só usar _clientOrder (ou chave) quando o timestamp for EXATAMENTE igual.
    // Isso evita "embaralhar" quando mensagens chegam muito rápido (mesmo segundo) e um item ainda não tem _clientOrder.
    return items.sort((a, b) => {
      const aTime = a.type === "message"
        ? new Date(a.data.created_at).getTime()
        : a.data.timestamp.getTime();
      const bTime = b.type === "message"
        ? new Date(b.data.created_at).getTime()
        : b.data.timestamp.getTime();

      const diff = aTime - bTime;
      if (diff !== 0) return diff;

      const aClientOrder = a.type === "message" ? (a.data as PaginatedMessage)._clientOrder : undefined;
      const bClientOrder = b.type === "message" ? (b.data as PaginatedMessage)._clientOrder : undefined;

      if (aClientOrder !== undefined && bClientOrder !== undefined) {
        return aClientOrder - bClientOrder;
      }

      const aKey = a.type === "message"
        ? ((a.data as PaginatedMessage)._clientTempId || a.data.id)
        : `activity_${(a.data as any).id}`;
      const bKey = b.type === "message"
        ? ((b.data as PaginatedMessage)._clientTempId || b.data.id)
        : `activity_${(b.data as any).id}`;

      return String(aKey).localeCompare(String(bKey));
    });
  }, [messages, inlineActivities]);

  // Setup viewport tracking and pagination
  useEffect(() => {
    const root = scrollRef.current;
    const viewport = root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (!viewport) return;

    viewportRef.current = viewport;

    let skipFirst = true;

    const onScroll = () => {
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 40;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      
      // Clear unseen count when user scrolls to bottom
      if (atBottom) {
        setUnseenMessageCount(0);
      }

      // Skip pagination on initial bind; only load more when user scrolls up
      if (skipFirst) {
        skipFirst = false;
        return;
      }

      // Trigger pagination when scrolling to top
      handleScrollToTop(viewport);
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => viewport.removeEventListener('scroll', onScroll);
  }, [conversationId, handleScrollToTop]);

  const lastMessageIdRef = useRef<string | null>(null);

  // Track initial scroll per conversation (switching cards while the panel is open must always land on the latest)
  const hasScrolledInitialRef = useRef<string | null>(null);
  const scrollAttemptRef = useRef<number>(0);
  const pendingScrollRef = useRef<boolean>(false);

  const resolveViewport = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return null;

    const current = viewportRef.current;
    if (current && root.contains(current)) return current;

    const next = root.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (next) viewportRef.current = next;
    return next;
  }, []);

  // Reset scroll tracking whenever the conversation changes (even if the panel stays open)
  useEffect(() => {
    scrollAttemptRef.current = 0;

    if (!conversationId) {
      pendingScrollRef.current = false;
      hasScrolledInitialRef.current = null;
      return;
    }

    // Mark scroll as pending; only mark as “scrolled” after we confirm we reached the bottom.
    pendingScrollRef.current = true;
    hasScrolledInitialRef.current = null;

    // Force a fresh lookup; Radix may recreate the viewport node between renders.
    viewportRef.current = null;
  }, [conversationId]);

  const scrollToBottomOnce = useCallback(() => {
    const viewport = resolveViewport();

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
      return;
    }

    // Fallback: end anchor (works when the Radix viewport ref isn’t ready yet)
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [resolveViewport]);

  // Scroll to bottom after messages load for the current conversation (with retries)
  useLayoutEffect(() => {
    if (!conversationId) return;
    if (isLoading) return;
    if (messages.length === 0) return;

    if (!pendingScrollRef.current) return;
    if (hasScrolledInitialRef.current === conversationId) return;

    let cancelled = false;

    const attempt = () => {
      if (cancelled) return;

      scrollToBottomOnce();

      const viewport = resolveViewport();
      const atBottom = viewport
        ? viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 8
        : false;

      if (atBottom) {
        hasScrolledInitialRef.current = conversationId;
        pendingScrollRef.current = false;
        return;
      }

      scrollAttemptRef.current += 1;
      if (scrollAttemptRef.current < 20) {
        requestAnimationFrame(attempt);
      }
    };

    requestAnimationFrame(attempt);

    return () => {
      cancelled = true;
    };
  }, [conversationId, isLoading, messages.length, resolveViewport, scrollToBottomOnce]);

  // Auto-scroll to bottom when new messages arrive AND user is at bottom
  // This tracks the last message ID and scrolls when it changes (if at bottom)
  const lastMessageForScrollRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    
    const lastMsg = messages[messages.length - 1];
    const lastMsgKey = lastMsg?.id || lastMsg?.created_at;
    
    // If this is a new message
    if (lastMsgKey && lastMsgKey !== lastMessageForScrollRef.current) {
      lastMessageForScrollRef.current = lastMsgKey;
      
      // Auto-scroll if user is at bottom (or nearly at bottom)
      if (isAtBottomRef.current) {
        // Small delay to let the new message render
        requestAnimationFrame(() => {
          scrollToBottomOnce();
        });
      }
    }
  }, [messages, scrollToBottomOnce]);

  // Update editing name when contactName changes
  useEffect(() => {
    setEditingName(contactName || "");
  }, [contactName]);

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;

    const wasPontualMode = isPontualMode;
    const wasInternalMode = isInternalMode;
    const messageToSend = messageInput.trim();
    const replyToId = replyToMessage?.id || null;
    const replyWhatsAppId = replyToMessage?.whatsapp_message_id || null;
    
    // Clear input IMMEDIATELY for instant UX
    setMessageInput("");
    setIsPontualMode(false);
    setReplyToMessage(null);
    
    // For external messages: use optimistic updates with reconciliation
    // For internal notes: skip optimistic update - let Realtime be the single source of truth
    // This prevents duplicate notes from appearing in the UI
    const tempId = crypto.randomUUID();
    const tempWhatsAppId = `temp_${tempId}`;
    const messageTimestamp = new Date().toISOString();
    
    // Increment client order for stable sorting (prevents visual shuffle)
    const clientOrder = clientOrderRef.current++;
    
    // CRITICAL: Only add optimistic message for EXTERNAL messages, NOT internal notes
    // Internal notes will appear via Realtime subscription after DB insert
    if (!wasInternalMode) {
      const optimisticMessage = {
        id: tempId,
        content: messageToSend,
        created_at: messageTimestamp,
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
        status: "sending",
        is_internal: false,
        is_pontual: wasPontualMode,
        whatsapp_message_id: tempWhatsAppId,
        message_type: "text",
        reply_to: null,
        // Client-side ordering fields for stable visual order during reconciliation
        _clientOrder: clientOrder,
        _clientTempId: tempId,
      };
      
      // Add message - no sorting needed, _clientOrder ensures stable order
      setMessages(prev => [...prev, optimisticMessage]);
    }

    // Enqueue message send to ensure strict ordering PER CONVERSATION
    // Messages within the same conversation are sent sequentially
    // Different conversations can send messages in parallel
    enqueueMessage(conversationId, async () => {
      if (wasInternalMode) {
        // Internal message - save directly to database
        // NO optimistic update - Realtime subscription handles display
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: messageToSend,
          is_from_me: true,
          sender_type: "human",
          ai_generated: false,
          is_internal: true,
          status: "sent",
          message_type: "text",
          sender_id: userData.user?.id,
          reply_to_message_id: replyToId,
        });
        
        if (error) throw error;
        
        // Note: Don't manually add to state - Realtime subscription will handle it
        // This prevents duplicate internal notes from appearing in the UI
      } else {
        // External message - route based on channel (WhatsApp vs Widget/Tray)
        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData.user?.id;
        
        const shouldTransfer = !wasPontualMode && (
          currentHandler === "ai" || 
          !assignedTo ||
          (assignedTo !== currentUserId)
        );
        
        if (shouldTransfer && currentUserId) {
          await transferHandler.mutateAsync({
            conversationId,
            handlerType: "human",
            assignedTo: currentUserId,
          });
        }
        
        // Check if this is a non-WhatsApp conversation
        if (isNonWhatsAppConversation) {
          // Widget/Tray: save directly to database, don't use Evolution API
          console.log('[Kanban] Widget/Tray channel - saving directly to DB');
          const { error: insertError } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              content: messageToSend,
              message_type: "text",
              is_from_me: true,
              sender_type: "human",
              sender_id: currentUserId,
              ai_generated: false,
              is_pontual: wasPontualMode,
              reply_to_message_id: replyToId,
              status: "sent", // Ensure status is set for proper Realtime detection
            });
          
          if (insertError) throw new Error('Falha ao salvar mensagem');
          
          // Update conversation timestamp
          await supabase
            .from("conversations")
            .update({ 
              last_message_at: new Date().toISOString(),
              archived_at: null,
              archived_reason: null,
            })
            .eq("id", conversationId);
          
          // Update optimistic message status
          setMessages(prev => prev.map(m => 
            m.id === tempId ? { ...m, status: "sent" } : m
          ));
        } else {
          // WhatsApp: use Evolution API
          const response = await supabase.functions.invoke("evolution-api", {
            body: {
              action: "send_message_async",
              conversationId,
              message: messageToSend,
              replyToWhatsAppMessageId: replyWhatsAppId,
              replyToMessageId: replyToId,
              isPontual: wasPontualMode,
            },
          });

          if (response.error) {
            throw new Error(response.error.message || "Falha ao enviar mensagem");
          }

          if (!response.data?.success) {
            throw new Error(response.data?.error || "Falha ao enviar mensagem");
          }
          
          // Update optimistic message with real data
          setMessages(prev => prev.map(m => 
            m.id === tempId 
              ? { ...m, id: response.data.messageId || tempId, status: "sent" }
              : m
          ));
        }
      }
    }).catch((error) => {
      console.error("Erro ao enviar mensagem:", error);
      // Update message to show error status
      setMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, status: "error" } : m
      ));
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        variant: "destructive",
      });
    });
  };

  const handleSendAudio = async (audioBlob: Blob) => {
    setIsSending(true);

    // Fail-fast: do not attempt to send empty/near-empty blobs
    if (!audioBlob || audioBlob.size < 1024) {
      toast({
        title: "Áudio inválido",
        description: "Áudio vazio/muito pequeno. Grave novamente antes de enviar.",
        variant: "destructive",
      });
      setIsSending(false);
      setIsRecordingAudio(false);
      return;
    }
    
    // Determine best file extension based on actual mime type
    const blobMimeType = audioBlob.type || "audio/webm";
    const extension = blobMimeType.includes("ogg") ? "ogg" 
      : blobMimeType.includes("mp4") ? "m4a" 
      : blobMimeType.includes("mpeg") ? "mp3" 
      : "webm";
    const fileName = `audio_${Date.now()}.${extension}`;
    
    // Normalize mimeType for WhatsApp compatibility
    // Evolution API/WhatsApp prefers audio/ogg for voice messages
    const normalizedMimeType = blobMimeType.includes("ogg") ? "audio/ogg" 
      : blobMimeType.includes("webm") ? "audio/webm"
      : blobMimeType.includes("mp4") ? "audio/mp4"
      : blobMimeType.includes("mpeg") ? "audio/mpeg"
      : "audio/ogg"; // Default to ogg for best compatibility

    try {
      const mediaBase64 = await blobToBase64(audioBlob);

      // Auto-assign to current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;
      
      const shouldTransfer = !isPontualMode && (
        currentHandler === "ai" || 
        !assignedTo ||
        (assignedTo !== currentUserId)
      );
      
      if (shouldTransfer && currentUserId) {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
          assignedTo: currentUserId,
        });
      }
      
      // Check if this is a non-WhatsApp conversation
      if (isNonWhatsAppConversation) {
        // CRITICAL: Chat Web/Widget não permite áudio (somente texto + imagens)
        throw new Error("Não é possível enviar áudio para o Chat Web. Use apenas texto ou imagens.");
      } else {
        // WhatsApp: send directly via Evolution API (async, no storage upload needed)
        console.log('[Kanban] WhatsApp channel - sending audio via Evolution API (async)', { 
          mimeType: normalizedMimeType, 
          originalType: blobMimeType,
          fileName 
        });
        
        // Create blob URL for optimistic preview
        const blobUrl = URL.createObjectURL(audioBlob);
        
        // Generate client ID that will be used both for optimistic message AND backend DB record
        const clientMessageId = crypto.randomUUID();
        const messageTimestamp = new Date().toISOString();
        
        // Add optimistic message immediately
        const optimisticMessage = {
          id: clientMessageId, // Use the same ID that backend will use
          content: "[Áudio]",
          created_at: messageTimestamp,
          is_from_me: true,
          sender_type: "human",
          ai_generated: false,
          message_type: "audio",
          media_url: blobUrl,
          media_mime_type: normalizedMimeType,
          status: "sending" as const,
          whatsapp_message_id: null,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_media_async", // Use async version
            conversationId,
            mediaBase64,
            mediaType: "audio",
            mimeType: normalizedMimeType,
            fileName,
            clientMessageId, // Send the same ID used for optimistic message
          },
        });
        
        if (response.error) {
          console.error('[Kanban] Evolution API error:', response.error);
          setMessages(prev => prev.map(m => 
            m.id === clientMessageId ? { ...m, status: "error" as const } : m
          ));
          throw new Error(response.error.message || "Falha ao enviar áudio");
        }
        
        if (!response.data?.success) {
          console.error('[Kanban] Evolution API failed:', response.data);
          setMessages(prev => prev.map(m => 
            m.id === clientMessageId ? { ...m, status: "error" as const } : m
          ));
          throw new Error(response.data?.error || "Falha ao enviar áudio");
        }
        
        // ID already matches - Realtime will update this same record with status "sent"
        console.log('[Kanban Audio] Async send successful, ID:', clientMessageId);
      }
      
      toast({ title: "Áudio enviado" });
    } catch (error) {
      console.error("Erro ao enviar áudio:", error);
      toast({
        title: "Erro ao enviar áudio",
        description: error instanceof Error ? error.message : "Falha ao enviar",
        variant: "destructive",
      });
    } finally {
      // CRITICAL: Always reset states in finally block to prevent UI freeze
      setIsSending(false);
      setIsRecordingAudio(false);
      
      // Restore focus to input after audio send completes
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mediaType: "image" | "document"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      const mediaBase64 = await blobToBase64(file);

      // Auto-assign to current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;
      
      const shouldTransfer = !isPontualMode && (
        currentHandler === "ai" || 
        !assignedTo ||
        (assignedTo !== currentUserId)
      );
      
      if (shouldTransfer && currentUserId) {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
          assignedTo: currentUserId,
        });
      }
      
      // Check if this is a non-WhatsApp conversation
      if (isNonWhatsAppConversation) {
        // Widget/Tray: upload to storage and save to database
        console.log('[Kanban] Widget/Tray channel - saving file directly to DB');
        
        const fileName = `${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(getChatMediaPath(fileName), file);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from("chat-media")
          .getPublicUrl(getChatMediaPath(fileName));
        
        const { error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            content: urlData.publicUrl,
            message_type: mediaType,
            is_from_me: true,
            sender_type: "human",
            sender_id: currentUserId,
            ai_generated: false,
            status: "sent",
          });
        
        if (insertError) throw insertError;
        
        await supabase
          .from("conversations")
          .update({ 
            last_message_at: new Date().toISOString(),
            archived_at: null,
            archived_reason: null,
          })
          .eq("id", conversationId);
      } else {
        // WhatsApp: send directly via Evolution API (async, no storage upload needed)
        console.log('[Kanban] WhatsApp channel - sending file via Evolution API (async)');
        
        // Create blob URL for optimistic preview
        const blobUrl = URL.createObjectURL(file);
        
        // Generate client ID that will be used both for optimistic message AND backend DB record
        const clientMessageId = crypto.randomUUID();
        const messageTimestamp = new Date().toISOString();
        const mediaTypeDisplay = mediaType === "image" ? "[Imagem]" : `[${file.name}]`;
        
        // Add optimistic message immediately
        const optimisticMessage = {
          id: clientMessageId, // Use the same ID that backend will use
          content: mediaTypeDisplay,
          created_at: messageTimestamp,
          is_from_me: true,
          sender_type: "human",
          ai_generated: false,
          message_type: mediaType,
          media_url: blobUrl,
          media_mime_type: file.type,
          status: "sending" as const,
          whatsapp_message_id: null,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_media_async", // Use async version
            conversationId,
            mediaBase64,
            mediaType: mediaType === "image" ? "image" : "document",
            mimeType: file.type || (mediaType === "image" ? "image/jpeg" : "application/octet-stream"),
            fileName: file.name,
            clientMessageId, // Send the same ID used for optimistic message
          },
        });
        
        if (response.error) {
          console.error('[Kanban] Evolution API error:', response.error);
          setMessages(prev => prev.map(m => 
            m.id === clientMessageId ? { ...m, status: "error" as const } : m
          ));
          throw new Error(response.error.message || "Falha ao enviar arquivo");
        }
        
        if (!response.data?.success) {
          console.error('[Kanban] Evolution API failed:', response.data);
          setMessages(prev => prev.map(m => 
            m.id === clientMessageId ? { ...m, status: "error" as const } : m
          ));
          throw new Error(response.data?.error || "Falha ao enviar arquivo");
        }
        
        // ID already matches - Realtime will update this same record with status "sent"
        console.log('[Kanban File] Async send successful, ID:', clientMessageId);
      }
      
      toast({ title: `${mediaType === "image" ? "Imagem" : "Documento"} enviado` });
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);
      toast({
        title: "Erro ao enviar arquivo",
        description: error instanceof Error ? error.message : "Falha ao enviar",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      if (event.target) event.target.value = "";
    }
  };

  // ===== CTRL+V PASTE HANDLERS =====
  const handleMediaPreviewClose = () => {
    if (mediaPreview.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }
    setMediaPreview({ open: false, file: null, mediaType: "image", previewUrl: null });
  };

  const handleMediaPreviewSend = async (caption: string) => {
    if (!mediaPreview.file) return;

    setIsSending(true);
    handleMediaPreviewClose();

    try {
      const mediaBase64 = await blobToBase64(mediaPreview.file);

      // Auto-assign to current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;
      
      const shouldTransfer = !isPontualMode && (
        currentHandler === "ai" || 
        !assignedTo ||
        (assignedTo !== currentUserId)
      );
      
      if (shouldTransfer && currentUserId) {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
          assignedTo: currentUserId,
        });
      }

      // Check if this is a non-WhatsApp conversation
      if (isNonWhatsAppConversation) {
        // Widget/Tray: upload to storage and save to database
        console.log('[Kanban] Widget/Tray channel - saving preview media directly to DB');
        
        const fileName = `${Date.now()}_${mediaPreview.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(getChatMediaPath(fileName), mediaPreview.file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("chat-media")
          .getPublicUrl(getChatMediaPath(fileName));
        
        const { error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            content: caption ? `${urlData.publicUrl}\n${caption}` : urlData.publicUrl,
            message_type: mediaPreview.mediaType,
            is_from_me: true,
            sender_type: "human",
            sender_id: currentUserId,
            ai_generated: false,
            status: "sent",
          });
        
        if (insertError) throw insertError;
        
        await supabase
          .from("conversations")
          .update({ 
            last_message_at: new Date().toISOString(),
            archived_at: null,
            archived_reason: null,
          })
          .eq("id", conversationId);
      } else {
        // WhatsApp: send directly via Evolution API (async, no storage upload needed)
        console.log('[Kanban] WhatsApp channel - sending media via Evolution API (async)');
        
        // Create blob URL for optimistic preview
        const blobUrl = mediaPreview.previewUrl || URL.createObjectURL(mediaPreview.file);
        
        // Generate client ID that will be used both for optimistic message AND backend DB record
        const clientMessageId = crypto.randomUUID();
        const messageTimestamp = new Date().toISOString();
        const mediaTypeDisplay = mediaPreview.mediaType === "image" ? "[Imagem]" 
          : mediaPreview.mediaType === "audio" ? "[Áudio]"
          : `[${mediaPreview.file.name}]`;
        
        // Add optimistic message immediately
        const optimisticMessage = {
          id: clientMessageId, // Use the same ID that backend will use
          content: caption || mediaTypeDisplay,
          created_at: messageTimestamp,
          is_from_me: true,
          sender_type: "human",
          ai_generated: false,
          message_type: mediaPreview.mediaType,
          media_url: blobUrl,
          media_mime_type: mediaPreview.file.type,
          status: "sending" as const,
          whatsapp_message_id: null,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_media_async", // Use async version
            conversationId,
            mediaBase64,
            mediaType: mediaPreview.mediaType,
            mimeType: mediaPreview.file.type || "application/octet-stream",
            fileName: mediaPreview.file.name,
            caption: caption || undefined,
            clientMessageId, // Send the same ID used for optimistic message
          },
        });

        if (response.error) {
          console.error('[Kanban] Evolution API error:', response.error);
          setMessages(prev => prev.map(m => 
            m.id === clientMessageId ? { ...m, status: "error" as const } : m
          ));
          throw new Error(response.error.message || "Falha ao enviar mídia");
        }
        
        if (!response.data?.success) {
          console.error('[Kanban] Evolution API failed:', response.data);
          setMessages(prev => prev.map(m => 
            m.id === clientMessageId ? { ...m, status: "error" as const } : m
          ));
          throw new Error(response.data?.error || "Falha ao enviar mídia");
        }
        
        // ID already matches - Realtime will update this same record with status "sent"
        console.log('[Kanban Preview] Async send successful, ID:', clientMessageId);
      }

      toast({ title: "Mídia enviada" });
    } catch (error) {
      console.error("Erro ao enviar mídia:", error);
      toast({
        title: "Erro ao enviar mídia",
        description: error instanceof Error ? error.message : "Falha ao enviar",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMedia = async (file: File, type: "audio" | "document") => {
    setIsSending(true);
    try {
      const mediaBase64 = await blobToBase64(file);

      // Auto-assign to current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;
      
      const shouldTransfer = !isPontualMode && (
        currentHandler === "ai" || 
        !assignedTo ||
        (assignedTo !== currentUserId)
      );
      
      if (shouldTransfer && currentUserId) {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
          assignedTo: currentUserId,
        });
      }

      // Check if this is a non-WhatsApp conversation
      if (isNonWhatsAppConversation) {
        // Widget/Tray: upload to storage and save to database
        console.log('[Kanban] Widget/Tray channel - saving media directly to DB');
        
        const fileName = `${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(getChatMediaPath(fileName), file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("chat-media")
          .getPublicUrl(getChatMediaPath(fileName));
        
        const { error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            content: urlData.publicUrl,
            message_type: type,
            is_from_me: true,
            sender_type: "human",
            sender_id: currentUserId,
            ai_generated: false,
            status: "sent",
          });
        
        if (insertError) throw insertError;
        
        await supabase
          .from("conversations")
          .update({ 
            last_message_at: new Date().toISOString(),
            archived_at: null,
            archived_reason: null,
          })
          .eq("id", conversationId);
      } else {
        // WhatsApp: send directly via Evolution API (no storage upload needed)
        console.log('[Kanban] WhatsApp channel - sending media via Evolution API');
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_media",
            conversationId,
            mediaBase64,
            mediaType: type,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
          },
        });

        if (response.error) {
          console.error('[Kanban] Evolution API error:', response.error);
          throw new Error(response.error.message || "Falha ao enviar arquivo");
        }
        
        if (!response.data?.success) {
          console.error('[Kanban] Evolution API failed:', response.data);
          throw new Error(response.data?.error || "Falha ao enviar arquivo");
        }
      }

      toast({ title: type === "audio" ? "Áudio enviado" : "Documento enviado" });
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);
      toast({
        title: "Erro ao enviar arquivo",
        description: error instanceof Error ? error.message : "Falha ao enviar",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const response = await supabase.functions.invoke("generate-summary", {
        body: { conversationId },
      });
      
      if (response.error) throw response.error;
      
      toast({ title: "Resumo gerado com sucesso" });
    } catch (error) {
      console.error("Erro ao gerar resumo:", error);
      toast({
        title: "Erro ao gerar resumo",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const openArchiveDialog = () => {
    setArchiveReason("resolved");
    setArchiveCustomReason("");
    setArchiveNextResponsible(null);
    setArchiveNextResponsibleType(null);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    try {
      // Determine the reason text
      const reasonText = archiveReason === "other" && archiveCustomReason.trim()
        ? archiveCustomReason.trim()
        : ARCHIVE_REASONS.find((r) => r.value === archiveReason)?.label || archiveReason;

      // Get current user for tracking
      const { data: userData } = await supabase.auth.getUser();
      
      // Build the update payload - use archived_at column
      const updatePayload: any = {
        id: conversationId,
        archived_at: new Date().toISOString(),
        archived_reason: reasonText,
        archived_by: userData.user?.id, // Track who archived
      };

      // If next responsible is set
      if (archiveNextResponsible && archiveNextResponsible !== "none") {
        updatePayload.archived_next_responsible_id = archiveNextResponsible;
        updatePayload.archived_next_responsible_type = archiveNextResponsibleType;
        
        if (archiveNextResponsibleType === "ai") {
          updatePayload.current_automation_id = archiveNextResponsible;
          updatePayload.current_handler = "ai";
        } else {
          updatePayload.assigned_to = archiveNextResponsible;
          updatePayload.current_handler = "human";
        }
      }

      await updateConversation.mutateAsync(updatePayload);

      toast({ title: "Conversa arquivada" });
      setArchiveDialogOpen(false);
      onClose();
    } catch (error) {
      console.error("Error archiving conversation:", error);
      toast({
        title: "Erro ao arquivar",
        description: "Não foi possível arquivar a conversa.",
        variant: "destructive",
      });
    }
  };

  const handleExpand = () => {
    navigate(`/conversations?id=${conversationId}`);
    onClose();
  };

  // Start inline name editing
  const handleStartInlineEdit = () => {
    setEditingName(contactName || "");
    setIsEditingNameInline(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  // Cancel inline editing
  const handleCancelInlineEdit = () => {
    setIsEditingNameInline(false);
    setEditingName(contactName || "");
  };

  // Save inline name
  const handleSaveInlineName = async () => {
    if (!editingName.trim()) {
      handleCancelInlineEdit();
      return;
    }
    
    try {
      // Update conversation contact_name
      await updateConversation.mutateAsync({
        id: conversationId,
        contact_name: editingName.trim(),
      });
      
      // Also update linked client name if exists
      if (clientId) {
        await updateClient.mutateAsync({
          id: clientId,
          name: editingName.trim(),
        });
      }
      
      toast({ title: "Nome atualizado" });
      setIsEditingNameInline(false);
    } catch (error) {
      toast({
        title: "Erro ao atualizar nome",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (statusId: string) => {
    if (!clientId) {
      toast({
        title: "Sem cliente vinculado",
        description: "Esta conversa não tem um cliente vinculado.",
        variant: "destructive",
      });
      return;
    }
    
    // Get status names for logging
    const fromStatusName = currentStatusObj?.name || "Sem status";
    const toStatus = customStatuses.find(s => s.id === statusId);
    const newStatusId = currentStatusObj?.id === statusId ? null : statusId;
    const toStatusName = newStatusId === null ? "Sem status" : (toStatus?.name || "Desconhecido");
    
    updateClientStatus.mutate({ clientId, statusId: newStatusId }, {
      onSuccess: () => {
        // Log status change action for chat activity
        if (fromStatusName !== toStatusName) {
          createAction.mutate({
            client_id: clientId,
            action_type: "status_change",
            from_value: fromStatusName,
            to_value: toStatusName,
            description: `alterou o status de ${fromStatusName} para ${toStatusName}`,
          });
        }
        toast({ title: "Status atualizado" });
        setStatusOpen(false);
      },
    });
  };

  const handleTagToggle = async (tag: TagItem) => {
    if (!clientId) {
      toast({
        title: "Sem cliente vinculado",
        description: "Esta conversa não tem um cliente vinculado.",
        variant: "destructive",
      });
      return;
    }
    
    const hasTag = clientTagIds.includes(tag.id);
    
    if (hasTag) {
      // Remove tag from client_tags table
      await supabase
        .from("client_tags")
        .delete()
        .eq("client_id", clientId)
        .eq("tag_id", tag.id);
      
      // Log tag removal action for chat activity
      createAction.mutate({
        client_id: clientId,
        action_type: "tag_remove",
        from_value: tag.name,
        description: `removeu a tag ${tag.name}`,
      });
      
      // Optimistic update
      queryClient.setQueryData<string[]>(["client_tags", clientId], (prev) => {
        const current = prev || [];
        return current.filter((id) => id !== tag.id);
      });
    } else {
      if (clientTagIds.length >= 4) {
        toast({ title: "Máximo de 4 tags" });
        return;
      }
      
      // Add tag to client_tags table
      await supabase.from("client_tags").insert({
        client_id: clientId,
        tag_id: tag.id,
      });
      
      // Log tag addition action for chat activity
      createAction.mutate({
        client_id: clientId,
        action_type: "tag_add",
        to_value: tag.name,
        description: `adicionou a tag ${tag.name}`,
      });
      
      // Optimistic update
      queryClient.setQueryData<string[]>(["client_tags", clientId], (prev) => {
        const current = prev || [];
        return current.includes(tag.id) ? current : [...current, tag.id];
      });
    }
    
    // Invalidate queries to sync all components
    queryClient.invalidateQueries({ queryKey: ["client_tags", clientId] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    
    toast({ title: "Tags atualizadas" });
  };

  const handleDepartmentChange = (deptId: string) => {
    const newDeptId = currentDepartment?.id === deptId ? null : deptId;
    updateConversationDepartment.mutate({ conversationId, departmentId: newDeptId, clientId }, {
      onSuccess: () => {
        toast({ title: "Departamento atualizado" });
        setDepartmentOpen(false);
      },
    });
  };

  const handleTransferTo = (
    type: 'ai' | 'human',
    memberId?: string,
    automationId?: string
  ) => {
    transferHandler.mutate({
      conversationId,
      handlerType: type,
      assignedTo: memberId,
      automationId: type === 'ai' ? automationId || null : null,
    }, {
      onSuccess: () => {
        toast({
          title: type === 'ai' ? "Transferido para IA" : "Transferido para atendente",
          description: type === 'ai' ? `IA ativa: ${automations.find(a => a.id === automationId)?.name || 'Selecionada'}` : undefined,
        });
        setTransferOpen(false);
        setTransferSearch("");
      },
    });
  };

  const getMessageIcon = (type?: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      case "audio":
        return <Mic className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "document":
        return <FileText className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const formatTime = (dateStr: string) => {
    return format(new Date(dateStr), "HH:mm dd/MM", { locale: ptBR });
  };

  const renderStatusIcon = (status?: string, isFromMe?: boolean) => {
    if (!isFromMe) return null;
    switch (status) {
      case "sending":
        return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
      case "sent":
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case "read":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case "error":
        return <X className="h-3 w-3 text-destructive" />;
      default:
        // Default to delivered (2 checks) if no status is specified
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    }
  };

  // Filtered members for transfer search
  const filteredMembers = members.filter(m => 
    m.full_name.toLowerCase().includes(transferSearch.toLowerCase())
  );

  // Filtered automations for transfer search
  const filteredAutomations = automations.filter(a => 
    a.name.toLowerCase().includes(transferSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        {/* Top row: Avatar, name, actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-primary/20">
              {avatarUrl ? (
                <AvatarImage 
                  src={avatarUrl} 
                  alt={contactName || "Avatar"} 
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                {contactName?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1">
                {isEditingNameInline ? (
                  <>
                    <Input
                      ref={nameInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveInlineName();
                        if (e.key === "Escape") handleCancelInlineEdit();
                      }}
                      onBlur={handleSaveInlineName}
                      className="h-7 w-40 text-sm font-semibold"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleSaveInlineName}
                    >
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleCancelInlineEdit}
                    >
                      <X className="h-3 w-3 text-red-500" />
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 
                      className="font-semibold cursor-pointer hover:text-primary transition-colors"
                      onClick={handleStartInlineEdit}
                      title="Clique para editar"
                    >
                      {contactName || contactPhone}
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={handleStartInlineEdit}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{contactPhone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Scheduled Follow-up Indicator */}
            {conversationId && (
              <ScheduledFollowUpIndicator
                conversationId={conversationId}
                variant="badge"
                className="mr-1"
              />
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={openArchiveDialog}
              title="Arquivar"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleExpand}
              title="Expandir conversa"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Second row: Properties - Status, Tags, Department, Transfer */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Selector */}
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5">
                <CircleDot className="h-3 w-3" />
                {currentStatusObj ? (
                  <Badge 
                    variant="outline" 
                    className="text-xs px-1.5 py-0"
                    style={{ 
                      backgroundColor: `${currentStatusObj.color}20`,
                      borderColor: currentStatusObj.color,
                      color: currentStatusObj.color
                    }}
                  >
                    {currentStatusObj.name}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Status</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {customStatuses.filter(s => s.is_active).map(status => (
                  <Button
                    key={status.id}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full justify-start gap-2",
                      currentStatusObj?.id === status.id && "bg-muted"
                    )}
                    onClick={() => handleStatusChange(status.id)}
                  >
                    <div 
                      className="h-3 w-3 rounded-full" 
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                    {currentStatusObj?.id === status.id && (
                      <Check className="h-3 w-3 ml-auto" />
                    )}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Tags Selector */}
          <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5">
                <Tag className="h-3 w-3" />
                {currentTags.length > 0 ? (
                  <div className="flex gap-1">
                    {currentTags.slice(0, 2).map(tag => (
                      <Badge 
                        key={tag.id}
                        variant="outline" 
                        className="text-xs px-1 py-0"
                        style={{ 
                          backgroundColor: `${tag.color}20`,
                          borderColor: tag.color,
                          color: tag.color
                        }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {currentTags.length > 2 && (
                      <span className="text-xs text-muted-foreground">+{currentTags.length - 2}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Tags</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {tags.map(tag => {
                  const isSelected = currentTags.some(t => t.id === tag.id);
                  return (
                    <Button
                      key={tag.id}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start gap-2",
                        isSelected && "bg-muted"
                      )}
                      onClick={() => handleTagToggle(tag)}
                    >
                      <div 
                        className="h-3 w-3 rounded-full" 
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                      {isSelected && <Check className="h-3 w-3 ml-auto" />}
                    </Button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Department Selector */}
          <Popover open={departmentOpen} onOpenChange={setDepartmentOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5">
                <Folder className="h-3 w-3" />
                {currentDepartment ? (
                  <Badge 
                    variant="outline" 
                    className="text-xs px-1.5 py-0"
                    style={{ 
                      backgroundColor: `${currentDepartment.color}20`,
                      borderColor: currentDepartment.color,
                      color: currentDepartment.color
                    }}
                  >
                    {currentDepartment.name}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Departamento</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {departments.filter(d => d.is_active).map(dept => (
                  <Button
                    key={dept.id}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full justify-start gap-2",
                      currentDepartment?.id === dept.id && "bg-muted"
                    )}
                    onClick={() => handleDepartmentChange(dept.id)}
                  >
                    <Folder 
                      className="h-3 w-3" 
                      style={{ color: dept.color }}
                    />
                    {dept.name}
                    {currentDepartment?.id === dept.id && (
                      <Check className="h-3 w-3 ml-auto" />
                    )}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Transfer Selector */}
          <Popover open={transferOpen} onOpenChange={setTransferOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5">
                <ArrowRightLeft className="h-3 w-3" />
                <span className="text-xs">
                  {currentHandler === 'ai'
                    ? `IA: ${resolvedAutomationName || '—'}`
                    : `Humano: ${assignedProfile?.full_name || '—'}`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Buscar..." 
                  value={transferSearch}
                  onValueChange={setTransferSearch}
                />
                <CommandList>
                  <CommandEmpty>Nenhum resultado.</CommandEmpty>
                  
                  {filteredAutomations.length > 0 && (
                    <CommandGroup heading="IA">
                      {filteredAutomations.map(automation => (
                        <CommandItem
                          key={automation.id}
                          value={`ai-${automation.name}`}
                          onSelect={() => handleTransferTo("ai", undefined, automation.id)}
                          className="flex items-center gap-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <Zap className="h-3 w-3 text-purple-600" />
                          </div>
                          <span className="text-sm">{automation.name}</span>
                          {currentHandler === "ai" && currentAutomationId === automation.id && (
                            <Check className="h-3 w-3 ml-auto text-primary" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  
                  <CommandGroup heading="Humano">
                    {filteredMembers.map(member => (
                      <CommandItem
                        key={member.id}
                        value={member.full_name}
                        onSelect={() => handleTransferTo("human", member.id)}
                        className="flex items-center gap-2"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700">
                            {member.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{member.full_name}</span>
                        {currentHandler === "human" && assignedProfile?.full_name === member.full_name && (
                          <Check className="h-3 w-3 ml-auto text-primary" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Archived Conversation Banner - Compact version */}
      {archivedAt && (
        <div className="bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 p-2 mx-3 my-1.5 rounded">
          <div className="flex items-center gap-1.5">
            <Archive className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            <span className="text-xs font-medium text-orange-800 dark:text-orange-200">
              Conversa arquivada
            </span>
          </div>
          <div className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
            {archivedByName && `Por: ${archivedByName} • `}
            Em: {new Date(archivedAt).toLocaleString('pt-BR', { 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </div>
          {archivedReason && (
            <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              Motivo: {archivedReason}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea 
        className="flex-1 min-h-0 p-4" 
        ref={scrollRef}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="space-y-3">
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                <span className="text-xs text-muted-foreground">Carregando mais mensagens...</span>
              </div>
            )}
            {hasMoreMessages && !isLoadingMore && (
              <div className="text-center py-2">
                <span className="text-xs text-muted-foreground">↑ Role para cima para carregar mais</span>
              </div>
            )}
            {timelineItems.map((item, index) => {
              const prevItem = index > 0 ? timelineItems[index - 1] : null;
              // Get date from the correct field based on item type
              const getItemDate = (timelineItem: { type: string; data: ActivityItem | PaginatedMessage } | null): string | Date | null => {
                if (!timelineItem) return null;
                if (timelineItem.type === 'activity') {
                  return (timelineItem.data as ActivityItem).timestamp;
                }
                return (timelineItem.data as PaginatedMessage).created_at;
              };
              const currentDate = getItemDate(item);
              const prevDate = getItemDate(prevItem);
              const showDateSep = shouldShowDateSeparator(currentDate!, prevDate);
              
              if (item.type === 'activity') {
                return (
                  <React.Fragment key={item.data.id}>
                    {showDateSep && currentDate && <DateSeparator date={new Date(currentDate)} />}
                    <InlineActivityBadge activity={item.data} />
                  </React.Fragment>
                );
              }
              
              const msg = item.data;

              // Use _clientTempId for stable key during reconciliation
              const stableKey = (msg as PaginatedMessage)._clientTempId || msg.id;

              return (
                <React.Fragment key={stableKey}>
                  {showDateSep && currentDate && <DateSeparator date={new Date(currentDate)} />}
                  <div data-message-id={msg.id}>
                    <MessageBubble
                      id={msg.id}
                      content={msg.content}
                      createdAt={msg.created_at}
                      isFromMe={msg.is_from_me}
                      senderType={msg.sender_type || "user"}
                      aiGenerated={msg.ai_generated || false}
                      mediaUrl={msg.media_url}
                      mediaMimeType={msg.media_mime_type}
                      messageType={msg.message_type}
                      status={(msg.status || "sent") as MessageStatus}
                      readAt={msg.read_at}
                      whatsappMessageId={msg.whatsapp_message_id}
                      conversationId={conversationId}
                      remoteJid={remoteJid || undefined}
                      replyTo={msg.reply_to}
                      isInternal={msg.is_internal}
                      isPontual={msg.is_pontual}
                      aiAgentName={msg.ai_agent_name}
                      isRevoked={msg.is_revoked}
                      isStarred={msg.is_starred}
                      myReaction={msg.my_reaction}
                      clientReaction={msg.client_reaction}
                      onReply={handleReply}
                      onScrollToMessage={scrollToMessage}
                      onToggleStar={handleToggleStar}
                      onDelete={handleDeleteMessage}
                      onDownloadMedia={handleDownloadMedia}
                      onReact={handleReactToMessage}
                      onAddNote={handleOpenNoteDialog}
                    />
                  </div>
                </React.Fragment>
              );
            })}
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* New Messages Indicator */}
      {!isAtBottom && unseenMessageCount > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Button
            variant="default"
            size="sm"
            className="shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            onClick={() => {
              setUnseenMessageCount(0);
              scrollToBottomOnce();
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground"></span>
            </span>
            {unseenMessageCount} nova{unseenMessageCount > 1 ? "s" : ""} mensagem{unseenMessageCount > 1 ? "s" : ""}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, "image")}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        className="hidden"
        onChange={(e) => handleFileSelect(e, "document")}
      />

      {/* Input Area */}
      <div className={cn(
        "p-4 border-t border-border space-y-3",
        isPontualMode && "border-t-2 border-t-amber-500",
        isInternalMode && "border-t-2 border-t-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10"
      )}>
        {/* Pontual Mode Indicator */}
        {isPontualMode && (
          <div className="w-full flex items-center justify-between bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-md text-sm">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Intervenção pontual ativa
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setIsPontualMode(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* Internal Mode Indicator */}
        {isInternalMode && (
          <div className="w-full flex items-center justify-between bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-md text-sm">
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Mensagem interna (não vai para o cliente)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setIsInternalMode(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* Reply Preview */}
        <ReplyPreview
          replyToMessage={replyToMessage ? {
            id: replyToMessage.id,
            content: replyToMessage.content || null,
            is_from_me: replyToMessage.is_from_me,
            sender_type: replyToMessage.sender_type || "human",
          } : null}
          onCancelReply={() => setReplyToMessage(null)}
        />

        {/* Audio Recorder - only for WhatsApp conversations */}
        {isRecordingAudio && isWhatsAppConversation ? (
          <AudioRecorder
            onSend={handleSendAudio}
            onCancel={() => setIsRecordingAudio(false)}
            disabled={isSending}
            autoStart={true}
          />
        ) : (
          <>
            {/* Action buttons row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* Plus menu */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="start">
                    <div className="space-y-1">
                      {isWhatsAppConversation && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => imageInputRef.current?.click()}
                          >
                            <ImageIcon className="h-4 w-4 mr-2" />
                            Enviar imagem
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => documentInputRef.current?.click()}
                          >
                            <Paperclip className="h-4 w-4 mr-2" />
                            Enviar documento
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary}
                      >
                        {isGeneratingSummary ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Gerar resumo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start",
                          isInternalMode && "bg-yellow-100 dark:bg-yellow-900/30"
                        )}
                        onClick={() => setIsInternalMode(!isInternalMode)}
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Mensagem interna
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Audio button - only show for WhatsApp conversations */}
                {isWhatsAppConversation && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsRecordingAudio(true)}
                    disabled={isInternalMode}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                )}

                {/* Internal message button */}
                <Button
                  variant={isInternalMode ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    isInternalMode 
                      ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                      : "text-muted-foreground hover:text-yellow-500"
                  )}
                  onClick={() => setIsInternalMode(!isInternalMode)}
                  title="Mensagem interna"
                >
                  <Lock className="h-4 w-4" />
                </Button>

                {/* Pontual intervention button - only when AI is handling */}
                {currentHandler === "ai" && !isInternalMode && (
                  <Button
                    variant={isPontualMode ? "default" : "ghost"}
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      isPontualMode 
                        ? "bg-amber-500 hover:bg-amber-600 text-white" 
                        : "text-muted-foreground hover:text-amber-500"
                    )}
                    onClick={() => setIsPontualMode(!isPontualMode)}
                    title="Intervenção pontual"
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {contactPhone?.slice(-4) || "----"}
              </div>
            </div>

            {/* Message input */}
            <div className="flex gap-2">
              <AutoResizeTextarea
                ref={textareaRef}
                placeholder={isInternalMode ? "Mensagem interna..." : "Digite sua mensagem..."}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                minRows={1}
                maxRows={5}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                onPaste={async (e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;

                  for (let i = 0; i < items.length; i++) {
                    const item = items[i];

                    // Handle image paste
                    if (item.type.startsWith("image/")) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file && !isInternalMode) {
                        const previewUrl = URL.createObjectURL(file);
                        setMediaPreview({
                          open: true,
                          file,
                          mediaType: "image",
                          previewUrl,
                        });
                      }
                      return;
                    }

                    // Handle file paste (video, audio, document)
                    if (item.kind === "file" && !item.type.startsWith("image/")) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file && !isInternalMode) {
                        const fileType = file.type;
                        if (fileType.startsWith("video/")) {
                          const previewUrl = URL.createObjectURL(file);
                          setMediaPreview({
                            open: true,
                            file,
                            mediaType: "video",
                            previewUrl,
                          });
                        } else if (fileType.startsWith("audio/")) {
                          handleSendMedia(file, "audio");
                        } else {
                          handleSendMedia(file, "document");
                        }
                      }
                      return;
                    }
                  }
                  // Text paste is handled by default browser behavior
                }}
                className={cn(
                  isInternalMode && "border-yellow-400"
                )}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                className="h-auto"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {/* Handler info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
          {currentHandler === "ai" ? (
              <>
                <Bot className="h-3 w-3 text-purple-500" />
                <span>IA · {resolvedAutomationName || "Assistente"}</span>
              </>
            ) : (
              <>
                <User className="h-3 w-3 text-green-500" />
                <span>{assignedProfile?.full_name || "Atendente"}</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              transferHandler.mutate({
                conversationId,
                handlerType: currentHandler === "ai" ? "human" : "ai",
              });
            }}
          >
            {currentHandler === "ai" ? "Assumir atendimento" : "Devolver para IA"}
          </Button>
        </div>
      </div>

      {/* Inline name editing is now done in header - dialog removed */}

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Arquivamento do chat</DialogTitle>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Selecione o motivo do arquivamento e o próximo responsável.
            </p>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Archive Reason */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Motivo do arquivamento</Label>
              <div className="space-y-2">
                {ARCHIVE_REASONS.map((reason) => (
                  <div
                    key={reason.value}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      archiveReason === reason.value
                        ? "bg-muted"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => setArchiveReason(reason.value)}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        archiveReason === reason.value
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      )}
                    >
                      {archiveReason === reason.value && (
                        <div className="w-2 h-2 bg-primary-foreground rounded-full" />
                      )}
                    </div>
                    <span className="text-sm">{reason.label}</span>
                  </div>
                ))}
              </div>
              {/* Custom reason text field when "Outros" is selected */}
              {archiveReason === "other" && (
                <Input
                  placeholder="Digite o motivo..."
                  value={archiveCustomReason}
                  onChange={(e) => setArchiveCustomReason(e.target.value)}
                  className="mt-2"
                  autoFocus
                />
              )}
            </div>

            {/* Next Responsible */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Próximo responsável</Label>
              <Select
                value={archiveNextResponsible ? `${archiveNextResponsibleType}:${archiveNextResponsible}` : "none"}
                onValueChange={(v) => {
                  if (v === "none") {
                    setArchiveNextResponsible(null);
                    setArchiveNextResponsibleType(null);
                  } else {
                    const [type, id] = v.split(":");
                    setArchiveNextResponsibleType(type as "human" | "ai");
                    setArchiveNextResponsible(id);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Selecionar responsável" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Nenhum responsável</span>
                  </SelectItem>
                  {/* AI Agents */}
                  {automations.filter(a => a.is_active).length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Agentes IA
                      </div>
                      {automations.filter(a => a.is_active).map((agent) => (
                        <SelectItem key={`ai:${agent.id}`} value={`ai:${agent.id}`}>
                          <div className="flex items-center gap-2">
                            <Bot className="h-3 w-3 text-purple-500" />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {/* Human Team Members */}
                  {members.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Atendentes
                      </div>
                      {members.map((member) => (
                        <SelectItem key={`human:${member.id}`} value={`human:${member.id}`}>
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-green-500" />
                            {member.full_name}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Este será o responsável quando o lead retornar. (Opcional)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setArchiveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleArchive}
            >
              Arquivar chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Preview Dialog (for Ctrl+V paste) */}
      <MediaPreviewDialog
        open={mediaPreview.open}
        onClose={handleMediaPreviewClose}
        onSend={handleMediaPreviewSend}
        file={mediaPreview.file}
        mediaType={mediaPreview.mediaType}
        previewUrl={mediaPreview.previewUrl}
        isSending={isSending}
      />

      {/* Add Note Dialog */}
      <AddNoteDialog
        open={addNoteDialogOpen}
        onOpenChange={setAddNoteDialogOpen}
        originalMessageContent={noteTargetMessage?.content || ""}
        onSave={handleSaveNote}
      />
    </div>
  );
}
