import { useState, useEffect, useRef, useMemo, useReducer, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useConversations } from "@/hooks/useConversations";
import { useClients } from "@/hooks/useClients";
import { ScheduledFollowUpIndicator } from "@/components/conversations/ScheduledFollowUpIndicator";
import { InlineActivityBadge } from "@/components/conversations/InlineActivityBadge";
import { useInlineActivities } from "@/hooks/useInlineActivities";
import { useMessagesWithPagination, PaginatedMessage } from "@/hooks/useMessagesWithPagination";

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
  ChevronRight
} from "lucide-react";
import { getCachedAudio, setCachedAudio, cleanupOldCache } from "@/lib/audioCache";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { AudioRecorder } from "@/components/conversations/AudioRecorder";
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

  const needsDecryption = src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

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
  currentHandler: 'ai' | 'human';
  /** The specific AI agent assigned to this conversation (source of truth for prompt selection) */
  currentAutomationId?: string | null;
  /** The name of current automation from backend join - use this for display (source of truth) */
  currentAutomationName?: string | null;
  assignedProfile?: { full_name: string } | null;
  clientId?: string | null;
  clientStatus?: string | null;
  conversationTags?: string[] | null;
  departmentId?: string | null;
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
  currentHandler,
  currentAutomationId,
  currentAutomationName,
  assignedProfile,
  clientId,
  clientStatus,
  conversationTags,
  departmentId,
  customStatuses,
  tags,
  departments,
  members,
  automations,
  onClose,
}: KanbanChatPanelProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { transferHandler, updateConversation, updateConversationDepartment, updateConversationTags } = useConversations();
  const { updateClientStatus, updateClient } = useClients();
  
  // Get inline activities for this conversation
  const { activities: inlineActivities } = useInlineActivities(conversationId, clientId || null);

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
    initialBatchSize: 50,
    loadMoreBatchSize: 30,
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

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

  // Edit name state
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editingName, setEditingName] = useState(contactName || "");
  
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

  // Get current status
  const currentStatusObj = customStatuses.find(s => s.id === clientStatus);
  
  // Get current department
  const currentDepartment = departments.find(d => d.id === departmentId);
  
  // Get current tags
  const currentTags = (conversationTags || [])
    .map(tagName => tags.find(t => t.name === tagName || t.id === tagName))
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
    
    // Sort by timestamp (ascending for chronological order)
    return items.sort((a, b) => {
      const aTime = a.type === 'message' 
        ? new Date(a.data.created_at).getTime() 
        : a.data.timestamp.getTime();
      const bTime = b.type === 'message' 
        ? new Date(b.data.created_at).getTime() 
        : b.data.timestamp.getTime();
      return aTime - bTime;
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
  const hasScrolledInitialRef = useRef<string | null>(null); // Track which conversation was scrolled

  // Auto-scroll: Apenas na carga inicial (primeira abertura da conversa)
  useEffect(() => {
    // Não fazer nada se ainda está carregando
    if (isLoading) return;
    if (messages.length === 0) return;
    if (!conversationId) return;

    // Se já fez o scroll para esta conversa, não fazer de novo
    if (hasScrolledInitialRef.current === conversationId) return;

    // Marcar que já fez o scroll inicial para esta conversa
    hasScrolledInitialRef.current = conversationId;

    // Aguardar múltiplos frames para garantir que o DOM está completamente renderizado
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      });
    });
  }, [isLoading, messages.length, conversationId]);

  // Update editing name when contactName changes
  useEffect(() => {
    setEditingName(contactName || "");
  }, [contactName]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || isSending) return;

    const wasPontualMode = isPontualMode;
    const wasInternalMode = isInternalMode;
    const messageToSend = messageInput.trim();
    setMessageInput("");
    setIsSending(true);
    setIsPontualMode(false);

    // Optimistic update
    const tempId = crypto.randomUUID();
    const newMessage: Message = {
      id: tempId,
      content: messageToSend,
      created_at: new Date().toISOString(),
      is_from_me: true,
      sender_type: "human",
      ai_generated: false,
      status: wasInternalMode ? "sent" : "sending",
      is_internal: wasInternalMode,
    };
    setMessages((prev) => [...prev, newMessage]);

    try {
      if (wasInternalMode) {
        // Internal message - save directly to database
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
        });
        
        if (error) throw error;
        
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
      } else {
        // External message - send via WhatsApp
        if (!wasPontualMode && currentHandler === "ai") {
          await transferHandler.mutateAsync({
            conversationId,
            handlerType: "human",
          });
        }

        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_message_async",
            conversationId,
            message: messageToSend,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || "Falha ao enviar mensagem");
        }

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Falha ao enviar mensagem");
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, id: response.data.messageId || tempId, status: "sent" }
              : m
          )
        );
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
      );
      setMessageInput(messageToSend);
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAudio = async (audioBlob: Blob) => {
    setIsSending(true);
    try {
      const fileName = `audio_${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(`${conversationId}/${fileName}`, audioBlob);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(`${conversationId}/${fileName}`);
      
      // Transfer to human if AI is handling and not pontual mode
      if (!isPontualMode && currentHandler === "ai") {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
        });
      }
      
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId,
          mediaUrl: urlData.publicUrl,
          mediaType: "audio",
        },
      });
      
      if (response.error) throw response.error;
      
      toast({ title: "Áudio enviado" });
      setIsRecordingAudio(false);
    } catch (error) {
      console.error("Erro ao enviar áudio:", error);
      toast({
        title: "Erro ao enviar áudio",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
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
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(`${conversationId}/${fileName}`, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(`${conversationId}/${fileName}`);
      
      // Transfer to human if AI is handling and not pontual mode
      if (!isPontualMode && currentHandler === "ai") {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
        });
      }
      
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId,
          mediaUrl: urlData.publicUrl,
          mediaType: mediaType === "image" ? "image" : "document",
          fileName: file.name,
        },
      });
      
      if (response.error) throw response.error;
      
      toast({ title: `${mediaType === "image" ? "Imagem" : "Documento"} enviado` });
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);
      toast({
        title: "Erro ao enviar arquivo",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      if (event.target) event.target.value = "";
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

      // Build the update payload - use archived_at column
      const updatePayload: any = {
        id: conversationId,
        archived_at: new Date().toISOString(),
        archived_reason: reasonText,
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

  const handleSaveName = async () => {
    if (!editingName.trim()) return;
    
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
      setEditNameOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao atualizar nome",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = (statusId: string) => {
    if (!clientId) {
      toast({
        title: "Sem cliente vinculado",
        description: "Esta conversa não tem um cliente vinculado.",
        variant: "destructive",
      });
      return;
    }
    
    const newStatusId = currentStatusObj?.id === statusId ? null : statusId;
    updateClientStatus.mutate({ clientId, statusId: newStatusId }, {
      onSuccess: () => {
        toast({ title: "Status atualizado" });
        setStatusOpen(false);
      },
    });
  };

  const handleTagToggle = (tag: TagItem) => {
    const currentTagNames = conversationTags || [];
    const hasTag = currentTagNames.includes(tag.name);
    
    let newTags: string[];
    if (hasTag) {
      newTags = currentTagNames.filter(t => t !== tag.name);
    } else {
      if (currentTagNames.length >= 4) {
        toast({ title: "Máximo de 4 tags" });
        return;
      }
      newTags = [...currentTagNames, tag.name];
    }
    
    updateConversationTags.mutate({ conversationId, tags: newTags }, {
      onSuccess: () => toast({ title: "Tags atualizadas" }),
    });
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
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${contactName || contactPhone}`}
              />
              <AvatarFallback>
                {contactName?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1">
                <h3 className="font-semibold">{contactName || contactPhone}</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => {
                    setEditingName(contactName || "");
                    setEditNameOpen(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
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
            {timelineItems.map((item) => {
              if (item.type === 'activity') {
                return <InlineActivityBadge key={item.data.id} activity={item.data} />;
              }
              
              const msg = item.data;
              const isFromMe = msg.is_from_me;
              const isInternal = msg.is_internal;
              const isAI = msg.ai_generated;
              const msgIcon = getMessageIcon(msg.message_type);

              return (
                <div
                  key={msg.id}
                  data-message-id={msg.id}
                  className={cn(
                    "flex",
                    isFromMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm break-words overflow-wrap-anywhere",
                      isInternal
                        ? "bg-yellow-100 text-yellow-900 rounded-br-md dark:bg-yellow-900/40 dark:text-yellow-100 border border-yellow-300 dark:border-yellow-700"
                        : isFromMe
                          ? isAI
                            ? "bg-purple-500 text-white rounded-br-md dark:bg-purple-600"
                            : "bg-green-500 text-white rounded-br-md dark:bg-green-600"
                          : "bg-muted rounded-bl-md"
                    )}
                  >
                    {/* Sender indicator */}
                    {isInternal && (
                      <div className="flex items-center gap-1 text-xs text-yellow-700 mb-1 dark:text-yellow-300">
                        <Lock className="h-3 w-3" />
                        Interno
                      </div>
                    )}
                    
                    {isAI && isFromMe && !isInternal && (
                      <div className="flex items-center gap-1 text-xs text-white/80 mb-1">
                        <Bot className="h-3 w-3" />
                        {msg.ai_agent_name || "Assistente IA"}
                      </div>
                    )}

                    {/* Audio player */}
                    {msg.message_type === 'audio' && msg.media_url && (
                      <KanbanAudioPlayer
                        src={msg.media_url}
                        mimeType={msg.media_mime_type || undefined}
                        whatsappMessageId={msg.whatsapp_message_id || undefined}
                        conversationId={conversationId}
                        isFromMe={isFromMe}
                      />
                    )}

                    {/* Image viewer */}
                    {msg.message_type === 'image' && (msg.media_url || msg.whatsapp_message_id) && (
                      <KanbanImageViewer
                        src={msg.media_url ?? null}
                        mimeType={msg.media_mime_type || undefined}
                        whatsappMessageId={msg.whatsapp_message_id || undefined}
                        conversationId={conversationId}
                      />
                    )}

                    {/* Video player */}
                    {msg.message_type === 'video' && msg.media_url && (
                      <KanbanVideoPlayer
                        src={msg.media_url}
                        mimeType={msg.media_mime_type || undefined}
                        whatsappMessageId={msg.whatsapp_message_id || undefined}
                        conversationId={conversationId}
                      />
                    )}

                    {/* Document viewer */}
                    {msg.message_type === 'document' && (msg.media_url || msg.whatsapp_message_id) && (
                      <KanbanDocumentViewer
                        src={msg.media_url ?? null}
                        mimeType={msg.media_mime_type || undefined}
                        whatsappMessageId={msg.whatsapp_message_id || undefined}
                        conversationId={conversationId}
                        isFromMe={isFromMe}
                        content={msg.content}
                      />
                    )}

                    {/* Media type indicator for other types (sticker, etc) */}
                    {msgIcon && !['audio', 'image', 'video', 'document'].includes(msg.message_type || '') && (
                      <div className={cn(
                        "flex items-center gap-1 mb-1",
                        isFromMe && !isInternal ? "text-white/70" : "text-muted-foreground"
                      )}>
                        {msgIcon}
                        <span className="text-xs capitalize">{msg.message_type}</span>
                      </div>
                    )}

                    {/* Content (hide for media types that already display content) */}
                    {!['audio', 'image', 'video', 'document'].includes(msg.message_type || '') && msg.content && (
                      <p className="whitespace-pre-wrap">
                        {renderWithLinks(msg.content, isFromMe && !isInternal ? "text-white underline hover:text-white/80 break-all" : "text-primary underline hover:text-primary/80 break-all")}
                      </p>
                    )}
                    
                    {/* Caption for media with text */}
                    {['image', 'video'].includes(msg.message_type || '') && msg.content && (
                      <p className="whitespace-pre-wrap mt-2">
                        {renderWithLinks(msg.content, isFromMe && !isInternal ? "text-white underline hover:text-white/80 break-all" : "text-primary underline hover:text-primary/80 break-all")}
                      </p>
                    )}

                    {/* Time and status */}
                    <div className={cn(
                      "flex items-center justify-end gap-1 mt-1",
                      isFromMe && !isInternal ? "text-white/70" : "opacity-70"
                    )}>
                      <span className="text-xs">{formatTime(msg.created_at)}</span>
                      {renderStatusIcon(
                        !isFromMe || isInternal
                          ? msg.status
                          : msg.status === "read" || msg.status === "delivered"
                            ? msg.status
                            : (msg.status === "sent" || !msg.status) &&
                                Date.now() - new Date(msg.created_at).getTime() > 2000
                              ? "delivered"
                              : msg.status || "sent",
                        isFromMe
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

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

        {/* Audio Recorder */}
        {isRecordingAudio ? (
          <AudioRecorder
            onSend={handleSendAudio}
            onCancel={() => setIsRecordingAudio(false)}
            disabled={isSending}
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

                {/* Audio button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsRecordingAudio(true)}
                  disabled={isInternalMode}
                >
                  <Mic className="h-4 w-4" />
                </Button>

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
              <Textarea
                placeholder={isInternalMode ? "Mensagem interna..." : "Digite sua mensagem..."}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className={cn(
                  "min-h-[60px] resize-none",
                  isInternalMode && "border-yellow-400"
                )}
                disabled={isSending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!messageInput.trim() || isSending}
                className="h-auto"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
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

      {/* Edit Name Dialog */}
      <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar nome do contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Nome do contato"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveName();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditNameOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveName}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
