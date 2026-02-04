import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";

interface OnboardingProgressCardProps {
  progress: number;
  completedSteps: number;
  totalSteps: number;
}

export function OnboardingProgressCard({
  progress,
  completedSteps,
  totalSteps,
}: OnboardingProgressCardProps) {
  const navigate = useNavigate();

  // Show compact version when complete
  if (progress >= 100) {
    return (
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Progresso do onboarding</span>
            </div>
            <div className="flex items-center gap-4">
              <Progress value={100} className="w-32 h-2" />
              <span className="text-sm text-primary font-medium">✓ Completo</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary/80"
                onClick={() => navigate("/onboarding")}
              >
                Ver guia
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">
                Progresso do onboarding
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary/80"
                onClick={() => navigate("/onboarding")}
              >
                Ver guia
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-4">
              <Progress value={progress} className="flex-1 h-2" />
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                {progress}%
              </span>
            </div>
            
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>
                {completedSteps}/{totalSteps} Completo
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
