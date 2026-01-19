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

    // Ensure favicon is always the default one
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (link) {
      // Only update if different to avoid unnecessary reloads
      if (!link.href.endsWith(DEFAULT_FAVICON)) {
        link.href = DEFAULT_FAVICON;
      }
    }
  }, [unreadCount]);
}
