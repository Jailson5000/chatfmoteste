import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Calendar, Clock, User, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgendaProClients } from "@/hooks/useAgendaProClients";

interface ScheduledMessage {
  id?: string;
  appointment_id?: string | null;
  client_id?: string | null;
  message_type: string;
  message_content: string;
  scheduled_at: string;
  channel: string;
  status?: string;
}

interface ScheduledMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: ScheduledMessage | null;
  onSave: (message: ScheduledMessage) => Promise<void>;
  isSaving?: boolean;
}

const MESSAGE_TYPES = [
  { value: "reminder", label: "Lembrete" },
  { value: "pre_message", label: "Pré-atendimento" },
  { value: "birthday", label: "Aniversário" },
  { value: "custom", label: "Personalizada" },
];

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
];

export function ScheduledMessageDialog({
  open,
  onOpenChange,
  message,
  onSave,
  isSaving = false,
}: ScheduledMessageDialogProps) {
  const { clients } = useAgendaProClients();
  const [formData, setFormData] = useState<ScheduledMessage>({
    message_type: "custom",
    message_content: "",
    scheduled_at: "",
    channel: "whatsapp",
    client_id: null,
  });

  useEffect(() => {
    if (message) {
      setFormData({
        ...message,
        scheduled_at: message.scheduled_at 
          ? format(parseISO(message.scheduled_at), "yyyy-MM-dd'T'HH:mm")
          : "",
      });
    } else {
      // Default for new message
      const now = new Date();
      now.setHours(now.getHours() + 1, 0, 0, 0);
      setFormData({
        message_type: "custom",
        message_content: "",
        scheduled_at: format(now, "yyyy-MM-dd'T'HH:mm"),
        channel: "whatsapp",
        client_id: null,
      });
    }
  }, [message, open]);

  const handleSave = async () => {
    if (!formData.message_content.trim() || !formData.scheduled_at) return;

    await onSave({
      ...formData,
      scheduled_at: new Date(formData.scheduled_at).toISOString(),
    });
  };

  const isEditing = !!message?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {isEditing ? "Editar Mensagem" : "Nova Mensagem Agendada"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client Selection */}
          <div className="grid gap-2">
            <Label>Destinatário</Label>
            <Select
              value={formData.client_id || ""}
              onValueChange={(value) => setFormData({ ...formData, client_id: value || null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients?.filter(c => c.is_active && c.phone).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {client.name} - {client.phone}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Message Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={formData.message_type}
                onValueChange={(value) => setFormData({ ...formData, message_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Canal</Label>
              <Select
                value={formData.channel}
                onValueChange={(value) => setFormData({ ...formData, channel: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((ch) => (
                    <SelectItem key={ch.value} value={ch.value}>
                      {ch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scheduled Time */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data e hora de envio
            </Label>
            <Input
              type="datetime-local"
              value={formData.scheduled_at}
              onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
            />
          </div>

          {/* Message Content */}
          <div className="grid gap-2">
            <Label>Mensagem</Label>
            <Textarea
              value={formData.message_content}
              onChange={(e) => setFormData({ ...formData, message_content: e.target.value })}
              rows={5}
              placeholder="Digite a mensagem a ser enviada..."
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {"{client_name}"}, {"{service_name}"}, {"{date}"}, {"{time}"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !formData.message_content.trim() || !formData.scheduled_at}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              isEditing ? "Salvar Alterações" : "Agendar Mensagem"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}