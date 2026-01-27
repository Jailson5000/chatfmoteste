import { X, Send, FileText, Image as ImageIcon, Music, Film } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";

interface MediaPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (caption: string) => void;
  file: File | null;
  mediaType: "image" | "audio" | "video" | "document";
  previewUrl: string | null;
  isSending?: boolean;
  initialCaption?: string;
}

export function MediaPreviewDialog({
  open,
  onClose,
  onSend,
  file,
  mediaType,
  previewUrl,
  isSending = false,
  initialCaption = "",
}: MediaPreviewDialogProps) {
  const [caption, setCaption] = useState(initialCaption);

  // Update caption when initialCaption changes (e.g., when template is selected)
  useEffect(() => {
    if (open) {
      setCaption(initialCaption);
    }
  }, [open, initialCaption]);

  const handleSend = () => {
    onSend(caption);
    setCaption("");
  };

  const handleClose = () => {
    setCaption("");
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    // Use base 1000 (kB/MB) to match WhatsApp's display
    if (bytes < 1000) return bytes + " B";
    if (bytes < 1000 * 1000) return (bytes / 1000).toFixed(1) + " KB";
    return (bytes / (1000 * 1000)).toFixed(1) + " MB";
  };

  const getMediaIcon = () => {
    switch (mediaType) {
      case "image":
        return <ImageIcon className="h-12 w-12 text-muted-foreground" />;
      case "audio":
        return <Music className="h-12 w-12 text-muted-foreground" />;
      case "video":
        return <Film className="h-12 w-12 text-muted-foreground" />;
      default:
        return <FileText className="h-12 w-12 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="z-[100] w-[min(92vw,640px)] sm:max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mediaType === "image" && "Enviar imagem"}
            {mediaType === "audio" && "Enviar áudio"}
            {mediaType === "video" && "Enviar vídeo"}
            {mediaType === "document" && "Enviar documento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview area */}
          <div className="relative bg-muted rounded-lg overflow-hidden">
            {mediaType === "image" && previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-64 object-contain"
              />
            ) : mediaType === "audio" && previewUrl ? (
              <div className="p-6 flex flex-col items-center gap-4">
                <Music className="h-16 w-16 text-primary" />
                <audio controls src={previewUrl} className="w-full" />
              </div>
            ) : mediaType === "video" && previewUrl ? (
              <video
                src={previewUrl}
                controls
                className="w-full max-h-64"
              />
            ) : (
              <div className="p-8 flex flex-col items-center gap-3">
                {getMediaIcon()}
                <p
                  className="text-sm font-medium text-center break-words"
                  title={file?.name || undefined}
                >
                  {file?.name || "Arquivo"}
                </p>
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* File info */}
          {file && mediaType !== "document" && (
            <div className="text-sm text-muted-foreground text-center">
              <p className="break-words" title={file.name}>
                {file.name}
              </p>
              <p>{formatFileSize(file.size)}</p>
            </div>
          )}

          {/* Caption input (for images and videos) */}
          {(mediaType === "image" || mediaType === "video") && (
            <Input
              placeholder="Adicionar legenda (opcional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={isSending}
            />
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSending}
          >
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
