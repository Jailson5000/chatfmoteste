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

// Regex to match mentions: supports @foo, @foo bar, @foo:bar, @foo:<bar|baz>
const MENTION_REGEX = /@([A-Za-zÀ-ÿ0-9_]+(?:\s[A-Za-zÀ-ÿ0-9_]+)*(?::[A-Za-zÀ-ÿ0-9_\s/|<>.-]+)?)/g;

// Get category color based on mention type (semantic design tokens)
function getMentionColor(mention: string): string {
  const lowerMention = mention.toLowerCase();

  const cls = (token: string) =>
    `bg-mention-${token}/15 text-mention-${token} border-mention-${token}/30 hover:bg-mention-${token}/25`;

  if (lowerMention.startsWith("departamento:")) return cls("department");
  if (lowerMention.startsWith("status:")) return cls("status");
  if (lowerMention.startsWith("etiqueta:")) return cls("tag");
  if (lowerMention.startsWith("responsavel:")) return cls("responsible");
  if (lowerMention.startsWith("template:")) return cls("template");

  // Generic mentions and tools
  if (lowerMention.includes("evento")) return cls("calendar");

  return cls("tool");
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
  const [editingMention, setEditingMention] = useState<{ start: number; end: number } | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const mentionPickerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  // Parse text and find mentions
  const parts = useMemo((): ParsedPart[] => {
    const result: ParsedPart[] = [];
    let lastIndex = 0;
    let match;

    const regex = new RegExp(MENTION_REGEX.source, "g");
    while ((match = regex.exec(value)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          content: value.slice(lastIndex, match.index),
          start: lastIndex,
          end: match.index,
        });
      }
      // Add mention
      result.push({
        type: "mention",
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
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

  // Sync scroll between textarea and display
  const handleScroll = useCallback(() => {
    if (textareaRef.current && displayRef.current) {
      displayRef.current.scrollTop = textareaRef.current.scrollTop;
      displayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Handle mention click - open picker to replace
  const handleMentionClick = (start: number, end: number) => {
    setEditingMention({ start, end });
    setShowMentionPicker(true);
    setMentionFilter("");
    // Focus textarea and position cursor at mention
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
    }
  };

  // Handle removing a mention
  const handleRemoveMention = (e: React.MouseEvent, start: number, end: number) => {
    e.stopPropagation();
    const newValue = value.slice(0, start) + value.slice(end);
    onChange(newValue.replace(/\s{2,}/g, " "));
    setEditingMention(null);
    setShowMentionPicker(false);
  };

  // Handle selecting a mention from the picker
  const handleSelectMention = (mention: string) => {
    if (editingMention) {
      // Replace existing mention
      const newValue = value.slice(0, editingMention.start) + mention + value.slice(editingMention.end);
      onChange(newValue);
      setEditingMention(null);
    } else {
      // Insert new mention at cursor position
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);
      
      // Check if we're replacing an @ being typed
      const lastAtIndex = before.lastIndexOf("@");
      if (lastAtIndex !== -1 && !before.slice(lastAtIndex).includes(" ") && !before.slice(lastAtIndex).includes("\n")) {
        const newValue = before.slice(0, lastAtIndex) + mention + " " + after;
        onChange(newValue);
        // Set cursor after the mention
        setTimeout(() => {
          if (textareaRef.current) {
            const newPos = lastAtIndex + mention.length + 1;
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      } else {
        const newValue = before + mention + " " + after;
        onChange(newValue);
      }
    }
    
    setShowMentionPicker(false);
    setMentionFilter("");
    
    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Handle textarea changes
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const pos = e.target.selectionStart || 0;
    
    onChange(newValue);
    setCursorPosition(pos);
    
    // Check if typing after @
    const textBeforeCursor = newValue.slice(0, pos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setShowMentionPicker(true);
        setMentionFilter(textAfterAt);
        setEditingMention(null);
        return;
      }
    }
    
    setShowMentionPicker(false);
    setMentionFilter("");
  };

  // Handle key selection changes
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition((e.target as HTMLTextAreaElement).selectionStart || 0);
  };

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
        setEditingMention(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Render the display content with styled mentions
  const renderDisplayContent = () => {
    if (parts.length === 0 && !value) {
      return null;
    }

    return parts.map((part, index) => {
      if (part.type === "mention") {
        const mentionText = part.content.slice(1); // Remove @
        const colorClass = getMentionColor(mentionText);
        
        return (
          <span
            key={`${index}-${part.start}`}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-semibold cursor-pointer transition-all mx-0.5 select-none",
              colorClass
            )}
            onClick={() => handleMentionClick(part.start, part.end)}
          >
            @{mentionText}
            <button
              onClick={(e) => handleRemoveMention(e, part.start, part.end)}
              className="hover:bg-foreground/10 rounded-full p-0.5 -mr-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      }
      
      // Regular text - render visible
      return (
        <span key={`${index}-${part.start}`} className="text-foreground">
          {part.content}
        </span>
      );
    });
  };

  return (
    <div ref={editorRef} className="relative h-full">
      {/* Visual display layer - shows styled text and mentions (only when not editing) */}
      {!isFocused && (
        <div 
          ref={displayRef}
          className={cn(
            "absolute inset-0 p-4 overflow-auto font-mono text-sm leading-relaxed whitespace-pre-wrap break-words bg-background rounded-lg border border-border"
          )}
          onClick={() => textareaRef.current?.focus()}
        >
          {value ? renderDisplayContent() : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
      )}

      {/* Visible textarea for actual editing */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onSelect={handleSelect}
        onScroll={handleScroll}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        maxLength={maxLength}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        className={cn(
          "h-full w-full resize-none p-4 bg-background font-mono text-sm leading-relaxed rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground",
          !isFocused && "opacity-0 absolute inset-0",
          className
        )}
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
