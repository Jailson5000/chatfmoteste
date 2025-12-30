import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Workflow, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Settings
} from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface AIProviderIndicatorProps {
  variant?: "compact" | "detailed";
  className?: string;
}

/**
 * Component that shows the current AI provider status with visual indicators.
 * Shows the flow of messages and which system is processing them.
 */
export function AIProviderIndicator({ 
  variant = "compact",
  className 
}: AIProviderIndicatorProps) {
  const { config, isLoading, isN8N, isInternal, isHybrid } = useAIProvider();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-6 bg-muted rounded w-32"></div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">IA Ativa:</span>
          {isN8N && (
            <>
              <Workflow className="h-4 w-4 text-blue-500" />
              <span className="font-medium">N8N</span>
              {!config.n8nConfigured && (
                <Badge variant="destructive" className="text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Não configurado
                </Badge>
              )}
            </>
          )}
          {isInternal && (
            <>
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">MiauChat AI</span>
            </>
          )}
          {isHybrid && (
            <>
              <Bot className="h-4 w-4 text-purple-500" />
              <span className="font-medium">Híbrido</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // Detailed variant
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Provedor de IA Ativo
          </h3>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate("/admin/ai-settings")}
          >
            <Settings className="h-4 w-4 mr-1" />
            Configurar
          </Button>
        </div>

        {/* Message Flow Visualization */}
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 flex-1">
            <div className="p-2 bg-background rounded-lg border">
              <span className="text-xs font-medium">Mensagem</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            
            {isN8N && (
              <>
                <div className={cn(
                  "p-2 rounded-lg border-2",
                  config.n8nConfigured 
                    ? "bg-blue-500/10 border-blue-500/30" 
                    : "bg-destructive/10 border-destructive/30"
                )}>
                  <div className="flex items-center gap-1">
                    <Workflow className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium">N8N Webhook</span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="p-2 bg-background rounded-lg border">
                  <span className="text-xs font-medium">OpenAI</span>
                </div>
              </>
            )}
            
            {isInternal && (
              <div className="p-2 bg-emerald-500/10 rounded-lg border-2 border-emerald-500/30">
                <div className="flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-medium">MiauChat AI</span>
                </div>
              </div>
            )}
            
            {isHybrid && (
              <>
                <div className="p-2 bg-emerald-500/10 rounded-lg border-2 border-emerald-500/30">
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-medium">Chat</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">+</span>
                <div className="p-2 bg-blue-500/10 rounded-lg border-2 border-blue-500/30">
                  <div className="flex items-center gap-1">
                    <Workflow className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium">Automações</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            {isN8N ? (
              config.n8nConfigured ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )
            ) : (
              <div className="h-4 w-4 rounded-full bg-muted" />
            )}
            <div>
              <p className="text-xs font-medium">N8N</p>
              <p className="text-xs text-muted-foreground">
                {config.n8nConfigured ? "Configurado" : "Não configurado"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            {isInternal || isHybrid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <div className="h-4 w-4 rounded-full bg-muted" />
            )}
            <div>
              <p className="text-xs font-medium">MiauChat AI</p>
              <p className="text-xs text-muted-foreground">
                Sempre disponível
              </p>
            </div>
          </div>
        </div>

        {/* Warning for N8N not configured */}
        {isN8N && !config.n8nConfigured && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                N8N não configurado
              </p>
              <p className="text-xs text-muted-foreground">
                Configure o webhook do N8N ou mude para MiauChat AI.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
