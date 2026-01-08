import { useState } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  RotateCcw,
  Calendar,
  User,
  Phone,
  Clock,
  CheckCircle,
  Search,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppointments, Appointment, TimeSlot } from "@/hooks/useAppointments";
import { useServices } from "@/hooks/useServices";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function AgendaReturns() {
  const { toast } = useToast();
  const { appointments, createAppointment, getAvailableSlots } = useAppointments();
  const { services } = useServices();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showScheduleReturn, setShowScheduleReturn] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [returnDate, setReturnDate] = useState<Date>(addDays(new Date(), 30));
  const [returnSlot, setReturnSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Filter completed appointments that can have returns scheduled
  const completedAppointments = appointments.filter((apt) => 
    apt.status === "completed" &&
    (apt.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     apt.client_phone?.includes(searchTerm) ||
     apt.service?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Get pending returns (appointments marked as returns that are scheduled)
  const pendingReturns = appointments.filter((apt) => 
    apt.is_return && 
    (apt.status === "scheduled" || apt.status === "confirmed")
  );

  const handleOpenScheduleReturn = (apt: Appointment) => {
    setSelectedAppointment(apt);
    
    // Calculate suggested return date based on service interval
    const service = apt.service || services?.find((s) => s.id === apt.service_id);
    const intervalDays = service?.return_interval_days || 30;
    const suggestedDate = addDays(startOfDay(new Date()), intervalDays);
    
    setReturnDate(suggestedDate);
    setReturnSlot(null);
    
    if (service) {
      const slots = getAvailableSlots(suggestedDate, service);
      setAvailableSlots(slots);
    }
    
    setShowScheduleReturn(true);
  };

  const handleDateChange = (date: Date | undefined) => {
    if (!date || !selectedAppointment) return;
    setReturnDate(date);
    setReturnSlot(null);
    
    const service = selectedAppointment.service || services?.find((s) => s.id === selectedAppointment.service_id);
    if (service) {
      const slots = getAvailableSlots(date, service);
      setAvailableSlots(slots);
    }
  };

  const handleScheduleReturn = async () => {
    if (!selectedAppointment || !returnSlot) return;

    setIsCreating(true);
    try {
      const service = selectedAppointment.service || services?.find((s) => s.id === selectedAppointment.service_id);
      if (!service) throw new Error("Serviço não encontrado");

      const bufferBefore = service.buffer_before_minutes || 0;
      const newStart = new Date(returnSlot.start);
      newStart.setMinutes(newStart.getMinutes() + bufferBefore);
      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + service.duration_minutes);

      await createAppointment.mutateAsync({
        service_id: service.id,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        client_id: selectedAppointment.client_id,
        client_name: selectedAppointment.client_name,
        client_phone: selectedAppointment.client_phone,
        client_email: selectedAppointment.client_email,
        notes: `Retorno do atendimento de ${format(new Date(selectedAppointment.start_time), "dd/MM/yyyy")}`,
        status: "scheduled",
        created_by: "admin",
        is_return: true,
        original_appointment_id: selectedAppointment.id,
      } as any);

      toast({
        title: "Retorno agendado!",
        description: `Retorno para ${selectedAppointment.client_name} em ${format(returnDate, "dd/MM/yyyy")} às ${format(returnSlot.start, "HH:mm")}`,
      });

      setShowScheduleReturn(false);
      setSelectedAppointment(null);
    } catch (error: any) {
      toast({
        title: "Erro ao agendar retorno",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            Retornos
          </h2>
          <p className="text-sm text-muted-foreground">
            Agende retornos recorrentes para seus clientes
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingReturns.length}</p>
                <p className="text-xs text-muted-foreground">Retornos Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedAppointments.length}</p>
                <p className="text-xs text-muted-foreground">Atendimentos Concluídos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Returns */}
      {pendingReturns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Retornos Agendados</CardTitle>
            <CardDescription>Próximos retornos dos seus clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingReturns.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                      <RotateCcw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium">{apt.client_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {apt.service?.name} • {format(new Date(apt.start_time), "dd/MM/yyyy 'às' HH:mm")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={apt.status === "confirmed" ? "default" : "secondary"}>
                    {apt.status === "confirmed" ? "Confirmado" : "Agendado"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agendar Novo Retorno</CardTitle>
          <CardDescription>
            Selecione um atendimento concluído para agendar o retorno
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone ou serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {completedAppointments.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {completedAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-1 h-10 rounded-full"
                      style={{ backgroundColor: apt.service?.color || "#6366f1" }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{apt.client_name || "Cliente"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {apt.service?.name} • {format(new Date(apt.start_time), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenScheduleReturn(apt)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agendar Retorno
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum atendimento concluído encontrado</p>
              <p className="text-sm mt-1">
                Complete um atendimento para agendar o retorno
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Return Dialog */}
      <Dialog open={showScheduleReturn} onOpenChange={setShowScheduleReturn}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Agendar Retorno
            </DialogTitle>
            <DialogDescription>
              {selectedAppointment && (
                <>
                  Retorno para <strong>{selectedAppointment.client_name}</strong> - {selectedAppointment.service?.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Date picker */}
              <div className="flex-1">
                <p className="text-sm font-medium mb-2">Data do Retorno</p>
                <CalendarPicker
                  mode="single"
                  selected={returnDate}
                  onSelect={handleDateChange}
                  disabled={(date) => date < startOfDay(new Date())}
                  className="rounded-md border"
                />
              </div>

              {/* Time slots */}
              <div className="flex-1">
                <p className="text-sm font-medium mb-2">Horários Disponíveis</p>
                <ScrollArea className="h-[280px] border rounded-md p-2">
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {availableSlots
                        .filter((slot) => slot.available)
                        .map((slot, idx) => (
                          <Button
                            key={idx}
                            variant={returnSlot?.start.getTime() === slot.start.getTime() ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => setReturnSlot(slot)}
                          >
                            {format(slot.start, "HH:mm")}
                          </Button>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum horário disponível nesta data
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>

            {returnSlot && (
              <div className="bg-primary/10 p-3 rounded-lg">
                <p className="text-sm font-medium">Retorno agendado para:</p>
                <p className="text-sm text-muted-foreground">
                  {format(returnDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })} às{" "}
                  {format(returnSlot.start, "HH:mm")}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowScheduleReturn(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleScheduleReturn}
              disabled={!returnSlot || isCreating}
            >
              {isCreating ? "Agendando..." : "Confirmar Retorno"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
