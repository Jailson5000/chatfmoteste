import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Simple in-memory cache for decrypted media
const mediaCache = new Map<string, string>();

export function useMediaDecrypt() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const getDecryptedMedia = useCallback(async (
    conversationId: string,
    whatsappMessageId: string,
    mimeType: string
  ): Promise<string | null> => {
    const cacheKey = whatsappMessageId;

    // Return from cache if available
    if (mediaCache.has(cacheKey)) {
      return mediaCache.get(cacheKey)!;
    }

    // Check if already loading
    if (loading[cacheKey]) {
      return null;
    }

    setLoading(prev => ({ ...prev, [cacheKey]: true }));

    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId,
          whatsappMessageId,
        },
      });

      if (response.error || !response.data?.success) {
        console.error("Failed to decrypt media:", response.error || response.data?.error);
        setErrors(prev => ({ ...prev, [cacheKey]: true }));
        return null;
      }

      const { base64, mimetype } = response.data;
      if (!base64) {
        setErrors(prev => ({ ...prev, [cacheKey]: true }));
        return null;
      }

      // Create data URL
      const actualMimeType = mimetype || mimeType || "audio/ogg";
      const dataUrl = `data:${actualMimeType};base64,${base64}`;

      // Cache the result
      mediaCache.set(cacheKey, dataUrl);

      return dataUrl;
    } catch (error) {
      console.error("Error decrypting media:", error);
      setErrors(prev => ({ ...prev, [cacheKey]: true }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, [loading]);

  const isLoading = useCallback((whatsappMessageId: string) => {
    return loading[whatsappMessageId] || false;
  }, [loading]);

  const hasError = useCallback((whatsappMessageId: string) => {
    return errors[whatsappMessageId] || false;
  }, [errors]);

  const getCached = useCallback((whatsappMessageId: string) => {
    return mediaCache.get(whatsappMessageId) || null;
  }, []);

  return {
    getDecryptedMedia,
    isLoading,
    hasError,
    getCached,
  };
}
