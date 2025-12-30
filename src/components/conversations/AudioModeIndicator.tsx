import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface AudioModeIndicatorProps {
  isAudioEnabled: boolean;
  voiceId?: string;
  onDisable?: () => void;
  className?: string;
}

const VOICE_NAMES: Record<string, string> = {
  shimmer: "Shimmer",
  onyx: "Onyx",
  echo: "Echo",
  alloy: "Alloy",
  fable: "Fable",
  nova: "Nova",
};

export function AudioModeIndicator({
  isAudioEnabled,
  voiceId,
  onDisable,
  className,
}: AudioModeIndicatorProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!isAudioEnabled) return null;

  const voiceName = voiceId ? VOICE_NAMES[voiceId] || voiceId : "Padrão";

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
              "gap-1.5 cursor-pointer transition-colors",
              "bg-violet-500/10 text-violet-600 border-violet-500/20 hover:bg-violet-500/20",
              "dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/30",
              className
            )}
            onClick={handleDisableClick}
          >
            <Volume2 className="h-3 w-3 animate-pulse" />
            <span className="text-xs">Áudio ativo</span>
            {voiceId && (
              <span className="text-xs opacity-70">• {voiceName}</span>
            )}
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
