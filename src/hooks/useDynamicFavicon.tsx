import { useEffect, useRef } from "react";

const DEFAULT_FAVICON = "/fmo-favicon.png";
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

        if (unreadCount > 0) {
          // Draw a colored background circle
          ctx.beginPath();
          ctx.arc(16, 16, 16, 0, Math.PI * 2);
          ctx.fillStyle = UNREAD_COLOR;
          ctx.fill();

          // Draw white icon on top (scaled smaller)
          ctx.save();
          ctx.beginPath();
          ctx.arc(16, 16, 14, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, 2, 2, 28, 28);
          ctx.restore();

          // Draw notification badge with count
          ctx.beginPath();
          ctx.arc(24, 8, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.strokeStyle = UNREAD_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Draw count text
          ctx.fillStyle = UNREAD_COLOR;
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const displayCount = unreadCount > 9 ? "9+" : unreadCount.toString();
          ctx.fillText(displayCount, 24, 8);
        } else {
          // Just draw the original favicon
          ctx.drawImage(img, 0, 0, 32, 32);
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
