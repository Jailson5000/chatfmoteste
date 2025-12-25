import { useState, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MessageSearchProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchCount: number;
  currentMatch: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
}

export function MessageSearch({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  matchCount,
  currentMatch,
  onPrevMatch,
  onNextMatch,
}: MessageSearchProps) {
  if (!isOpen) return null;

  return (
    <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/50 animate-in slide-in-from-top-2 duration-200">
      <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <Input
        autoFocus
        placeholder="Buscar mensagens..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 text-sm"
      />
      {searchQuery && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "0 resultados"}
        </span>
      )}
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPrevMatch}
          disabled={matchCount === 0}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onNextMatch}
          disabled={matchCount === 0}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Utility function to highlight text
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={index} className="bg-yellow-300 dark:bg-yellow-700 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
