import { useEffect, useRef } from "react";

const DEFAULT_FAVICON = "/favicon.png";
const UNREAD_COLOR = "#ef4444"; // red-500

export function useDynamicFavicon(unreadCount: number) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalFaviconRef = useRef<string>(DEFAULT_FAVICON);

  useEffect(() => {
    // Create canvas if it doesn't exist
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = 32;
      canvasRef.current.height = 32;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateFavicon = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Clear canvas
        ctx.clearRect(0, 0, 32, 32);

        // Always draw the original favicon first
        ctx.drawImage(img, 0, 0, 32, 32);

        if (unreadCount > 0) {
          // Draw notification badge with count (red circle with white text)
          ctx.beginPath();
          ctx.arc(24, 8, 8, 0, Math.PI * 2);
          ctx.fillStyle = UNREAD_COLOR;
          ctx.fill();

          // Draw count text
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const displayCount = unreadCount > 9 ? "9+" : unreadCount.toString();
          ctx.fillText(displayCount, 24, 8);
        }

        // Update favicon
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (link) {
          link.href = canvas.toDataURL("image/png");
        } else {
          const newLink = document.createElement("link");
          newLink.rel = "icon";
          newLink.href = canvas.toDataURL("image/png");
          document.head.appendChild(newLink);
        }
      };
      
      img.onerror = () => {
        // If image fails to load, create a simple colored circle favicon
        ctx.clearRect(0, 0, 32, 32);
        
        if (unreadCount > 0) {
          // Red circle with number
          ctx.beginPath();
          ctx.arc(16, 16, 15, 0, Math.PI * 2);
          ctx.fillStyle = UNREAD_COLOR;
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const displayCount = unreadCount > 9 ? "9+" : unreadCount.toString();
          ctx.fillText(displayCount, 16, 16);
        } else {
          // Default blue circle
          ctx.beginPath();
          ctx.arc(16, 16, 15, 0, Math.PI * 2);
          ctx.fillStyle = "#3b82f6";
          ctx.fill();
        }

        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (link) {
          link.href = canvas.toDataURL("image/png");
        }
      };

      img.src = originalFaviconRef.current;
    };

    updateFavicon();

    // Cleanup: restore original favicon when unmounting
    return () => {
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (link) {
        link.href = originalFaviconRef.current;
      }
    };
  }, [unreadCount]);
}
