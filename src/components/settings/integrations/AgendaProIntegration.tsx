import { useState } from "react";
import { CalendarCheck, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAgendaPro } from "@/hooks/useAgendaPro";
import { useNavigate } from "react-router-dom";

export function AgendaProIntegration() {
  const navigate = useNavigate();
  const { settings, isLoading, isEnabled, enableAgendaPro, disableAgendaPro } = useAgendaPro();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      if (isEnabled) {
        await disableAgendaPro.mutateAsync();
      } else {
        await enableAgendaPro.mutateAsync();
      }
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`relative overflow-hidden transition-all ${isEnabled ? 'ring-2 ring-primary/20' : ''}`}>
      {isEnabled && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/60" />
      )}
      
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
            <CalendarCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Agenda Pro</CardTitle>
              {isEnabled && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  Ativo
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">
              Sistema completo de agendamentos para clínicas e escritórios
            </CardDescription>
          </div>
        </div>
        
        <Switch 
          checked={isEnabled} 
          onCheckedChange={handleToggle}
          disabled={isToggling}
        />
      </CardHeader>
      
      <CardContent className="pt-2">
        <div className="text-xs text-muted-foreground space-y-1 mb-4">
          <p>• Visão diária, semanal e mensal</p>
          <p>• Gestão de profissionais e salas</p>
          <p>• Link público para agendamento online</p>
          <p>• Confirmações automáticas via WhatsApp</p>
        </div>
        
        {isEnabled && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2"
            onClick={() => navigate('/agenda-pro')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Acessar Agenda Pro
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
