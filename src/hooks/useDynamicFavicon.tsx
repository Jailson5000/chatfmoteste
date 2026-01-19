import { useEffect } from "react";

const DEFAULT_FAVICON = "/favicon.png";

export function useDynamicFavicon(unreadCount: number) {
  useEffect(() => {
    // Update document title with unread count
    const baseTitle = "MiauChat";
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Conversas | ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // Ensure favicon is always the default one (with cache busting)
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (link) {
      const faviconUrl = `${DEFAULT_FAVICON}?v=${Date.now()}`;
      link.href = faviconUrl;
    }
  }, [unreadCount]);
}
