import { useState, useEffect, useCallback } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImageViewerDialog } from "./ImageViewerDialog";

interface MediaGalleryItemProps {
  mediaUrl: string | null;
  whatsappMessageId: string | null;
  conversationId: string;
  content?: string | null;
  // For navigation between images
  allImages?: Array<{
    mediaUrl: string | null;
    whatsappMessageId: string | null;
    content?: string | null;
  }>;
  currentIndex?: number;
}

// Simple cache for gallery images
const galleryCache = new Map<string, string>();

export function MediaGalleryItem({ 
  mediaUrl, 
  whatsappMessageId, 
  conversationId,
  content,
  allImages,
  currentIndex = 0,
}: MediaGalleryItemProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(mediaUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<number, string>>({});

  useEffect(() => {
    setError(false);

    // If we have a valid URL (not blob and not encrypted), try it first.
    if (mediaUrl && !mediaUrl.startsWith("blob:") && !isEncryptedMediaUrl(mediaUrl)) {
      setLoadedUrl(mediaUrl);
      if (allImages) {
        setLoadedImages(prev => ({ ...prev, [currentIndex]: mediaUrl }));
      }
      return;
    }

    // If no URL or it's encrypted/blob, fetch from backend.
    if (whatsappMessageId && conversationId) {
      fetchMediaFromApi();
    }
  }, [mediaUrl, whatsappMessageId, conversationId]);

  const isEncryptedMediaUrl = (url: string) => {
    const u = url.toLowerCase();
    return u.includes(".enc") || u.includes("mmg.whatsapp.net");
  };

  const fetchMediaFromApi = async () => {
    if (!whatsappMessageId || !conversationId) return;

    // Check cache first
    const cached = galleryCache.get(whatsappMessageId);
    if (cached) {
      setLoadedUrl(cached);
      if (allImages) {
        setLoadedImages(prev => ({ ...prev, [currentIndex]: cached }));
      }
      return;
    }

    setIsLoading(true);
    setError(false);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId,
          whatsappMessageId,
        },
      });

      if (fnError || !data?.success || !data?.base64) {
        setError(true);
        return;
      }

      const mimeType = data.mimetype || "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${data.base64}`;
      setLoadedUrl(dataUrl);
      galleryCache.set(whatsappMessageId, dataUrl);
      if (allImages) {
        setLoadedImages(prev => ({ ...prev, [currentIndex]: dataUrl }));
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Load image at specific index for viewer navigation
  const loadImageAtIndex = useCallback(async (index: number): Promise<string | null> => {
    if (!allImages || !allImages[index]) return null;
    
    const img = allImages[index];
    
    // Check if already loaded
    if (loadedImages[index]) return loadedImages[index];
    
    // Check URL validity
    if (img.mediaUrl && !img.mediaUrl.startsWith("blob:") && !isEncryptedMediaUrl(img.mediaUrl)) {
      setLoadedImages(prev => ({ ...prev, [index]: img.mediaUrl! }));
      return img.mediaUrl;
    }
    
    // Check cache
    if (img.whatsappMessageId) {
      const cached = galleryCache.get(img.whatsappMessageId);
      if (cached) {
        setLoadedImages(prev => ({ ...prev, [index]: cached }));
        return cached;
      }
    }
    
    // Fetch from API
    if (img.whatsappMessageId && conversationId) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "get_media",
            conversationId,
            whatsappMessageId: img.whatsappMessageId,
          },
        });

        if (!fnError && data?.success && data?.base64) {
          const mimeType = data.mimetype || "image/jpeg";
          const dataUrl = `data:${mimeType};base64,${data.base64}`;
          galleryCache.set(img.whatsappMessageId, dataUrl);
          setLoadedImages(prev => ({ ...prev, [index]: dataUrl }));
          return dataUrl;
        }
      } catch {
        // Silent fail
      }
    }
    
    return null;
  }, [allImages, conversationId, loadedImages]);

  // When viewer opens, preload adjacent images
  useEffect(() => {
    if (viewerOpen && allImages) {
      // Preload current and adjacent images
      const indicesToLoad = [currentIndex];
      if (currentIndex > 0) indicesToLoad.push(currentIndex - 1);
      if (currentIndex < allImages.length - 1) indicesToLoad.push(currentIndex + 1);
      
      indicesToLoad.forEach(idx => {
        if (!loadedImages[idx]) {
          loadImageAtIndex(idx);
        }
      });
    }
  }, [viewerOpen, currentIndex, allImages, loadImageAtIndex, loadedImages]);

  if (isLoading) {
    return (
      <div className="aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !loadedUrl) {
    return (
      <div className="aspect-square rounded-md overflow-hidden bg-muted flex flex-col items-center justify-center p-2">
        <ImageIcon className="h-6 w-6 text-muted-foreground mb-1" />
        <span className="text-[10px] text-muted-foreground text-center line-clamp-2">
          {content || "Imagem"}
        </span>
      </div>
    );
  }

  // Build images array for the viewer with loaded URLs
  const viewerImages = allImages 
    ? allImages.map((img, idx) => ({
        src: loadedImages[idx] || img.mediaUrl || '',
        alt: img.content || 'Imagem'
      })).filter(img => img.src)
    : [{ src: loadedUrl, alt: content || 'Imagem' }];

  // Find the correct initial index considering filtered array
  const initialViewerIndex = allImages 
    ? viewerImages.findIndex((_, idx) => {
        const originalIdx = allImages.findIndex((img, i) => 
          i === currentIndex && (loadedImages[i] || img.mediaUrl)
        );
        return idx === originalIdx;
      })
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        className="block aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition-opacity w-full cursor-pointer"
      >
        <img 
          src={loadedUrl} 
          alt={content || "Media"} 
          className="w-full h-full object-cover"
          onError={() => {
            // If the original URL expired, fallback to decrypt via backend.
            if (!isLoading && whatsappMessageId && conversationId) {
              fetchMediaFromApi();
            } else {
              setError(true);
            }
          }}
        />
      </button>
      
      <ImageViewerDialog
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={viewerImages}
        initialIndex={Math.max(0, initialViewerIndex >= 0 ? initialViewerIndex : currentIndex)}
      />
    </>
  );
}
