import { Reply, Download, Star, Trash2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MessageActionsMenuProps {
  messageId: string;
  isFromMe: boolean;
  isRevoked?: boolean;
  isStarred?: boolean;
  hasMedia?: boolean;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  whatsappMessageId?: string | null;
  conversationId?: string;
  onReply?: (messageId: string) => void;
  onDownload?: () => void;
  onToggleStar?: (messageId: string, isStarred: boolean) => void;
  onDelete?: (messageId: string, whatsappMessageId: string) => void;
  className?: string;
  align?: "start" | "center" | "end";
}

export function MessageActionsMenu({
  messageId,
  isFromMe,
  isRevoked,
  isStarred,
  hasMedia,
  mediaUrl,
  mediaMimeType,
  whatsappMessageId,
  conversationId,
  onReply,
  onDownload,
  onToggleStar,
  onDelete,
  className,
  align = "end",
}: MessageActionsMenuProps) {
  // Don't show menu for revoked messages
  if (isRevoked) return null;

  const canDownload = hasMedia && (mediaUrl || (whatsappMessageId && conversationId));
  const canDelete = isFromMe && whatsappMessageId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity",
            className
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {/* Responder */}
        {onReply && (
          <DropdownMenuItem onClick={() => onReply(messageId)}>
            <Reply className="h-4 w-4 mr-2" />
            Responder
          </DropdownMenuItem>
        )}

        {/* Baixar */}
        {canDownload && onDownload && (
          <DropdownMenuItem onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </DropdownMenuItem>
        )}

        {/* Favoritar */}
        {onToggleStar && (
          <DropdownMenuItem onClick={() => onToggleStar(messageId, !isStarred)}>
            <Star
              className={cn(
                "h-4 w-4 mr-2",
                isStarred && "fill-yellow-500 text-yellow-500"
              )}
            />
            {isStarred ? "Remover favorito" : "Favoritar"}
          </DropdownMenuItem>
        )}

        {/* Separator before delete */}
        {canDelete && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(messageId, whatsappMessageId!)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
