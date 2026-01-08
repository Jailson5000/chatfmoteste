import { useState, useEffect } from "react";
import { format, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, User, Phone, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useServices, Service } from "@/hooks/useServices";
import { useAppointments, TimeSlot } from "@/hooks/useAppointments";
import { cn } from "@/lib/utils";

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  defaultDate,
}: NewAppointmentDialogProps) {
  const { activeServices, isLoading: loadingServices } = useServices();
  const { createAppointment, getAvailableSlots } = useAppointments();

  const [step, setStep] = useState<"service" | "datetime" | "client">("service");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setStep("service");
      setSelectedService(null);
      setSelectedDate(defaultDate);
      setSelectedSlot(null);
      setClientName("");
      setClientPhone("");
      setClientEmail("");
      setNotes("");
    }
  }, [open, defaultDate]);

  // Update available slots when date or service changes
  useEffect(() => {
    if (selectedDate && selectedService) {
      const slots = getAvailableSlots(selectedDate, selectedService);
      setAvailableSlots(slots);
      setSelectedSlot(null);
    }
  }, [selectedDate, selectedService]);

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setStep("datetime");
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    if (slot.available) {
      setSelectedSlot(slot);
      setStep("client");
    }
  };

  const handleSubmit = async () => {
    if (!selectedService || !selectedSlot) return;

    setIsSubmitting(true);
    try {
      const totalDuration =
        selectedService.duration_minutes +
        selectedService.buffer_before_minutes +
        selectedService.buffer_after_minutes;

      await createAppointment.mutateAsync({
        service_id: selectedService.id,
        start_time: selectedSlot.start.toISOString(),
        end_time: addMinutes(selectedSlot.start, totalDuration).toISOString(),
        client_name: clientName || null,
        client_phone: clientPhone || null,
        client_email: clientEmail || null,
        notes: notes || null,
        status: "scheduled",
        created_by: "admin",
      });

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderServiceStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecione o serviço para o agendamento
      </p>
      {loadingServices ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : activeServices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum serviço ativo</p>
          <p className="text-sm">Crie serviços na aba "Serviços"</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {activeServices.map((service) => (
            <Button
              key={service.id}
              variant="outline"
              className="h-auto p-4 justify-start"
              onClick={() => handleServiceSelect(service)}
            >
              <div
                className="w-3 h-3 rounded-full mr-3"
                style={{ backgroundColor: service.color }}
              />
              <div className="text-left">
                <p className="font-medium">{service.name}</p>
                <p className="text-xs text-muted-foreground">
                  {service.duration_minutes} minutos
                  {service.price && ` • R$ ${service.price.toFixed(2)}`}
                </p>
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );

  const renderDateTimeStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: selectedService?.color }}
        />
        <span className="font-medium">{selectedService?.name}</span>
        <span className="text-sm text-muted-foreground">
          ({selectedService?.duration_minutes} min)
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-2 block">Data</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate
                  ? format(selectedDate, "PPP", { locale: ptBR })
                  : "Selecione uma data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Label className="mb-2 block">Horário</Label>
          {selectedDate ? (
            availableSlots.length > 0 ? (
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot, idx) => (
                    <Button
                      key={idx}
                      variant={selectedSlot === slot ? "default" : "outline"}
                      size="sm"
                      disabled={!slot.available}
                      className={cn(
                        "text-xs",
                        !slot.available && "opacity-50 line-through"
                      )}
                      onClick={() => handleSlotSelect(slot)}
                    >
                      {format(slot.start, "HH:mm")}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-[200px] border rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                Sem horários disponíveis
              </div>
            )
          ) : (
            <div className="h-[200px] border rounded-lg flex items-center justify-center text-muted-foreground text-sm">
              Selecione uma data primeiro
            </div>
          )}
        </div>
      </div>

      <Button
        variant="outline"
        onClick={() => setStep("service")}
        className="w-full"
      >
        Voltar
      </Button>
    </div>
  );

  const renderClientStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
        <Clock className="h-4 w-4" />
        <span className="font-medium">{selectedService?.name}</span>
        <span>•</span>
        <span>
          {selectedSlot && format(selectedSlot.start, "d/MM 'às' HH:mm", { locale: ptBR })}
        </span>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="client_name">Nome do Cliente</Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="client_name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome completo"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="client_phone">Telefone</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="client_phone"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="client_email">E-mail (opcional)</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="client_email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Observações (opcional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Informações adicionais..."
            rows={2}
          />
        </div>
      </div>

      <Button
        variant="outline"
        onClick={() => setStep("datetime")}
        className="w-full"
      >
        Voltar
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
          <DialogDescription>
            {step === "service" && "Passo 1: Escolha o serviço"}
            {step === "datetime" && "Passo 2: Escolha data e horário"}
            {step === "client" && "Passo 3: Dados do cliente"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === "service" && renderServiceStep()}
          {step === "datetime" && renderDateTimeStep()}
          {step === "client" && renderClientStep()}
        </div>

        {step === "client" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Criando..." : "Criar Agendamento"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
