import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MentionPicker } from "./MentionPicker";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface MentionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  departments?: Array<{ id: string; name: string; color: string }>;
  statuses?: Array<{ id: string; name: string; color: string }>;
  tags?: Array<{ id: string; name: string; color: string }>;
  templates?: Array<{ id: string; name: string }>;
  teamMembers?: Array<{ id: string; full_name: string }>;
  aiAgents?: Array<{ id: string; name: string; is_active?: boolean }>;
  lawFirm?: { 
    name: string; 
    phone?: string; 
    email?: string; 
    address?: string;
    instagram?: string;
    facebook?: string;
    website?: string;
    business_hours?: unknown;
  };
}

// Regex to match mentions
const MENTION_REGEX = /@([A-Za-zÀ-ÿ0-9_]+(?:\s[A-Za-zÀ-ÿ0-9_]+)*(?::[A-Za-zÀ-ÿ0-9_\s/|<>.-]+)?)/g;

// Get category color based on mention type
function getMentionColor(mention: string): string {
  const lowerMention = mention.toLowerCase();

  if (lowerMention.startsWith("departamento:")) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  if (lowerMention.startsWith("status:")) return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  if (lowerMention.startsWith("etiqueta:")) return "bg-green-500/20 text-green-400 border-green-500/40";
  if (lowerMention.startsWith("responsavel:")) return "bg-orange-500/20 text-orange-400 border-orange-500/40";
  if (lowerMention.startsWith("template:")) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40";
  if (lowerMention.includes("evento")) return "bg-rose-500/20 text-rose-400 border-rose-500/40";

  return "bg-slate-500/20 text-slate-400 border-slate-500/40";
}

interface ParsedPart {
  type: "text" | "mention";
  content: string;
  start: number;
  end: number;
}

export function MentionEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  className,
  departments = [],
  statuses = [],
  tags = [],
  templates = [],
  teamMembers = [],
  aiAgents = [],
  lawFirm,
}: MentionEditorProps) {
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const mentionPickerRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  // Parse text and find mentions
  const parts = useMemo((): ParsedPart[] => {
    const result: ParsedPart[] = [];
    let lastIndex = 0;
    let match;

    const regex = new RegExp(MENTION_REGEX.source, "g");
    while ((match = regex.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          content: value.slice(lastIndex, match.index),
          start: lastIndex,
          end: match.index,
        });
      }
      result.push({
        type: "mention",
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < value.length) {
      result.push({
        type: "text",
        content: value.slice(lastIndex),
        start: lastIndex,
        end: value.length,
      });
    }

    return result;
  }, [value]);

  // Get plain text from contenteditable
  const getPlainText = useCallback(() => {
    if (!inputRef.current) return "";
    
    let text = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        // Check if it's a mention badge
        if (el.dataset.mention) {
          text += el.dataset.mention;
        } else {
          // Walk children
          el.childNodes.forEach(walk);
        }
        // Add newline for block elements
        if (el.tagName === "DIV" || el.tagName === "P" || el.tagName === "BR") {
          if (el.tagName !== "BR" || el.nextSibling) {
            text += "\n";
          }
        }
      }
    };
    
    inputRef.current.childNodes.forEach(walk);
    return text.replace(/\n+$/, ""); // Remove trailing newlines
  }, []);

  // Handle input changes
  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    
    const text = getPlainText();
    
    // Check for @ trigger
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      
      if (textNode.nodeType === Node.TEXT_NODE) {
        const textContent = textNode.textContent || "";
        const cursorPos = range.startOffset;
        const textBeforeCursor = textContent.slice(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf("@");
        
        if (lastAtIndex !== -1) {
          const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
          if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
            setShowMentionPicker(true);
            setMentionFilter(textAfterAt);
            setCursorPosition(lastAtIndex);
            onChange(text);
            return;
          }
        }
      }
    }
    
    setShowMentionPicker(false);
    setMentionFilter("");
    onChange(text);
  }, [getPlainText, onChange]);

  // Handle selecting a mention from picker
  const handleSelectMention = useCallback((mention: string) => {
    if (!inputRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // Find and remove the @ trigger text
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    
    if (textNode.nodeType === Node.TEXT_NODE) {
      const textContent = textNode.textContent || "";
      const cursorPos = range.startOffset;
      const textBeforeCursor = textContent.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
      
      if (lastAtIndex !== -1) {
        // Remove from @ to cursor
        const beforeAt = textContent.slice(0, lastAtIndex);
        const afterCursor = textContent.slice(cursorPos);
        textNode.textContent = beforeAt + afterCursor;
        
        // Create mention badge
        const badge = createMentionBadge(mention);
        
        // Insert badge at position
        const newRange = document.createRange();
        newRange.setStart(textNode, lastAtIndex);
        newRange.collapse(true);
        newRange.insertNode(badge);
        
        // Add space after badge
        const spaceNode = document.createTextNode(" ");
        badge.after(spaceNode);
        
        // Move cursor after space
        const cursorRange = document.createRange();
        cursorRange.setStartAfter(spaceNode);
        cursorRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(cursorRange);
      }
    }
    
    setShowMentionPicker(false);
    setMentionFilter("");
    
    // Update value
    setTimeout(() => {
      const text = getPlainText();
      onChange(text);
    }, 0);
    
    inputRef.current.focus();
  }, [getPlainText, onChange]);

  // Create a mention badge element
  const createMentionBadge = (mention: string): HTMLSpanElement => {
    const mentionText = mention.startsWith("@") ? mention.slice(1) : mention;
    const fullMention = mention.startsWith("@") ? mention : `@${mention}`;
    const colorClass = getMentionColor(mentionText);
    
    const badge = document.createElement("span");
    badge.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold mx-0.5 select-all cursor-pointer ${colorClass}`;
    badge.contentEditable = "false";
    badge.dataset.mention = fullMention;
    badge.innerHTML = `<span>${fullMention}</span>`;
    
    // Add click handler to select/edit
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Select the badge
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNode(badge);
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    
    return badge;
  };

  // Remove a mention badge
  const handleRemoveMention = (badge: HTMLElement) => {
    badge.remove();
    const text = getPlainText();
    onChange(text);
    inputRef.current?.focus();
  };

  // Render content from value
  const renderContent = useCallback(() => {
    if (!inputRef.current) return;
    
    // Save current selection
    const selection = window.getSelection();
    let savedOffset = 0;
    let savedNode: Node | null = null;
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      savedNode = range.startContainer;
      savedOffset = range.startOffset;
    }
    
    // Clear and rebuild content
    inputRef.current.innerHTML = "";
    
    if (!value) {
      return;
    }
    
    parts.forEach((part) => {
      if (part.type === "mention") {
        const badge = createMentionBadge(part.content);
        inputRef.current!.appendChild(badge);
      } else {
        const textNode = document.createTextNode(part.content);
        inputRef.current!.appendChild(textNode);
      }
    });
    
    // Restore cursor at end
    if (inputRef.current.lastChild) {
      const range = document.createRange();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [value, parts]);

  // Initial render
  const hasRenderedRef = useRef(false);
  
  useEffect(() => {
    if (!inputRef.current) return;
    
    // Only render initially or when value changes from outside
    if (!hasRenderedRef.current || inputRef.current.childNodes.length === 0) {
      renderContent();
      hasRenderedRef.current = true;
    }
  }, [value, renderContent]);

  // Handle paste - strip formatting
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }, []);

  // Handle keydown
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle backspace on badges
    if (e.key === "Backspace") {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
          const prevSibling = range.startContainer.previousSibling;
          if (prevSibling && (prevSibling as HTMLElement).dataset?.mention) {
            e.preventDefault();
            handleRemoveMention(prevSibling as HTMLElement);
            return;
          }
        }
      }
    }
    
    // Close picker on escape
    if (e.key === "Escape") {
      setShowMentionPicker(false);
    }
  }, []);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mentionPickerRef.current &&
        !mentionPickerRef.current.contains(e.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setShowMentionPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={editorRef} className="relative h-full">
      {/* Contenteditable editor */}
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => { 
          isComposingRef.current = false; 
          handleInput();
        }}
        data-placeholder={placeholder}
        className={cn(
          "h-full w-full overflow-auto p-4 bg-background font-mono text-sm leading-relaxed rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
          className
        )}
        style={{ minHeight: "200px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      />

      {/* Mention picker popup */}
      {showMentionPicker && (
        <div
          ref={mentionPickerRef}
          className="absolute z-50 top-12 left-4"
        >
          <MentionPicker
            departments={departments}
            statuses={statuses}
            tags={tags}
            templates={templates}
            teamMembers={teamMembers}
            aiAgents={aiAgents}
            lawFirm={lawFirm}
            onSelect={handleSelectMention}
            filter={mentionFilter}
          />
        </div>
      )}
    </div>
  );
}
