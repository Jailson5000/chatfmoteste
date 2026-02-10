import { useRef, useCallback } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotification = useCallback(() => {
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      // Resume if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Create a pleasant two-tone "ding-ding" notification
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Two ascending tones for a friendly notification sound
      playTone(880, now, 0.15);        // A5
      playTone(1174.66, now + 0.12, 0.2); // D6

    } catch {
      // Fallback: try playing the MP3 file
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.6;
      audio.play().catch(() => {});
    }
  }, []);

  return { playNotification };
}
