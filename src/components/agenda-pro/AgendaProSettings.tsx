import { useState, useEffect } from "react";
import { Save, Loader2, Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgendaPro, AgendaProSettings as SettingsType } from "@/hooks/useAgendaPro";
import { useToast } from "@/hooks/use-toast";
import { AgendaProBirthdaySettings } from "./AgendaProBirthdaySettings";

export function AgendaProSettings() {
  const { settings, updateSettings, isLoading } = useAgendaPro();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    business_name: "",
    business_description: "",
    min_advance_hours: 2,
    max_advance_days: 60,
    min_gap_between_appointments: 0,
    max_daily_appointments: "",
    block_holidays: false,
    require_confirmation: true,
    confirmation_deadline_hours: 24,
    default_start_time: "08:00",
    default_end_time: "18:00",
    send_whatsapp_confirmation: true,
    send_email_confirmation: false,
    reminder_hours_before: 24,
    reminder_2_enabled: true,
    reminder_2_value: 2,
    reminder_2_unit: "hours" as "minutes" | "hours",
    respect_business_hours: true,
    confirmation_message_template: "Olá {client_name}! ✅ Seu agendamento de {service_name} foi confirmado para o dia {date} às {time}. Aguardamos você!",
    reminder_message_template: "Olá {client_name}! 👋 Lembramos que você tem um agendamento de {service_name} em {date} às {time}. Confirme sua presença!",
    cancellation_message_template: "Olá {client_name}. Seu agendamento de {service_name} para o dia {date} às {time} foi cancelado. Entre em contato para reagendar.",
    // Birthday fields
    birthday_enabled: true,
    birthday_message_template: "Olá {client_name}! 🎂 A equipe {business_name} deseja um Feliz Aniversário! Que seu dia seja repleto de alegrias!",
    birthday_include_coupon: false,
    birthday_coupon_type: "discount" as "discount" | "service",
    birthday_coupon_value: 10,
    birthday_coupon_service_id: null as string | null,
    birthday_send_time: "09:00",
    // Weekend fields
    saturday_enabled: false,
    saturday_start_time: "08:00",
    saturday_end_time: "12:00",
    sunday_enabled: false,
    sunday_start_time: "08:00",
    sunday_end_time: "12:00",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        business_name: settings.business_name || "",
        business_description: settings.business_description || "",
        min_advance_hours: settings.min_advance_hours,
        max_advance_days: settings.max_advance_days,
        min_gap_between_appointments: settings.min_gap_between_appointments,
        max_daily_appointments: settings.max_daily_appointments?.toString() || "",
        block_holidays: settings.block_holidays,
        require_confirmation: settings.require_confirmation,
        confirmation_deadline_hours: settings.confirmation_deadline_hours,
        default_start_time: settings.default_start_time,
        default_end_time: settings.default_end_time,
        send_whatsapp_confirmation: settings.send_whatsapp_confirmation,
        send_email_confirmation: settings.send_email_confirmation,
        reminder_hours_before: settings.reminder_hours_before,
        reminder_2_enabled: settings.reminder_2_enabled ?? true,
        reminder_2_value: settings.reminder_2_value ?? 2,
        reminder_2_unit: (settings.reminder_2_unit as "minutes" | "hours") ?? "hours",
        respect_business_hours: settings.respect_business_hours ?? true,
        confirmation_message_template: settings.confirmation_message_template || "Olá {client_name}! ✅ Seu agendamento de {service_name} foi confirmado para o dia {date} às {time}. Aguardamos você!",
        reminder_message_template: settings.reminder_message_template || "Olá {client_name}! 👋 Lembramos que você tem um agendamento de {service_name} no dia {date} às {time}. Confirme sua presença!",
        cancellation_message_template: settings.cancellation_message_template || "Olá {client_name}. Seu agendamento de {service_name} para o dia {date} às {time} foi cancelado. Entre em contato para reagendar.",
        // Birthday fields
        birthday_enabled: settings.birthday_enabled ?? true,
        birthday_message_template: settings.birthday_message_template || "Olá {client_name}! 🎂 A equipe {business_name} deseja um Feliz Aniversário!",
        birthday_include_coupon: settings.birthday_include_coupon ?? false,
        birthday_coupon_type: (settings.birthday_coupon_type as "discount" | "service") ?? "discount",
        birthday_coupon_value: settings.birthday_coupon_value ?? 10,
        birthday_coupon_service_id: settings.birthday_coupon_service_id ?? null,
        birthday_send_time: settings.birthday_send_time ?? "09:00",
        // Weekend fields
        saturday_enabled: settings.saturday_enabled ?? false,
        saturday_start_time: settings.saturday_start_time ?? "08:00",
        saturday_end_time: settings.saturday_end_time ?? "12:00",
        sunday_enabled: settings.sunday_enabled ?? false,
        sunday_start_time: settings.sunday_start_time ?? "08:00",
        sunday_end_time: settings.sunday_end_time ?? "12:00",
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({
        business_name: formData.business_name || null,
        business_description: formData.business_description || null,
        min_advance_hours: formData.min_advance_hours,
        max_advance_days: formData.max_advance_days,
        min_gap_between_appointments: formData.min_gap_between_appointments,
        max_daily_appointments: formData.max_daily_appointments ? parseInt(formData.max_daily_appointments) : null,
        block_holidays: formData.block_holidays,
        require_confirmation: formData.require_confirmation,
        confirmation_deadline_hours: formData.confirmation_deadline_hours,
        default_start_time: formData.default_start_time,
        default_end_time: formData.default_end_time,
        send_whatsapp_confirmation: formData.send_whatsapp_confirmation,
        send_email_confirmation: formData.send_email_confirmation,
        reminder_hours_before: formData.reminder_hours_before,
        reminder_2_enabled: formData.reminder_2_enabled,
        reminder_2_value: formData.reminder_2_value,
        reminder_2_unit: formData.reminder_2_unit,
        respect_business_hours: formData.respect_business_hours,
        confirmation_message_template: formData.confirmation_message_template,
        reminder_message_template: formData.reminder_message_template,
        cancellation_message_template: formData.cancellation_message_template,
        // Birthday fields
        birthday_enabled: formData.birthday_enabled,
        birthday_message_template: formData.birthday_message_template,
        birthday_include_coupon: formData.birthday_include_coupon,
        birthday_coupon_type: formData.birthday_coupon_type,
        birthday_coupon_value: formData.birthday_coupon_value,
        birthday_coupon_service_id: formData.birthday_coupon_service_id,
        birthday_send_time: formData.birthday_send_time,
        // Weekend fields
        saturday_enabled: formData.saturday_enabled,
        saturday_start_time: formData.saturday_start_time,
        saturday_end_time: formData.saturday_end_time,
        sunday_enabled: formData.sunday_enabled,
        sunday_start_time: formData.sunday_start_time,
        sunday_end_time: formData.sunday_end_time,
      });
      toast({ title: "Configurações salvas!" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Negócio</CardTitle>
          <CardDescription>Informações exibidas na página de agendamento online</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="business_name">Nome do Negócio</Label>
            <Input
              id="business_name"
              value={formData.business_name}
              onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
              placeholder="Nome da empresa ou clínica"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="business_description">Descrição</Label>
            <Textarea
              id="business_description"
              value={formData.business_description}
              onChange={(e) => setFormData({ ...formData, business_description: e.target.value })}
              placeholder="Breve descrição do seu negócio..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Horário de Funcionamento</CardTitle>
          <CardDescription>Define o horário padrão para novos profissionais</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Weekdays */}
          <div className="space-y-3">
            <Label className="font-medium">Dias Úteis (Segunda a Sexta)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="start_time" className="text-sm text-muted-foreground">Início</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.default_start_time}
                  onChange={(e) => setFormData({ ...formData, default_start_time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end_time" className="text-sm text-muted-foreground">Término</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.default_end_time}
                  onChange={(e) => setFormData({ ...formData, default_end_time: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            {/* Saturday */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Trabalha aos Sábados</Label>
                  <p className="text-xs text-muted-foreground">Habilitar atendimento aos sábados</p>
                </div>
                <Switch
                  checked={formData.saturday_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, saturday_enabled: checked })}
                />
              </div>
              {formData.saturday_enabled && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                  <div className="grid gap-2">
                    <Label htmlFor="saturday_start" className="text-sm text-muted-foreground">Início</Label>
                    <Input
                      id="saturday_start"
                      type="time"
                      value={formData.saturday_start_time}
                      onChange={(e) => setFormData({ ...formData, saturday_start_time: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="saturday_end" className="text-sm text-muted-foreground">Término</Label>
                    <Input
                      id="saturday_end"
                      type="time"
                      value={formData.saturday_end_time}
                      onChange={(e) => setFormData({ ...formData, saturday_end_time: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sunday */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Trabalha aos Domingos</Label>
                  <p className="text-xs text-muted-foreground">Habilitar atendimento aos domingos</p>
                </div>
                <Switch
                  checked={formData.sunday_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, sunday_enabled: checked })}
                />
              </div>
              {formData.sunday_enabled && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                  <div className="grid gap-2">
                    <Label htmlFor="sunday_start" className="text-sm text-muted-foreground">Início</Label>
                    <Input
                      id="sunday_start"
                      type="time"
                      value={formData.sunday_start_time}
                      onChange={(e) => setFormData({ ...formData, sunday_start_time: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sunday_end" className="text-sm text-muted-foreground">Término</Label>
                    <Input
                      id="sunday_end"
                      type="time"
                      value={formData.sunday_end_time}
                      onChange={(e) => setFormData({ ...formData, sunday_end_time: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Regras Inteligentes</CardTitle>
          <CardDescription>Configure regras para otimizar seus agendamentos</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="min_advance">Antecedência mínima (horas)</Label>
              <Input
                id="min_advance"
                type="number"
                min={0}
                value={formData.min_advance_hours}
                onChange={(e) => setFormData({ ...formData, min_advance_hours: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max_advance">Antecedência máxima (dias)</Label>
              <Input
                id="max_advance"
                type="number"
                min={1}
                value={formData.max_advance_days}
                onChange={(e) => setFormData({ ...formData, max_advance_days: parseInt(e.target.value) || 60 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gap">Intervalo entre atendimentos (min)</Label>
              <Input
                id="gap"
                type="number"
                min={0}
                value={formData.min_gap_between_appointments}
                onChange={(e) => setFormData({ ...formData, min_gap_between_appointments: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max_daily">Limite diário (opcional)</Label>
              <Input
                id="max_daily"
                type="number"
                min={1}
                value={formData.max_daily_appointments}
                onChange={(e) => setFormData({ ...formData, max_daily_appointments: e.target.value })}
                placeholder="Sem limite"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Bloquear feriados</Label>
              <p className="text-xs text-muted-foreground">Não permitir agendamentos em feriados nacionais</p>
            </div>
            <Switch
              checked={formData.block_holidays}
              onCheckedChange={(checked) => setFormData({ ...formData, block_holidays: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Exigir confirmação</Label>
              <p className="text-xs text-muted-foreground">Cliente precisa confirmar antes do atendimento</p>
            </div>
            <Switch
              checked={formData.require_confirmation}
              onCheckedChange={(checked) => setFormData({ ...formData, require_confirmation: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações e Lembretes
          </CardTitle>
          <CardDescription>Configure como e quando os clientes receberão avisos</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Channels */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Confirmação por WhatsApp</Label>
                <p className="text-xs text-muted-foreground">Enviar confirmação automática via WhatsApp</p>
              </div>
              <Switch
                checked={formData.send_whatsapp_confirmation}
                onCheckedChange={(checked) => setFormData({ ...formData, send_whatsapp_confirmation: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Confirmação por E-mail</Label>
                <p className="text-xs text-muted-foreground">Enviar confirmação automática por e-mail</p>
              </div>
              <Switch
                checked={formData.send_email_confirmation}
                onCheckedChange={(checked) => setFormData({ ...formData, send_email_confirmation: checked })}
              />
            </div>
          </div>

          {/* Reminder 1 - Configurable hours */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <Label className="font-medium">1º Lembrete</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Enviar lembrete antes do agendamento (1 a 72 horas)
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={72}
                value={formData.reminder_hours_before}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 24;
                  const clampedValue = Math.min(72, Math.max(1, value));
                  setFormData({ ...formData, reminder_hours_before: clampedValue });
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">horas antes</span>
            </div>
          </div>

          {/* Reminder 2 - Configurable */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <Label className="font-medium">2º Lembrete - Personalizável</Label>
              </div>
              <Switch
                checked={formData.reminder_2_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, reminder_2_enabled: checked })}
              />
            </div>
            {formData.reminder_2_enabled && (
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  value={formData.reminder_2_value}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1) {
                      setFormData({ ...formData, reminder_2_value: value });
                    }
                  }}
                  className="w-24"
                />
                <Select
                  value={formData.reminder_2_unit}
                  onValueChange={(value: "minutes" | "hours") => setFormData({ ...formData, reminder_2_unit: value })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutos</SelectItem>
                    <SelectItem value="hours">Horas</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">antes</span>
              </div>
            )}
          </div>

          {/* Respect Business Hours */}
          <div className="flex items-center justify-between border rounded-lg p-4">
            <div>
              <Label className="font-medium">Respeitar horário comercial</Label>
              <p className="text-xs text-muted-foreground">
                Enviar lembretes apenas dentro do horário de funcionamento ({formData.default_start_time} - {formData.default_end_time})
              </p>
            </div>
            <Switch
              checked={formData.respect_business_hours}
              onCheckedChange={(checked) => setFormData({ ...formData, respect_business_hours: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Message Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagens Personalizadas</CardTitle>
          <CardDescription>
            Use variáveis: {"{client_name}"}, {"{service_name}"}, {"{professional_name}"}, {"{date}"}, {"{time}"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="confirmation_msg">Mensagem de Confirmação</Label>
            <Textarea
              id="confirmation_msg"
              value={formData.confirmation_message_template}
              onChange={(e) => setFormData({ ...formData, confirmation_message_template: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reminder_msg">Mensagem de Lembrete</Label>
            <Textarea
              id="reminder_msg"
              value={formData.reminder_message_template}
              onChange={(e) => setFormData({ ...formData, reminder_message_template: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cancellation_msg">Mensagem de Cancelamento</Label>
            <Textarea
              id="cancellation_msg"
              value={formData.cancellation_message_template}
              onChange={(e) => setFormData({ ...formData, cancellation_message_template: e.target.value })}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Birthday Settings */}
      <AgendaProBirthdaySettings
        formData={{
          birthday_enabled: formData.birthday_enabled,
          birthday_message_template: formData.birthday_message_template,
          birthday_include_coupon: formData.birthday_include_coupon,
          birthday_coupon_type: formData.birthday_coupon_type,
          birthday_coupon_value: formData.birthday_coupon_value,
          birthday_coupon_service_id: formData.birthday_coupon_service_id,
          birthday_send_time: formData.birthday_send_time,
        }}
        onChange={(data) => setFormData({ ...formData, ...data })}
      />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
