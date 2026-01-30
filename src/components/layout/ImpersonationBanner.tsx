import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImpersonation } from "@/hooks/useImpersonation";

export function ImpersonationBanner() {
  const { isImpersonating, companyName, endImpersonation } = useImpersonation();

  if (!isImpersonating) {
    return null;
  }

  return (
    <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span className="text-sm font-medium">
          Você está acessando como:{" "}
          <strong>{companyName || "Cliente"}</strong>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={endImpersonation}
        className="bg-warning/80 hover:bg-warning text-warning-foreground border-warning-foreground/30 h-7 text-xs"
      >
        <X className="h-3 w-3 mr-1" />
        Sair do modo Admin
      </Button>
    </div>
  );
}
