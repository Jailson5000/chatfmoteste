import { useState } from "react";
import { Clock, X, Calendar, MessageSquare, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useScheduledFollowUps, type ScheduledFollowUp } from "@/hooks/useScheduledFollowUps";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

function formatMessagePreview(content: string): string {
  if (!content) return "";
  
  // Check for media template format: [IMAGE]url or [VIDEO]url
  const mediaMatch = content.match(/^\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](.*?)(?:\n(.*))?$/s);
  if (mediaMatch) {
    const mediaType = mediaMatch[1];
    const caption = mediaMatch[3]?.trim();
    
    const typeLabels: Record<string, string> = {
      IMAGE: "📷 Imagem",
      VIDEO: "🎬 Vídeo",
      AUDIO: "🎵 Áudio",
      DOCUMENT: "📄 Documento",
    };
    
    const label = typeLabels[mediaType] || "📎 Mídia";
    return caption ? `${label}: ${caption}` : label;
  }
  
  // For regular text, truncate if too long
  const maxLength = 100;
  if (content.length > maxLength) {
    return content.substring(0, maxLength) + "...";
  }
  
  return content;
}


interface ScheduledFollowUpIndicatorProps {
  conversationId: string;
  variant?: "badge" | "full";
  className?: string;
}

export function ScheduledFollowUpIndicator({ 
  conversationId, 
  variant = "badge",
  className 
}: ScheduledFollowUpIndicatorProps) {
  const { pendingFollowUps, cancelFollowUp, cancelAllFollowUps } = useScheduledFollowUps(conversationId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [selectedFollowUp, setSelectedFollowUp] = useState<ScheduledFollowUp | null>(null);

  if (pendingFollowUps.length === 0) return null;

  const nextFollowUp = pendingFollowUps[0];
  const scheduledDate = new Date(nextFollowUp.scheduled_at);
  const timeUntil = formatDistanceToNow(scheduledDate, { locale: ptBR, addSuffix: true });

  const handleDeleteOne = (followUp: ScheduledFollowUp) => {
    setSelectedFollowUp(followUp);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteOne = async () => {
    if (selectedFollowUp) {
      await cancelFollowUp.mutateAsync(selectedFollowUp.id);
    }
    setDeleteDialogOpen(false);
    setSelectedFollowUp(null);
  };

  const confirmDeleteAll = async () => {
    await cancelAllFollowUps.mutateAsync(conversationId);
    setDeleteAllDialogOpen(false);
  };

  if (variant === "badge") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-[18px] px-1.5 gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30 cursor-pointer",
                className
              )}
            >
              <Clock className="h-2.5 w-2.5" />
              <span>{pendingFollowUps.length}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              {pendingFollowUps.length} follow-up{pendingFollowUps.length > 1 ? "s" : ""} agendado{pendingFollowUps.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Próximo: {timeUntil}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className={cn(
              "h-6 px-2 text-[11px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20",
              className
            )}
          >
            <Clock className="h-3 w-3" />
            <span>{pendingFollowUps.length} agendada{pendingFollowUps.length > 1 ? "s" : ""}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="p-3 border-b flex items-center justify-between">
            <h4 className="font-semibold text-sm">Mensagens Agendadas</h4>
            {pendingFollowUps.length > 1 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-destructive hover:text-destructive h-7 text-xs"
                onClick={() => setDeleteAllDialogOpen(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Cancelar todas
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-64">
            <div className="p-2 space-y-2">
              {pendingFollowUps.map((followUp, index) => (
                <div 
                  key={followUp.id} 
                  className="p-3 rounded-lg bg-muted/50 border space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {followUp.template?.name || "Template não definido"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          /{followUp.template?.shortcut || "---"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteOne(followUp)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDistanceToNow(new Date(followUp.scheduled_at), { locale: ptBR, addSuffix: true })}</span>
                    </div>
                  </div>

                  {followUp.template?.content && (
                    <div className="p-2 rounded bg-background border text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3 inline-block mr-1" />
                      <span className="line-clamp-2 break-all">
                        {formatMessagePreview(followUp.template.content)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Delete single dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta mensagem agendada será cancelada e não será enviada ao cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteOne}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar follow-up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar todos os follow-ups?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFollowUps.length} mensagens agendadas serão canceladas e não serão enviadas ao cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Mini badge for card display
interface ScheduledFollowUpBadgeProps {
  count: number;
  className?: string;
}

export function ScheduledFollowUpBadge({ count, className }: ScheduledFollowUpBadgeProps) {
  if (count === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] h-[18px] px-1.5 gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30",
              className
            )}
          >
            <Clock className="h-2.5 w-2.5" />
            <span>{count}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs">{count} follow-up{count > 1 ? "s" : ""} agendado{count > 1 ? "s" : ""}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
