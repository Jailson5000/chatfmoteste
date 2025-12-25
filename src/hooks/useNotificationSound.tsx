import { useRef, useCallback, useEffect } from 'react';

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element with a simple notification sound
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleH8oAgMfqNbKkkEfABttx+GYVj4PBlyqz5tLIhwYdr3NoE4TCg4qlcasSzUMCxJgr8ybUCoODCBsv9WTQR4LEh5+x82YPRETEhhhxNqPNg0TFA5Yuc2EOBkYFxJKq8J5MBQdGxo/ocl+KxcfHhk2nMt/JBQfIBsqk8mBIBAcIBwnj8eCHg4ZHxskkciDGgwVGxkgkMeFGQoUGRgckciHFwkUFxcajs+JFAgUFRUYjNeKEwgTFBMVidmNEQgSExEShtmPEAgRERARhNuREAgQEA8QgtySEAgQDw4PgN2TDwgPDg4OgN+UDggODQ0OgOCVDQcNDAwNgOGWDAcMCwsMgOKXCwcMCgoLgOOYCgcLCQkKgOSZCQYKCAgJf+aaCQYKCAgJf+eaCQYKBwcIf+ibCAUJBwcHfumcBwUJBgYHfuqdBwUJBgYGfOqeBgUJBQUGfOufBgQIBQUFe+ygBQQIBAQFe+2hBQQIBAQEeu6iBQQIBAQEeu6iBQQIAwMEee+jBAMHAwMDee+jBAMHAwMDePCkBAMHAgICePGlAwIGAgICd/GlAwIGAgICd/KmAwIGAgIBdvOnAwIFAQEBdvOoAgEFAQEBdfSpAgEFAQEAdPSpAgEEAQAAc/WqAQEEAAAAc/arAQAEAAAAcvasAQAEAAAAcfetAQADAAAAcfetAAAAAwAAAHHgrQAAAAAAAHHfrQAAAAAAAHDfrQAAAAAAAG/erQAAAAAAAG7drQAAAAAAAA==');
    audioRef.current.volume = 0.5;
  }, []);

  const playNotification = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore errors from browser autoplay policy
      });
    }
  }, []);

  return { playNotification };
}
