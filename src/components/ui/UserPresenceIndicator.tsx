import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UserPresenceIndicatorProps {
  isOnline: boolean;
  lastSeenAt?: string | null;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UserPresenceIndicator({
  isOnline,
  lastSeenAt,
  showLabel = false,
  size = "md",
  className,
}: UserPresenceIndicatorProps) {
  const getStatus = () => {
    if (isOnline) {
      return {
        color: "bg-green-500",
        label: "Online",
        tooltip: "Usuário está online agora",
      };
    }

    if (lastSeenAt) {
      const lastSeen = new Date(lastSeenAt);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / 60000);

      if (diffMinutes < 5) {
        return {
          color: "bg-yellow-500",
          label: "Recente",
          tooltip: "Visto há menos de 5 minutos",
        };
      }
    }

    return {
      color: "bg-zinc-400",
      label: "Offline",
      tooltip: "Usuário offline",
    };
  };

  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  const status = getStatus();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-2", className)}>
          <span
            className={cn(
              "rounded-full shrink-0 animate-pulse",
              status.color,
              sizeClasses[size]
            )}
            style={{
              animationDuration: isOnline ? "2s" : "0s",
            }}
          />
          {showLabel && (
            <span className="text-xs text-muted-foreground">{status.label}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{status.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
