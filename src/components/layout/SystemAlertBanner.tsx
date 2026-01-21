import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useSystemAlert } from "@/hooks/useSystemAlert";
import { Button } from "@/components/ui/button";

export function SystemAlertBanner() {
  const { alertEnabled, alertMessage, isLoading } = useSystemAlert();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !alertEnabled || dismissed) {
    return null;
  }

  return (
    <div className="relative flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="text-center">{alertMessage}</span>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 h-6 w-6 text-warning-foreground hover:bg-warning/80"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
