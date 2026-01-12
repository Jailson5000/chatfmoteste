import { useState, useCallback } from "react";
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronLeft, 
  ChevronRight 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageItem {
  src: string;
  alt?: string;
}

interface ImageViewerDialogProps {
  open: boolean;
  onClose: () => void;
  images: ImageItem[];
  initialIndex?: number;
}

export function ImageViewerDialog({ 
  open, 
  onClose, 
  images, 
  initialIndex = 0 
}: ImageViewerDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
    setZoom(1);
    setRotation(0);
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % images.length);
    setZoom(1);
    setRotation(0);
  }, [images.length]);

  const handleDownload = useCallback(async () => {
    if (!currentImage?.src) return;

    try {
      // If it's a data URL, convert to blob
      if (currentImage.src.startsWith('data:')) {
        const response = await fetch(currentImage.src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentImage.alt || `imagem-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Regular URL
        const a = document.createElement('a');
        a.href = currentImage.src;
        a.download = currentImage.alt || `imagem-${Date.now()}.jpg`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  }, [currentImage]);

  const handleClose = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setCurrentIndex(initialIndex);
    onClose();
  }, [initialIndex, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        handleClose();
        break;
      case 'ArrowLeft':
        if (hasMultiple) handlePrevious();
        break;
      case 'ArrowRight':
        if (hasMultiple) handleNext();
        break;
      case '+':
      case '=':
        handleZoomIn();
        break;
      case '-':
        handleZoomOut();
        break;
      case 'r':
        handleRotate();
        break;
    }
  }, [handleClose, handlePrevious, handleNext, handleZoomIn, handleZoomOut, handleRotate, hasMultiple]);

  if (!open || !currentImage) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
    >
      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 bg-gradient-to-b from-black/50 to-transparent z-10">
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            className="h-9 w-9 text-white hover:bg-white/20"
            title="Diminuir zoom"
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            className="h-9 w-9 text-white hover:bg-white/20"
            title="Aumentar zoom"
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            className="h-9 w-9 text-white hover:bg-white/20"
            title="Girar"
          >
            <RotateCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-9 w-9 text-white hover:bg-white/20"
            title="Baixar"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-9 w-9 text-white hover:bg-white/20"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 text-white hover:bg-white/20 border border-white/30 z-10"
            title="Anterior"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 text-white hover:bg-white/20 border border-white/30 z-10"
            title="Próxima"
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}

      {/* Image container */}
      <div 
        className="flex-1 flex items-center justify-center overflow-auto p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <img
          src={currentImage.src}
          alt={currentImage.alt || "Imagem"}
          className="max-w-[90vw] max-h-[85vh] object-contain transition-transform duration-200"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
          draggable={false}
        />
      </div>

      {/* Bottom counter */}
      {hasMultiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
