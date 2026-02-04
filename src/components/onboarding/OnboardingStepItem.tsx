import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, Circle, ChevronDown, Play, ExternalLink } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface OnboardingStepItemProps {
  step: {
    id: string;
    title: string;
    description: string | null;
    youtube_id: string | null;
    action_label: string | null;
    action_route: string | null;
    position: number;
    is_completed: boolean;
  };
  onMarkComplete: (stepId: string) => void;
}

export function OnboardingStepItem({ step, onMarkComplete }: OnboardingStepItemProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = () => {
    if (step.action_route) {
      // Mark as complete when user clicks the action
      if (!step.is_completed) {
        onMarkComplete(step.id);
      }
      navigate(step.action_route);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card overflow-hidden">
        <CollapsibleTrigger className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors">
          <div className="flex-shrink-0">
            {step.is_completed ? (
              <CheckCircle2 className="h-6 w-6 text-primary" />
            ) : (
              <Circle className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {step.position}. Tarefa:
              </span>
              <span className={cn(
                "font-medium",
                step.is_completed && "text-muted-foreground line-through"
              )}>
                {step.title}
              </span>
            </div>
          </div>

          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {step.description && (
              <p className="text-sm text-muted-foreground pl-9">
                {step.description}
              </p>
            )}

            {step.youtube_id && (
              <div className="pl-9">
                <div className="aspect-video rounded-lg overflow-hidden bg-black/5 max-w-md">
                  <iframe
                    src={`https://www.youtube.com/embed/${step.youtube_id}`}
                    title={step.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {step.action_label && step.action_route && (
              <div className="pl-9">
                <Button
                  onClick={handleAction}
                  variant={step.is_completed ? "outline" : "default"}
                  size="sm"
                >
                  {step.action_label}
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
