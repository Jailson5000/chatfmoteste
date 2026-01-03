import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Bot, Workflow, Sparkles, AlertCircle } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { cn } from "@/lib/utils";

interface AIProviderBadgeProps {
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Badge component that shows which AI provider is currently active.
 * White-label compliant - never mentions external services by branded name.
 */
export function AIProviderBadge({ 
  showLabel = true, 
  size = "md",
  className 
}: AIProviderBadgeProps) {
  const { config, isLoading, providerLabel, isN8N, isInternal, isOpenAI } = useAIProvider();

  if (isLoading) {
    return (
      <Badge variant="outline" className={cn("animate-pulse", className)}>
        <Bot className="h-3 w-3" />
      </Badge>
    );
  }

  const getIcon = () => {
    if (isN8N) return <Workflow className="h-3 w-3" />;
    if (isInternal) return <Sparkles className="h-3 w-3" />;
    if (isOpenAI) return <Bot className="h-3 w-3" />;
    return <Bot className="h-3 w-3" />;
  };

  const getVariant = () => {
    if (isN8N && !config.n8nConfigured) return "destructive";
    if (isN8N) return "default";
    if (isInternal) return "secondary";
    return "outline";
  };

  const getTooltipContent = () => {
    if (isN8N) {
      if (!config.n8nConfigured) {
        return "N8N não configurado. As mensagens não serão processadas por IA.";
      }
      return "IA orquestrada via N8N. Todas as mensagens passam pelo webhook configurado.";
    }
    if (isInternal) {
      return "IA integrada do MiauChat. Processamento interno sem dependências externas.";
    }
    if (isOpenAI) {
      return "IA via OpenAI. Usando API Key da empresa para processamento.";
    }
    return "Provedor de IA ativo";
  };

  const sizeClasses = {
    sm: "text-xs py-0 px-1.5",
    md: "text-xs py-0.5 px-2",
    lg: "text-sm py-1 px-3",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant={getVariant()} 
          className={cn(
            "min-w-0 gap-1 cursor-help",
            sizeClasses[size],
            isN8N && config.n8nConfigured && "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20",
            isInternal && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20",
            isOpenAI && "bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20",
            className
          )}
        >
          {getIcon()}
          {showLabel && (
            <span className="min-w-0 truncate max-w-[10rem]">
              {providerLabel}
            </span>
          )}
          {isN8N && !config.n8nConfigured && (
            <AlertCircle className="h-3 w-3 ml-0.5" />
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p>{getTooltipContent()}</p>
      </TooltipContent>
    </Tooltip>
  );
}
