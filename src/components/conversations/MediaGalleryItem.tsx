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
    // If we have a valid URL that's not a blob, use it directly
    if (mediaUrl && !mediaUrl.startsWith("blob:") && !mediaUrl.endsWith(".enc")) {
      setLoadedUrl(mediaUrl);
      return;
    }

    // If no URL or it's encrypted/blob, try to fetch from Evolution API
    if (whatsappMessageId && conversationId) {
      fetchMediaFromApi();
    }
  }, [mediaUrl, whatsappMessageId, conversationId]);

  const fetchMediaFromApi = async () => {
    if (!whatsappMessageId || !conversationId) return;

    setIsLoading(true);
    setError(false);

    try {
      // First get the whatsapp_instance_id from the conversation
      const { data: convData } = await supabase
        .from("conversations")
        .select("whatsapp_instance_id")
        .eq("id", conversationId)
        .single();

      if (!convData?.whatsapp_instance_id) {
        setError(true);
        return;
      }

      // Get instance details
      const { data: instanceData } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("id", convData.whatsapp_instance_id)
        .single();

      if (!instanceData) {
        setError(true);
        return;
      }

      // Call evolution-api to get media
      const { data: response, error: fnError } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          instanceName: instanceData.instance_name,
          messageId: whatsappMessageId,
        },
      });

      if (fnError || !response?.success || !response?.data?.base64) {
        setError(true);
        return;
      }

      // Convert base64 to data URL
      const mimeType = response.data.mimetype || "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${response.data.base64}`;
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
        onError={() => setError(true)}
      />
    </a>
  );
}
