import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SessionTerminatedOverlay() {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/20">
          <AlertTriangle className="h-8 w-8 text-warning" />
        </div>
        
        {/* Title */}
        <h1 className="text-2xl font-semibold text-foreground">
          Sessão encerrada
        </h1>
        
        {/* Description */}
        <p className="text-muted-foreground">
          Esta aba foi desconectada porque o MiauChat foi aberto em outra aba do navegador.
        </p>
        
        {/* Reload button */}
        <Button 
          onClick={handleReload}
          size="lg"
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar esta aba
        </Button>
        
        {/* Help text */}
        <p className="text-sm text-muted-foreground/70">
          Ao recarregar, você poderá continuar usando o sistema normalmente.
        </p>
      </div>
    </div>
  );
}
