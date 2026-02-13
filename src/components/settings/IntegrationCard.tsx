import { ReactNode } from "react";
import { Settings2, Loader2, Unplug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface IntegrationCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  isConnected?: boolean;
  isActive?: boolean;
  isLoading?: boolean;
  isComingSoon?: boolean;
  onToggle?: (checked: boolean) => void;
  onSettings?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  toggleDisabled?: boolean;
}

export function IntegrationCard({
  icon,
  title,
  description,
  isConnected = false,
  isActive = false,
  isLoading = false,
  isComingSoon = false,
  onToggle,
  onSettings,
  onConnect,
  onDisconnect,
  toggleDisabled = false,
}: IntegrationCardProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden h-full">
        <CardContent className="p-4 h-full flex flex-col">
          <div className="flex items-start gap-3 mb-3">
            <div className="shrink-0 opacity-50">{icon}</div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{title}</h4>
            </div>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`relative overflow-hidden h-full transition-all ${isComingSoon ? "opacity-60" : "hover:border-primary/50"}`}>
      <CardContent className="p-4 h-full flex flex-col">
        {/* Header with icon and title */}
        <div className="flex items-start gap-3 mb-3">
          <div className="shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{title}</h4>
            {isConnected && !isComingSoon && (
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 mt-1 ${
                  isActive
                    ? "bg-green-500/10 text-green-500 border-green-500/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isActive ? "Conectado" : "Pausado"}
              </Badge>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-3 flex-1 mb-4">
          {description}
        </p>

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
          {isComingSoon ? (
            <>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Em Breve</span>
              <Switch disabled checked={false} />
            </>
          ) : isConnected ? (
            <>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-2 text-xs"
                  onClick={onSettings}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  Configurações
                </Button>
                {onDisconnect && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={onDisconnect}
                  >
                    <Unplug className="h-3.5 w-3.5 mr-1" />
                    Desconectar
                  </Button>
                )}
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={onToggle}
                disabled={toggleDisabled}
              />
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 px-3 text-xs"
                onClick={onConnect}
              >
                Conectar
              </Button>
              <Switch disabled checked={false} />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
