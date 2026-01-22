import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar, 
  Clock, 
  User, 
  Check, 
  X, 
  AlertCircle,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppointmentData {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  confirmed_at: string | null;
  service: { name: string } | null;
  professional: { name: string } | null;
  settings: { business_name: string; logo_url: string | null } | null;
}

export default function ConfirmAppointment() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionTaken, setActionTaken] = useState<"confirmed" | "cancelled" | null>(null);

  useEffect(() => {
    async function loadAppointment() {
      if (!token) {
        setError("Link inválido");
        setLoading(false);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "agenda-pro-confirmation",
          {
            body: { token, action: "get" },
          },
        );

        if (fnError || !data?.appointment) {
          console.error("Error loading appointment via function:", fnError);
          setError("Agendamento não encontrado ou link expirado");
          return;
        }

        setAppointment(data.appointment as AppointmentData);
      } catch (err) {
        console.error("Error loading appointment:", err);
        setError("Erro ao carregar agendamento");
      } finally {
        setLoading(false);
      }
    }

    loadAppointment();
  }, [token]);

  const handleConfirm = async () => {
    if (!appointment || !token) return;
    
    setConfirming(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "agenda-pro-confirmation",
        {
          body: { token, action: "confirm" },
        },
      );

      if (fnError) throw fnError;
      if (data?.appointment) setAppointment(data.appointment as AppointmentData);

      setActionTaken("confirmed");
      toast.success("Presença confirmada com sucesso!");
    } catch (err) {
      console.error("Error confirming:", err);
      toast.error("Erro ao confirmar presença");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!appointment || !token) return;
    
    setCancelling(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "agenda-pro-confirmation",
        {
          body: { token, action: "cancel" },
        },
      );

      if (fnError) throw fnError;
      if (data?.appointment) setAppointment(data.appointment as AppointmentData);

      setActionTaken("cancelled");
      toast.success("Agendamento cancelado");
    } catch (err) {
      console.error("Error cancelling:", err);
      toast.error("Erro ao cancelar agendamento");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Link inválido</h2>
            <p className="text-muted-foreground">
              {error || "Este link de confirmação não é válido ou já expirou."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const startTime = parseISO(appointment.start_time);
  const isPast = startTime < new Date();
  const alreadyConfirmed = appointment.status === "confirmed" || appointment.confirmed_at;
  const alreadyCancelled = appointment.status === "cancelled";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b flex items-center gap-4">
          {appointment.settings?.logo_url && (
            <img 
              src={appointment.settings.logo_url}
              alt={appointment.settings.business_name || ""}
              className="h-12 w-12 rounded-lg object-cover"
            />
          )}
          <div>
            <h1 className="font-bold text-lg">
              {appointment.settings?.business_name || "Confirmação de Agendamento"}
            </h1>
            <p className="text-sm text-muted-foreground">Confirme sua presença</p>
          </div>
        </div>

        <CardContent className="p-6 space-y-6">
          {/* Action taken message */}
          {actionTaken && (
            <div className={cn(
              "p-4 rounded-lg text-center",
              actionTaken === "confirmed" ? "bg-primary/10" : "bg-destructive/10"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                actionTaken === "confirmed" ? "bg-primary/20" : "bg-destructive/20"
              )}>
                {actionTaken === "confirmed" ? (
                  <Check className="h-6 w-6 text-primary" />
                ) : (
                  <X className="h-6 w-6 text-destructive" />
                )}
              </div>
              <h2 className="font-semibold text-lg mb-1">
                {actionTaken === "confirmed" ? "Presença Confirmada!" : "Agendamento Cancelado"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {actionTaken === "confirmed" 
                  ? "Aguardamos você na data e horário marcados."
                  : "Seu agendamento foi cancelado com sucesso."}
              </p>
            </div>
          )}

          {/* Already handled states */}
          {!actionTaken && (alreadyConfirmed || alreadyCancelled) && (
            <div className={cn(
              "p-4 rounded-lg text-center",
              alreadyConfirmed ? "bg-primary/10" : "bg-muted"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                alreadyConfirmed ? "bg-primary/20" : "bg-muted-foreground/20"
              )}>
                {alreadyConfirmed ? (
                  <Check className="h-6 w-6 text-primary" />
                ) : (
                  <X className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <h2 className="font-semibold text-lg mb-1">
                {alreadyConfirmed ? "Já Confirmado" : "Cancelado"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {alreadyConfirmed 
                  ? "Este agendamento já foi confirmado anteriormente."
                  : "Este agendamento foi cancelado."}
              </p>
            </div>
          )}

          {/* Appointment details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {format(startTime, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(startTime, "yyyy")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div className="font-medium">
                {format(startTime, "HH:mm")} - {format(parseISO(appointment.end_time), "HH:mm")}
              </div>
            </div>

            {appointment.service && (
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div className="font-medium">{appointment.service.name}</div>
              </div>
            )}

            {appointment.professional && (
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div className="font-medium">{appointment.professional.name}</div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!actionTaken && !alreadyConfirmed && !alreadyCancelled && !isPast && (
            <div className="space-y-3">
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleConfirm}
                disabled={confirming || cancelling}
              >
                {confirming ? "Confirmando..." : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Presença
                  </>
                )}
              </Button>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleCancel}
                disabled={confirming || cancelling}
              >
                {cancelling ? "Cancelando..." : "Preciso Cancelar"}
              </Button>
            </div>
          )}

          {isPast && !actionTaken && !alreadyConfirmed && !alreadyCancelled && (
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-muted-foreground">
                Este agendamento já passou e não pode mais ser confirmado.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
