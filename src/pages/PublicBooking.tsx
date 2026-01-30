import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format, addDays, startOfDay, isSameDay, setHours, setMinutes, parseISO, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Calendar, 
  Clock, 
  User, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceProfessionalLink {
  professional_id: string;
}

interface PublicService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  color: string | null;
  agenda_pro_service_professionals?: ServiceProfessionalLink[];
}

interface PublicProfessional {
  id: string;
  name: string;
  specialty: string | null;
  avatar_url: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface BusinessSettings {
  business_name: string;
  business_description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  max_advance_days: number;
  min_advance_hours: number;
  timezone: string | null;
}

type BookingStep = "service" | "professional" | "datetime" | "info" | "confirmation";

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]);
  const [serviceProfessionals, setServiceProfessionals] = useState<PublicProfessional[]>([]);
  const [loadingServiceProfs, setLoadingServiceProfs] = useState(false);
  const [professionalsError, setProfessionalsError] = useState<string | null>(null);
  const [lawFirmId, setLawFirmId] = useState<string | null>(null);
  
  const [step, setStep] = useState<BookingStep>("service");
  const [selectedService, setSelectedService] = useState<PublicService | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<PublicProfessional | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  const [weekStart, setWeekStart] = useState<Date>(startOfDay(new Date()));

  // Function to load professionals for a service using secure RPC
  const loadProfessionalsForService = async (serviceId: string, firmId: string) => {
    setLoadingServiceProfs(true);
    setProfessionalsError(null);
    
    try {
      const { data, error } = await supabase.rpc('get_public_professionals_for_booking', {
        _law_firm_id: firmId,
        _service_id: serviceId
      });
      
      if (error) {
        console.error("Error loading service professionals:", error);
        setProfessionalsError("Não foi possível carregar os profissionais. Tente novamente.");
        setServiceProfessionals([]);
        return [];
      }
      
      const profs = (data as PublicProfessional[]) || [];
      setServiceProfessionals(profs);
      
      // Warn if services loaded but no professionals
      if (profs.length === 0) {
        console.warn("[PublicBooking] Service has no linked professionals:", serviceId);
      }
      
      return profs;
    } catch (err) {
      console.error("Exception loading professionals:", err);
      setProfessionalsError("Erro ao carregar profissionais. Tente novamente.");
      setServiceProfessionals([]);
      return [];
    } finally {
      setLoadingServiceProfs(false);
    }
  };

  // Load business data
  useEffect(() => {
    async function loadBusinessData() {
      if (!slug) return;
      
      try {
        // Find business by slug
        const { data: settingsData, error: settingsError } = await supabase
          .from("agenda_pro_settings")
          .select("*, law_firm_id")
          .eq("public_slug", slug)
          .eq("is_enabled", true)
          .eq("public_booking_enabled", true)
          .single();
        
        if (settingsError || !settingsData) {
          toast.error("Agenda não encontrada ou não disponível para agendamento online");
          return;
        }
        
        const firmId = settingsData.law_firm_id;
        setLawFirmId(firmId);
        setSettings({
          business_name: settingsData.business_name || "Empresa",
          business_description: settingsData.business_description,
          logo_url: settingsData.logo_url,
          primary_color: settingsData.primary_color,
          max_advance_days: settingsData.max_advance_days || 30,
          min_advance_hours: settingsData.min_advance_hours || 2,
          timezone: settingsData.timezone,
        });
        
        // Load public services with professional links
        const { data: servicesData } = await supabase
          .from("agenda_pro_services")
          .select(`
            id, name, description, duration_minutes, price, color,
            agenda_pro_service_professionals(professional_id)
          `)
          .eq("law_firm_id", firmId)
          .eq("is_active", true)
          .eq("is_public", true)
          .order("name");
        
        setServices((servicesData as unknown as PublicService[]) || []);
        
        // Load active professionals using secure RPC (no direct view access)
        const { data: professionalsData, error: profError } = await supabase.rpc(
          'get_public_professionals_for_booking',
          { _law_firm_id: firmId }
        );
        
        if (profError) {
          console.error("Error loading professionals:", profError);
          // Don't block - will fall back to loading per service
        }
        
        setProfessionals((professionalsData as PublicProfessional[]) || []);
        
      } catch (error) {
        console.error("Error loading business data:", error);
        toast.error("Erro ao carregar dados da empresa");
      } finally {
        setLoading(false);
      }
    }
    
    loadBusinessData();
  }, [slug]);

  // Load available time slots when date/professional/service changes
  useEffect(() => {
    async function loadAvailableSlots() {
      if (!selectedDate || !selectedService || !lawFirmId) return;
      
      setLoadingSlots(true);
      try {
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        const dayOfWeek = selectedDate.getDay();
        
        // Get working hours for the selected professional or default
        let workingHours: { start_time: string; end_time: string } | null = null;
        
        if (selectedProfessional) {
          // @ts-ignore - Supabase type inference issue
          const { data: hours } = await supabase
            .from("agenda_pro_working_hours")
            .select("start_time, end_time")
            .eq("professional_id", selectedProfessional.id)
            .eq("day_of_week", dayOfWeek)
            .eq("is_enabled", true)
            .single();
          
          workingHours = hours as { start_time: string; end_time: string } | null;
        }
        
        // Default working hours if professional doesn't have specific ones
        if (!workingHours) {
          workingHours = { start_time: "09:00", end_time: "18:00" };
        }
        
        // @ts-ignore - Supabase type inference issue
        let appointmentsQuery = supabase
          .from("agenda_pro_appointments")
          .select("start_time, end_time, status")
          .eq("law_firm_id", lawFirmId)
          .gte("start_time", `${dateStr}T00:00:00`)
          .lte("start_time", `${dateStr}T23:59:59`)
          .not("status", "in", "(cancelled,no_show)");

        if (selectedProfessional) {
          appointmentsQuery = appointmentsQuery.eq("professional_id", selectedProfessional.id);
        }

        const { data: existingAppointments } = await appointmentsQuery;
        
        // Generate time slots
        const slots: TimeSlot[] = [];
        const [startHour, startMin] = workingHours.start_time.split(":").map(Number);
        const [endHour, endMin] = workingHours.end_time.split(":").map(Number);
        
        let currentTime = setMinutes(setHours(selectedDate, startHour), startMin);
        const endTime = setMinutes(setHours(selectedDate, endHour), endMin);
        const now = new Date();
        const minNotice = addMinutes(now, (settings?.min_advance_hours || 2) * 60);
        
        while (currentTime < endTime) {
          const slotEnd = addMinutes(currentTime, selectedService.duration_minutes);
          const timeStr = format(currentTime, "HH:mm");
          
          // Check if slot is in the past or within minimum notice
          const isPast = currentTime < minNotice;
          
          // Check if slot conflicts with existing appointments
          const hasConflict = existingAppointments?.some(apt => {
            const aptStart = parseISO(apt.start_time);
            const aptEnd = parseISO(apt.end_time);
            return (currentTime >= aptStart && currentTime < aptEnd) ||
                   (slotEnd > aptStart && slotEnd <= aptEnd) ||
                   (currentTime <= aptStart && slotEnd >= aptEnd);
          });
          
          slots.push({
            time: timeStr,
            available: !isPast && !hasConflict && slotEnd <= endTime,
          });
          
          // 15-minute increments allow bookings like 12:15 / 12:45
          currentTime = addMinutes(currentTime, 15);
        }
        
        setAvailableSlots(slots);
      } catch (error) {
        console.error("Error loading slots:", error);
      } finally {
        setLoadingSlots(false);
      }
    }
    
    loadAvailableSlots();
  }, [selectedDate, selectedService, selectedProfessional, lawFirmId, settings]);

  const handleSubmitBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime || !slug) return;
    
    if (!clientName || !clientPhone) {
      toast.error("Por favor, preencha nome e telefone");
      return;
    }
    
    setSubmitting(true);
    try {
      const cleanPhone = clientPhone.replace(/\D/g, "");
      
      // Create appointment start time
      const [hour, min] = selectedTime.split(":").map(Number);
      const startDateTime = setMinutes(setHours(selectedDate, hour), min);
      
      // Use secure RPC that validates tenant via slug
      // professional_id is optional - if null, RPC will select first available
      const professionalId = selectedProfessional?.id || null;
      
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'create_public_booking_appointment',
        {
          _public_slug: slug,
          _service_id: selectedService.id,
          _start_time: startDateTime.toISOString(),
          _client_name: clientName,
          _client_phone: cleanPhone,
          _professional_id: professionalId,
          _client_email: clientEmail || null,
          _notes: notes || null,
        }
      );
      
      if (rpcError) {
        console.error("RPC error:", rpcError);
        // Extract detailed error message
        const errorDetail = rpcError.message || rpcError.details || rpcError.hint || "Erro desconhecido";
        throw new Error(errorDetail);
      }
      
      // RPC returns jsonb with success boolean and data
      const result = rpcResult as { 
        success: boolean; 
        error?: string;
        appointment_id?: string;
        confirmation_token?: string;
        professional_id?: string;
        professional_name?: string;
        service_name?: string;
        start_time?: string;
        end_time?: string;
      };
      
      if (!result.success || !result.appointment_id) {
        console.error("RPC returned failure:", result);
        throw new Error(result.error || "Erro ao criar agendamento");
      }
      
      const appointmentId = result.appointment_id;
      const professionalName = result.professional_name || selectedProfessional?.name || "Profissional";
      const endDateTime = result.end_time ? parseISO(result.end_time) : addMinutes(startDateTime, selectedService.duration_minutes);
      
      // Create scheduled reminder messages based on settings
      try {
        const now = new Date();
        
        // Get settings for reminder configuration including message template
        const { data: reminderSettings } = await supabase
          .from("agenda_pro_settings")
          .select("reminder_hours_before, reminder_2_enabled, reminder_2_value, reminder_2_unit, reminder_message_template, business_name")
          .eq("public_slug", slug)
          .single();
        
        // Get service details for pre-message
        const { data: serviceDetails } = await supabase
          .from("agenda_pro_services")
          .select("pre_message_enabled, pre_message_hours_before, pre_message_text")
          .eq("id", selectedService.id)
          .single();
        
        // Helper function to replace variables in message template
        const formatMessage = (template: string | null, defaultMsg: string): string => {
          if (!template) return defaultMsg;
          const dateStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(startDateTime);
          const timeStr = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(startDateTime);
          
          return template
            .replace(/{client_name}/g, clientName)
            .replace(/{service_name}/g, selectedService.name)
            .replace(/{professional_name}/g, professionalName)
            .replace(/{date}/g, dateStr)
            .replace(/{time}/g, timeStr)
            .replace(/{business_name}/g, reminderSettings?.business_name || settings?.business_name || "");
        };
        
        // Default reminder message template
        const defaultReminderTemplate = "Olá {client_name}! 👋 Lembramos que você tem um agendamento de {service_name} no dia {date} às {time}. Confirme sua presença!";
        
        // We need the law_firm_id for scheduled messages insert
        // Get it from reminderSettings query result or from state
        const { data: settingsForLawFirm } = await supabase
          .from("agenda_pro_settings")
          .select("law_firm_id")
          .eq("public_slug", slug)
          .single();
        
        const lawFirmIdForMessages = settingsForLawFirm?.law_firm_id || lawFirmId;
        
        if (!lawFirmIdForMessages) {
          console.warn("Could not determine law_firm_id for scheduled messages");
        } else {
          const scheduledMessages: {
            law_firm_id: string;
            appointment_id: string;
            client_id: string | null;
            message_type: string;
            message_content: string;
            scheduled_at: string;
            channel: string;
            status: string;
          }[] = [];
          
          // First reminder (configurable, default 24h)
          const reminder1Hours = reminderSettings?.reminder_hours_before || 24;
          const reminderTime = new Date(startDateTime.getTime() - reminder1Hours * 60 * 60 * 1000);
          
          if (reminderTime > now) {
            scheduledMessages.push({
              law_firm_id: lawFirmIdForMessages,
              appointment_id: appointmentId,
              client_id: null,
              message_type: "reminder",
              message_content: formatMessage(reminderSettings?.reminder_message_template, defaultReminderTemplate),
              scheduled_at: reminderTime.toISOString(),
              channel: "whatsapp",
              status: "pending",
            });
          }

          // Second reminder (configurable)
          if (reminderSettings?.reminder_2_enabled && reminderSettings?.reminder_2_value) {
            const reminder2Minutes = reminderSettings.reminder_2_unit === 'hours' 
              ? reminderSettings.reminder_2_value * 60 
              : reminderSettings.reminder_2_value;
            const reminder2Time = new Date(startDateTime.getTime() - reminder2Minutes * 60 * 1000);
            
            if (reminder2Time > now) {
              scheduledMessages.push({
                law_firm_id: lawFirmIdForMessages,
                appointment_id: appointmentId,
                client_id: null,
                message_type: "reminder_2",
                message_content: formatMessage(reminderSettings?.reminder_message_template, defaultReminderTemplate),
                scheduled_at: reminder2Time.toISOString(),
                channel: "whatsapp",
                status: "pending",
              });
            }
          }

          // Create pre-message if service has it enabled
          if (serviceDetails?.pre_message_enabled && serviceDetails?.pre_message_hours_before) {
            const preMessageTime = new Date(startDateTime.getTime() - (serviceDetails.pre_message_hours_before * 60 * 60 * 1000));
            
            if (preMessageTime > now) {
              scheduledMessages.push({
                law_firm_id: lawFirmIdForMessages,
                appointment_id: appointmentId,
                client_id: null,
                message_type: "pre_message",
                message_content: formatMessage(serviceDetails.pre_message_text, "Mensagem pré-atendimento"),
                scheduled_at: preMessageTime.toISOString(),
                channel: "whatsapp",
                status: "pending",
              });
            }
          }

          // Insert all scheduled messages at once
          if (scheduledMessages.length > 0) {
            await supabase.from("agenda_pro_scheduled_messages").insert(scheduledMessages);
          }
        }
      } catch (msgError) {
        console.error("Error creating scheduled messages:", msgError);
      }

      // Send notification via Agenda Pro function
      try {
        await supabase.functions.invoke("agenda-pro-notification", {
          body: { 
            appointment_id: appointmentId,
            type: "created",
          }
        });
      } catch (notifError) {
        console.error("Notification error:", notifError);
      }
      
      setStep("confirmation");
      toast.success("Agendamento realizado com sucesso!");
      
    } catch (error) {
      console.error("Booking error:", error);
      // Extract detailed error message from various error types
      let errorMessage = "Erro ao realizar agendamento";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        const anyError = error as { message?: string; details?: string; hint?: string; code?: string };
        errorMessage = anyError.message || anyError.details || anyError.hint || anyError.code || errorMessage;
      }
      toast.error(`${errorMessage}. Tente novamente.`);
    } finally {
      setSubmitting(false);
    }
  };

  const getDaysToShow = () => {
    const days: Date[] = [];
    const maxDate = addDays(new Date(), settings?.max_advance_days || 30);
    
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      if (day <= maxDate) {
        days.push(day);
      }
    }
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Agenda não encontrada</h2>
            <p className="text-muted-foreground">
              Esta agenda não está disponível ou não existe.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="py-6 px-4 border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {settings.logo_url && (
            <img 
              src={settings.logo_url} 
              alt={settings.business_name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          )}
          <div>
            <h1 className="text-xl font-bold">{settings.business_name}</h1>
            {settings.business_description && (
              <p className="text-sm text-muted-foreground">
                {settings.business_description}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(["service", "professional", "datetime", "info"] as BookingStep[]).map((s, i) => (
            <div
              key={s}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                step === s || (["service", "professional", "datetime", "info"].indexOf(step) > i)
                  ? "w-8 bg-primary"
                  : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step: Select Service */}
        {step === "service" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Escolha o serviço
              </CardTitle>
              <CardDescription>
                Selecione o serviço que deseja agendar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {services.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum serviço disponível para agendamento online
                </p>
              ) : (
                services.map((service) => (
                  <button
                    key={service.id}
                    disabled={loadingServiceProfs}
                    onClick={async () => {
                      setSelectedService(service);
                      
                      // Load professionals using secure RPC
                      if (!lawFirmId) return;
                      
                      const profs = await loadProfessionalsForService(service.id, lawFirmId);
                      
                      // Check if there was an error during loading (professionalsError is set)
                      // We need to check the state after the async call completes
                      if (profs.length === 0) {
                        // The loadProfessionalsForService function already sets professionalsError
                        // if an error occurred. If professionalsError exists, show error message.
                        // Otherwise, it's a genuine empty list.
                        // Note: We check for the error state in the UI below. Here we just block.
                        // The toast is already shown by the function if there was an error.
                        // If no error but empty list, show the "no professionals" message.
                        if (!professionalsError) {
                          toast.error("Este serviço não possui profissionais disponíveis para agendamento online.");
                        }
                        return;
                      } else if (profs.length === 1) {
                        setSelectedProfessional(profs[0]);
                        setStep("datetime");
                      } else {
                        setSelectedProfessional(null);
                        setStep("professional");
                      }
                    }}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-all",
                      "hover:border-primary hover:shadow-md",
                      selectedService?.id === service.id && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {service.color && (
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: service.color }}
                            />
                          )}
                          <h3 className="font-medium">{service.name}</h3>
                        </div>
                        {service.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {service.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {service.duration_minutes} min
                          </span>
                          {service.price && (
                            <span className="font-medium text-foreground">
                              R$ {service.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Select Professional */}
        {step === "professional" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep("service")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Escolha o profissional
                  </CardTitle>
                  <CardDescription>
                    Selecione o profissional de sua preferência
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                onClick={() => {
                  setSelectedProfessional(null);
                  setStep("datetime");
                }}
                className={cn(
                  "w-full p-4 rounded-lg border text-left transition-all",
                  "hover:border-primary hover:shadow-md",
                  !selectedProfessional && "border-primary bg-primary/5"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium">Sem preferência</h3>
                    <p className="text-sm text-muted-foreground">
                      Qualquer profissional disponível
                    </p>
                  </div>
                </div>
              </button>
              
              {serviceProfessionals.map((professional) => (
                <button
                  key={professional.id}
                  onClick={() => {
                    setSelectedProfessional(professional);
                    setStep("datetime");
                  }}
                  className={cn(
                    "w-full p-4 rounded-lg border text-left transition-all",
                    "hover:border-primary hover:shadow-md",
                    selectedProfessional?.id === professional.id && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {professional.avatar_url ? (
                      <img 
                        src={professional.avatar_url}
                        alt={professional.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium">{professional.name}</h3>
                      {professional.specialty && (
                        <p className="text-sm text-muted-foreground">
                          {professional.specialty}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step: Select Date & Time */}
        {step === "datetime" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep(serviceProfessionals.length > 1 ? "professional" : "service")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Escolha data e horário
                  </CardTitle>
                  <CardDescription>
                    {selectedService?.name}
                    {selectedProfessional && ` • ${selectedProfessional.name}`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Date selector */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setWeekStart(addDays(weekStart, -7))}
                    disabled={isSameDay(weekStart, startOfDay(new Date()))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium">
                    {format(weekStart, "MMMM yyyy", { locale: ptBR })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-7 gap-2">
                  {getDaysToShow().map((day) => {
                    const isToday = isSameDay(day, new Date());
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isPast = day < startOfDay(new Date());
                    
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => {
                          setSelectedDate(day);
                          setSelectedTime(null);
                        }}
                        disabled={isPast}
                        className={cn(
                          "flex flex-col items-center p-2 rounded-lg transition-all",
                          "hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed",
                          isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                          isToday && !isSelected && "ring-1 ring-primary"
                        )}
                      >
                        <span className="text-xs uppercase">
                          {format(day, "EEE", { locale: ptBR })}
                        </span>
                        <span className="text-lg font-semibold">
                          {format(day, "d")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div>
                  <h4 className="font-medium mb-3">Horários disponíveis</h4>
                  {loadingSlots ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} className="h-10" />
                      ))}
                    </div>
                  ) : availableSlots.filter(s => s.available).length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Nenhum horário disponível nesta data
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots
                        .filter(slot => slot.available)
                        .map((slot) => (
                          <button
                            key={slot.time}
                            onClick={() => setSelectedTime(slot.time)}
                            className={cn(
                              "p-2 rounded-lg border text-sm transition-all",
                              "hover:border-primary hover:bg-primary/5",
                              selectedTime === slot.time && "border-primary bg-primary text-primary-foreground"
                            )}
                          >
                            {slot.time}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {selectedDate && selectedTime && (
                <Button 
                  className="w-full" 
                  onClick={() => setStep("info")}
                >
                  Continuar
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Client Info */}
        {step === "info" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep("datetime")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle>Seus dados</CardTitle>
                  <CardDescription>
                    Preencha seus dados para confirmar o agendamento
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                {selectedProfessional && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedProfessional.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {selectedDate && format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    {" às "}{selectedTime}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo *</Label>
                  <Input
                    id="name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input
                    id="phone"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail (opcional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Observações (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Alguma informação adicional..."
                    rows={3}
                  />
                </div>
              </div>

              <Button 
                className="w-full" 
                onClick={handleSubmitBooking}
                disabled={submitting || !clientName || !clientPhone}
              >
                {submitting ? "Agendando..." : "Confirmar agendamento"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Confirmation */}
        {step === "confirmation" && (
          <Card>
            <CardContent className="pt-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Agendamento confirmado!</h2>
              <p className="text-muted-foreground">
                Você receberá uma confirmação por WhatsApp com os detalhes do seu agendamento.
              </p>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-left mt-6">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                {selectedProfessional && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedProfessional.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {selectedDate && format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    {" às "}{selectedTime}
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setStep("service");
                  setSelectedService(null);
                  setSelectedProfessional(null);
                  setSelectedDate(null);
                  setSelectedTime(null);
                  setClientName("");
                  setClientPhone("");
                  setClientEmail("");
                  setNotes("");
                }}
              >
                Fazer novo agendamento
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>Agendamento online por {settings.business_name}</p>
      </footer>
    </div>
  );
}
