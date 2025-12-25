import { X, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReplyPreviewProps {
  replyToMessage: {
    id: string;
    content: string | null;
    is_from_me: boolean;
    sender_type: string;
  } | null;
  onCancelReply: () => void;
}

export function ReplyPreview({ replyToMessage, onCancelReply }: ReplyPreviewProps) {
  if (!replyToMessage) return null;

  return (
    <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/50 animate-in slide-in-from-bottom-2 duration-200">
      <Reply className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className={cn(
        "flex-1 min-w-0 border-l-2 pl-2",
        replyToMessage.is_from_me 
          ? "border-primary" 
          : "border-muted-foreground"
      )}>
        <p className="text-xs font-medium text-muted-foreground">
          {replyToMessage.is_from_me ? "Você" : "Contato"}
        </p>
        <p className="text-sm truncate">
          {replyToMessage.content || "[Mídia]"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onCancelReply}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Compact reply quote shown inside message bubble
export function QuotedMessage({ 
  content, 
  isFromMe,
  onClick 
}: { 
  content: string | null; 
  isFromMe: boolean;
  onClick?: () => void;
}) {
  return (
    <div 
      className={cn(
        "p-2 mb-2 rounded-lg cursor-pointer border-l-2 transition-colors",
        isFromMe 
          ? "bg-primary-foreground/10 border-primary-foreground/50 hover:bg-primary-foreground/20" 
          : "bg-muted-foreground/10 border-muted-foreground/50 hover:bg-muted-foreground/20"
      )}
      onClick={onClick}
    >
      <p className="text-xs font-medium opacity-70 mb-0.5">
        {isFromMe ? "Você" : "Contato"}
      </p>
      <p className="text-xs opacity-80 line-clamp-2">
        {content || "[Mídia]"}
      </p>
    </div>
  );
}
