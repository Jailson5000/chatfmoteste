import { useState, useEffect } from "react";
import { format, addMinutes, setHours, setMinutes, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAgendaProServices } from "@/hooks/useAgendaProServices";
import { useAgendaProProfessionals } from "@/hooks/useAgendaProProfessionals";
import { useAgendaProClients } from "@/hooks/useAgendaProClients";
import { useAgendaProAppointments } from "@/hooks/useAgendaProAppointments";

interface AgendaProNewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

export function AgendaProNewAppointmentDialog({
  open,
  onOpenChange,
  defaultDate,
}: AgendaProNewAppointmentDialogProps) {
  const [step, setStep] = useState<"service" | "datetime" | "client">("service");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate || new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { activeServices } = useAgendaProServices();
  const { activeProfessionals } = useAgendaProProfessionals();
  const { searchClients } = useAgendaProClients();
  const { createAppointment, appointments } = useAgendaProAppointments({ date: selectedDate, view: "day" });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setStep("service");
      setSelectedServiceId("");
      setSelectedProfessionalId("");
      setSelectedDate(defaultDate || new Date());
      setSelectedTime("");
      setClientSearch("");
      setClientName("");
      setClientPhone("");
      setClientEmail("");
      setNotes("");
    }
  }, [open, defaultDate]);

  // Get service by ID
  const selectedService = activeServices.find((s) => s.id === selectedServiceId);

  // Get professionals for selected service
  const serviceProf = selectedService?.professionals || activeProfessionals;

  // Generate time slots with 15-minute intervals for precise scheduling
  const timeSlots: TimeSlot[] = [];
  const startHour = 7;
  const endHour = 19;
  const interval = 15; // Changed from 30 to 15 for more precise scheduling (e.g., 12:15, 12:45)

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += interval) {
      const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const slotStart = setMinutes(setHours(selectedDate, hour), min);
      
      // Check if slot is in the past
      const isPast = isBefore(slotStart, new Date());
      
      // Check if slot conflicts with existing appointments (exclude cancelled/no_show)
      const hasConflict = appointments.some((apt) => {
        // Skip cancelled and no_show appointments - they don't block slots
        if (apt.status === 'cancelled' || apt.status === 'no_show') return false;
        if (selectedProfessionalId && apt.professional_id !== selectedProfessionalId) return false;
        
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
        const slotEnd = addMinutes(slotStart, selectedService?.duration_minutes || 30);
        
        return (slotStart < aptEnd && slotEnd > aptStart);
      });

      timeSlots.push({ time, available: !isPast && !hasConflict });
    }
  }

  // Search results
  const searchResults = clientSearch.length >= 2 ? searchClients(clientSearch) : [];

  const handleSelectClient = (client: any) => {
    setClientName(client.name);
    setClientPhone(client.phone || "");
    setClientEmail(client.email || "");
    setClientSearch("");
  };

  const handleSubmit = async () => {
    if (!selectedServiceId || !selectedProfessionalId || !selectedTime || !clientName) return;

    setIsSubmitting(true);
    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const startTime = setMinutes(setHours(selectedDate, hours), minutes);
      const duration = selectedService?.duration_minutes || 30;
      const endTime = addMinutes(startTime, duration);

      await createAppointment.mutateAsync({
        service_id: selectedServiceId,
        professional_id: selectedProfessionalId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: duration,
        client_name: clientName,
        client_phone: clientPhone || null,
        client_email: clientEmail || null,
        notes: notes || null,
        status: "scheduled",
        source: "manual",
      });

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-4">
          {["service", "datetime", "client"].map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                step === s ? "bg-primary" : 
                ["service", "datetime", "client"].indexOf(step) > i ? "bg-primary/50" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step 1: Service */}
        {step === "service" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Serviço</Label>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                {activeServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => setSelectedServiceId(service.id)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all hover:border-primary",
                      selectedServiceId === service.id && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: service.color }} />
                      <div className="flex-1">
                        <div className="font-medium">{service.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {service.duration_minutes} min
                          {service.price && ` • R$ ${service.price.toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedServiceId && (
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(serviceProf.length > 0 ? serviceProf : activeProfessionals).map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        <div className="flex items-center gap-2">
                          {prof.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => setStep("datetime")} 
                disabled={!selectedServiceId || !selectedProfessionalId}
              >
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Date/Time */}
        {step === "datetime" && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, "PPP", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Horário disponível</Label>
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map((slot) => (
                    <Button
                      key={slot.time}
                      variant={selectedTime === slot.time ? "default" : "outline"}
                      size="sm"
                      disabled={!slot.available}
                      onClick={() => setSelectedTime(slot.time)}
                      className={cn(!slot.available && "opacity-50")}
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("service")}>
                Voltar
              </Button>
              <Button onClick={() => setStep("client")} disabled={!selectedTime}>
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Client */}
        {step === "client" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar cliente existente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite nome ou telefone..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="border rounded-lg max-h-[120px] overflow-y-auto">
                  {searchResults.slice(0, 5).map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleSelectClient(client)}
                      className="w-full p-2 text-left hover:bg-muted/50 border-b last:border-b-0"
                    >
                      <div className="font-medium text-sm">{client.name}</div>
                      <div className="text-xs text-muted-foreground">{client.phone}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações sobre o agendamento..."
                  rows={2}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <div className="font-medium">Resumo do Agendamento</div>
              <div className="text-muted-foreground">
                {selectedService?.name} • {selectedService?.duration_minutes} min
              </div>
              <div className="text-muted-foreground">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })} às {selectedTime}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("datetime")}>
                Voltar
              </Button>
              <Button onClick={handleSubmit} disabled={!clientName || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Criar Agendamento"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
