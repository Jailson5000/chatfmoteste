import { useState, useCallback, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Upload, Image, FileText, Music } from "lucide-react";

interface ChatDropZoneProps {
  children: ReactNode;
  onFileDrop: (file: File, mediaType: "image" | "audio" | "video" | "document") => void;
  disabled?: boolean;
}

export function ChatDropZone({ children, onFileDrop, disabled }: ChatDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const getMediaType = (file: File): "image" | "audio" | "video" | "document" => {
    const mimeType = file.type;
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      const mediaType = getMediaType(file);
      onFileDrop(file, mediaType);
    }
  }, [disabled, onFileDrop]);

  return (
    <div
      className="relative flex-1 min-h-0 min-w-0 flex flex-col w-full h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {/* Drop Overlay */}
      {isDragging && (
        <div 
          className="absolute inset-0 bg-primary/10 backdrop-blur-sm z-50 flex items-center justify-center transition-all"
          onDragLeave={() => setIsDragging(false)}
        >
          <div className="bg-card border-2 border-dashed border-primary rounded-xl p-8 text-center shadow-lg">
            <div className="flex justify-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Image className="h-6 w-6 text-blue-600" />
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Music className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <Upload className="h-8 w-8 mx-auto mb-3 text-primary animate-bounce" />
            <p className="text-lg font-medium">Solte o arquivo aqui</p>
            <p className="text-sm text-muted-foreground mt-1">
              Imagens, documentos, áudios e vídeos
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
