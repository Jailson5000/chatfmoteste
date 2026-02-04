import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Play, MessageCircle, HelpCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useOnboarding } from "@/hooks/useOnboarding";
import { OnboardingStepItem } from "@/components/onboarding/OnboardingStepItem";
import { useTutorials } from "@/hooks/useTutorials";
import { useAuth } from "@/hooks/useAuth";
import miauchatLogo from "@/assets/miauchat-logo.png";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { steps, progress, completedCount, totalCount, isComplete, isLoading, markComplete, meetingUrl, meetingStatus, setMeetingStatus } = useOnboarding();
  const { data: tutorials = [] } = useTutorials();
  
  // Get featured tutorials or first 3
  const featuredTutorials = tutorials.filter(t => t.is_featured).slice(0, 3);
  const displayTutorials = featuredTutorials.length > 0 ? featuredTutorials : tutorials.slice(0, 3);

  // Get user's first name
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 
                    user?.email?.split('@')[0] || 
                    'usuário';

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Guia de primeiros passos</h1>
            <p className="text-muted-foreground">
              Olá, {firstName}! 👋
            </p>
          </div>
        </div>
        <img src={miauchatLogo} alt="MiauChat" className="h-10 w-auto" />
      </div>

      {/* Progress Summary */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">Seu progresso</h3>
              <p className="text-sm text-muted-foreground">
                {isComplete 
                  ? "Parabéns! Você completou todas as etapas! 🎉" 
                  : `${completedCount} de ${totalCount} etapas concluídas`
                }
              </p>
            </div>
            <div className="text-3xl font-bold text-primary">
              {progress}%
            </div>
          </div>
          <Progress value={progress} className="h-3" />
        </CardContent>
      </Card>

      {/* Meeting Scheduling Section - Always show if URL configured */}
      {meetingUrl && (
        <Card className={meetingStatus === 'scheduled' ? 'border-primary/30 bg-primary/5' : meetingStatus === 'declined' ? 'border-muted' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Seus Agendamentos
              {meetingStatus === 'scheduled' && (
                <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Agendado
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {meetingStatus === 'declined' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Você optou por não agendar uma reunião. Caso mude de ideia, o link está disponível abaixo.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMeetingStatus('scheduled');
                    window.open(meetingUrl, '_blank');
                  }}
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Agendar Agora
                </Button>
              </div>
            ) : meetingStatus === 'scheduled' ? (
              <p className="text-sm text-muted-foreground">
                Você já agendou sua reunião de onboarding. Caso precise reagendar, entre em contato com o suporte.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Agende uma reunião com nossa equipe de suporte para tirar suas dúvidas ao vivo.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMeetingStatus('scheduled');
                      window.open(meetingUrl, '_blank');
                    }}
                    className="gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    Agendar Reunião
                  </Button>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setMeetingStatus('declined');
                        }
                      }}
                    />
                    Não desejo agendar no momento
                  </label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Tutorial Video */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Assista antes de começar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Veja o passo a passo completo do onboarding em poucos minutos.
          </p>
          <div className="aspect-video rounded-lg overflow-hidden bg-black/5 max-w-2xl">
            <iframe
              src="https://www.youtube.com/embed/WzzqFzHKVsU"
              title="Tutorial de Onboarding MiauChat"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </CardContent>
      </Card>

      {/* Steps List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Etapas do onboarding
        </h3>
        
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step) => (
              <OnboardingStepItem
                key={step.id}
                step={step}
                onMarkComplete={markComplete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recommended Videos */}
      {displayTutorials.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vídeos Recomendados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Assista conteúdos essenciais para potencializar seus resultados.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {displayTutorials.map((tutorial) => (
                <div
                  key={tutorial.id}
                  className="rounded-lg overflow-hidden border bg-card cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${tutorial.youtube_id}`, '_blank')}
                >
                  <div className="aspect-video bg-muted relative">
                    <img
                      src={tutorial.thumbnail_url || `https://img.youtube.com/vi/${tutorial.youtube_id}/mqdefault.jpg`}
                      alt={tutorial.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-sm line-clamp-2">{tutorial.title}</h4>
                    {tutorial.duration && (
                      <span className="text-xs text-muted-foreground">{tutorial.duration}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Precisa de ajuda?
          </h3>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate("/suporte")}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Abrir Ticket
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open("https://wa.me/556399540484", "_blank")}
            >
              WhatsApp Suporte
            </Button>
            <Button variant="outline" onClick={() => navigate("/tutoriais")}>
              Ver Todos os Tutoriais
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
