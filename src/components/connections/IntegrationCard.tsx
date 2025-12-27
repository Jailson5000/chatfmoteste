import { ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface IntegrationCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  isConnected?: boolean;
  children: ReactNode;
}

export function IntegrationCard({
  icon,
  title,
  description,
  isConnected,
  children,
}: IntegrationCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full",
          isConnected ? "bg-success" : "bg-muted-foreground/30"
        )}
      />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2.5 rounded-xl",
                isConnected ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              )}
            >
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
          <Badge
            variant={isConnected ? "default" : "outline"}
            className={cn(
              isConnected
                ? "bg-success/20 text-success border-success/30 hover:bg-success/20"
                : "text-muted-foreground"
            )}
          >
            {isConnected ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Conectado
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Desconectado
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
