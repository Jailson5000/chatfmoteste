import { useState, useEffect } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MediaGalleryItemProps {
  mediaUrl: string | null;
  whatsappMessageId: string | null;
  conversationId: string;
  content?: string | null;
}

export function MediaGalleryItem({ 
  mediaUrl, 
  whatsappMessageId, 
  conversationId,
  content
}: MediaGalleryItemProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(mediaUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);

    // If we have a valid URL (not blob and not encrypted), try it first.
    if (mediaUrl && !mediaUrl.startsWith("blob:") && !isEncryptedMediaUrl(mediaUrl)) {
      setLoadedUrl(mediaUrl);
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
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <a 
      href={loadedUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      className="block aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition-opacity"
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
    </a>
  );
}
