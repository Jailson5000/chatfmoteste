import * as React from "react";
import { cn } from "@/lib/utils";

export interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
  maxRows?: number;
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ className, minRows = 1, maxRows = 8, onChange, value, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const combinedRef = (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    const adjustHeight = React.useCallback(() => {
      const textarea = internalRef.current;
      if (!textarea) return;

      // Reset height to auto to measure scrollHeight correctly
      textarea.style.height = "auto";

      // Calculate line height from computed styles
      const computedStyle = window.getComputedStyle(textarea);
      const fontSize = parseFloat(computedStyle.fontSize) || 14;
      // lineHeight can be "normal" which returns NaN, so use fontSize * 1.5 as fallback
      let lineHeight = parseFloat(computedStyle.lineHeight);
      if (isNaN(lineHeight)) {
        lineHeight = fontSize * 1.5;
      }
      const paddingTop = parseFloat(computedStyle.paddingTop) || 8;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 8;

      const contentHeight = lineHeight * minRows;
      const maxContentHeight = lineHeight * maxRows;

      // Set the height based on content, clamped between min and max
      const scrollHeight = textarea.scrollHeight;
      const minHeight = contentHeight + paddingTop + paddingBottom;
      const maxHeight = maxContentHeight + paddingTop + paddingBottom;
      
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      
      textarea.style.height = `${newHeight}px`;
      
      // Show scrollbar only when content exceeds max height
      textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    }, [minRows, maxRows]);

    // Adjust height on value change
    React.useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    // Adjust height on mount and window resize
    React.useEffect(() => {
      adjustHeight();
      window.addEventListener("resize", adjustHeight);
      return () => window.removeEventListener("resize", adjustHeight);
    }, [adjustHeight]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e);
      // Defer height adjustment to after state update
      requestAnimationFrame(adjustHeight);
    };

    return (
      <textarea
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className
        )}
        ref={combinedRef}
        value={value}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

AutoResizeTextarea.displayName = "AutoResizeTextarea";

export { AutoResizeTextarea };
