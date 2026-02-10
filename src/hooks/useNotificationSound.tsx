import { useRef, useCallback, useEffect } from 'react';

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Use a proper MP3 notification sound file for better quality and audibility
    audioRef.current = new Audio('/notification.mp3');
    audioRef.current.volume = 0.6;
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
