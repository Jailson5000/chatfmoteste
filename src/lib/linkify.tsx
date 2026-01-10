import React, { ReactNode } from "react";

/**
 * Converts URLs in text to clickable links
 */
export function renderWithLinks(text: string, className?: string): ReactNode {
  // URL regex pattern - matches http/https URLs
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Add the link
    const url = match[0];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={className || "text-primary underline hover:text-primary/80 break-all [word-break:break-all]"}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    
    lastIndex = match.index + url.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
