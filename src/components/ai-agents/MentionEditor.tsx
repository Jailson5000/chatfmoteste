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

// Regex to match mentions: @word or @category:value
const MENTION_REGEX = /@([A-Za-zÀ-ÿ0-9_]+(?:\s[A-Za-zÀ-ÿ0-9_]+)*(?::[A-Za-zÀ-ÿ0-9_\s/]+)?)/g;

// Get category color based on mention type
function getMentionColor(mention: string): string {
  const lowerMention = mention.toLowerCase();
  
  if (lowerMention.startsWith("departamento:")) return "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30";
  if (lowerMention.startsWith("status:")) return "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30";
  if (lowerMention.startsWith("tag:")) return "bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30";
  if (lowerMention.startsWith("membro:")) return "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30";
  if (lowerMention.startsWith("template:")) return "bg-pink-500/20 text-pink-400 border-pink-500/30 hover:bg-pink-500/30";
  if (lowerMention.startsWith("calendario:")) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30";
  if (lowerMention.startsWith("ferramenta:")) return "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30";
  
  // Default colors for general mentions
  if (["nome do cliente", "telefone do cliente", "email do cliente"].includes(lowerMention)) {
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30";
  }
  if (["nome da empresa", "telefone da empresa", "email da empresa", "endereço da empresa"].includes(lowerMention)) {
    return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30";
  }
  if (["data atual", "hora atual", "dia da semana"].includes(lowerMention)) {
    return "bg-slate-500/20 text-slate-400 border-slate-500/30 hover:bg-slate-500/30";
  }
  
  return "bg-primary/20 text-primary border-primary/30 hover:bg-primary/30";
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
              className="hover:bg-black/20 rounded-full p-0.5 -mr-0.5 transition-colors"
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
      {/* Visual display layer - shows styled text and mentions */}
      <div 
        ref={displayRef}
        className={cn(
          "absolute inset-0 p-4 overflow-auto font-mono text-sm leading-relaxed whitespace-pre-wrap break-words",
          isFocused ? "pointer-events-none" : "pointer-events-auto"
        )}
        onClick={() => textareaRef.current?.focus()}
      >
        {value ? renderDisplayContent() : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </div>

      {/* Invisible textarea for actual editing */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onSelect={handleSelect}
        onScroll={handleScroll}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        maxLength={maxLength}
        className={cn(
          "absolute inset-0 h-full w-full resize-none p-4 bg-transparent font-mono text-sm leading-relaxed focus:outline-none",
          isFocused ? "opacity-100" : "opacity-0",
          className
        )}
        style={{
          color: isFocused ? "hsl(var(--foreground))" : "transparent",
          caretColor: "hsl(var(--foreground))",
        }}
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
            lawFirm={lawFirm}
            onSelect={handleSelectMention}
            filter={mentionFilter}
          />
        </div>
      )}
    </div>
  );
}
