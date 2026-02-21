import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";
import { getVoiceName } from "@/lib/voiceConfig";

interface AudioModeIndicatorProps {
  isAudioEnabled: boolean;
  voiceId?: string;
  onDisable?: () => void;
  className?: string;
}

export function AudioModeIndicator({
  isAudioEnabled,
  voiceId,
  onDisable,
  className,
}: AudioModeIndicatorProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!isAudioEnabled) return null;

  const voiceName = voiceId ? getVoiceName(voiceId) : null;

  const handleDisableClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmDisable = () => {
    onDisable?.();
    setShowConfirmDialog(false);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "min-w-0 max-w-[16rem] gap-1.5 cursor-pointer transition-colors",
              "bg-violet-500/10 text-violet-600 border-violet-500/20 hover:bg-violet-500/20",
              "dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/30",
              className
            )}
            onClick={handleDisableClick}
          >
            <Volume2 className="h-3 w-3 animate-pulse flex-shrink-0" />
            <span className="min-w-0 truncate text-xs">
              Áudio ativo{voiceName ? ` • ${voiceName}` : ""}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>A IA está respondendo por áudio. Clique para desativar.</p>
        </TooltipContent>
      </Tooltip>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <VolumeX className="h-5 w-5 text-muted-foreground" />
              Desativar respostas por áudio?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A IA voltará a responder apenas por texto nesta conversa.
              O cliente pode solicitar áudio novamente a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDisable}>
              Desativar áudio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
