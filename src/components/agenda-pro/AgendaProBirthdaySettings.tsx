import { useState, useEffect } from "react";
import { Cake, Gift, Percent, Tag } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgendaProServices } from "@/hooks/useAgendaProServices";

interface BirthdayFormData {
  birthday_enabled: boolean;
  birthday_message_template: string;
  birthday_include_coupon: boolean;
  birthday_coupon_type: "discount" | "service";
  birthday_coupon_value: number;
  birthday_coupon_service_id: string | null;
  birthday_send_time: string;
}

interface AgendaProBirthdaySettingsProps {
  formData: BirthdayFormData;
  onChange: (data: Partial<BirthdayFormData>) => void;
}

export function AgendaProBirthdaySettings({ formData, onChange }: AgendaProBirthdaySettingsProps) {
  const { services } = useAgendaProServices();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cake className="h-5 w-5" />
          Mensagem de Aniversário
        </CardTitle>
        <CardDescription>
          Configure mensagens automáticas para aniversariantes com opção de cupom ou serviço grátis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Birthday Messages */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-medium">Ativar mensagens de aniversário</Label>
            <p className="text-xs text-muted-foreground">
              Enviar automaticamente mensagem de feliz aniversário para clientes
            </p>
          </div>
          <Switch
            checked={formData.birthday_enabled}
            onCheckedChange={(checked) => onChange({ birthday_enabled: checked })}
          />
        </div>

        {formData.birthday_enabled && (
          <>
            {/* Send Time */}
            <div className="grid gap-2">
              <Label htmlFor="birthday_send_time">Horário de envio</Label>
              <Input
                id="birthday_send_time"
                type="time"
                value={formData.birthday_send_time}
                onChange={(e) => onChange({ birthday_send_time: e.target.value })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Horário em que a mensagem será enviada no dia do aniversário
              </p>
            </div>

            {/* Message Template */}
            <div className="grid gap-2">
              <Label htmlFor="birthday_message">Mensagem de aniversário</Label>
              <Textarea
                id="birthday_message"
                value={formData.birthday_message_template}
                onChange={(e) => onChange({ birthday_message_template: e.target.value })}
                rows={4}
                placeholder="Olá {client_name}! 🎂 Feliz Aniversário!"
              />
              <p className="text-xs text-muted-foreground">
                Variáveis: {"{client_name}"}, {"{business_name}"}
              </p>
            </div>

            {/* Include Coupon/Gift */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-primary" />
                  <Label className="font-medium">Incluir presente/cupom</Label>
                </div>
                <Switch
                  checked={formData.birthday_include_coupon}
                  onCheckedChange={(checked) => onChange({ birthday_include_coupon: checked })}
                />
              </div>

              {formData.birthday_include_coupon && (
                <div className="space-y-4 pt-2">
                  {/* Coupon Type */}
                  <div className="grid gap-2">
                    <Label>Tipo de presente</Label>
                    <Select
                      value={formData.birthday_coupon_type}
                      onValueChange={(value: "discount" | "service") => 
                        onChange({ birthday_coupon_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discount">
                          <div className="flex items-center gap-2">
                            <Percent className="h-4 w-4" />
                            Cupom de desconto
                          </div>
                        </SelectItem>
                        <SelectItem value="service">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            Serviço gratuito
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Discount Value or Service Selection */}
                  {formData.birthday_coupon_type === "discount" ? (
                    <div className="grid gap-2">
                      <Label>Valor do desconto (%)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={formData.birthday_coupon_value}
                          onChange={(e) => onChange({ birthday_coupon_value: parseInt(e.target.value) || 10 })}
                          className="w-24"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O cupom {"{coupon_code}"} será incluído na mensagem automaticamente
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label>Serviço gratuito</Label>
                      <Select
                        value={formData.birthday_coupon_service_id || ""}
                        onValueChange={(value) => onChange({ birthday_coupon_service_id: value || null })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um serviço" />
                        </SelectTrigger>
                        <SelectContent>
                          {services?.filter(s => s.is_active).map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.name}
                              {service.price && ` - R$ ${service.price.toFixed(2)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Cliente poderá agendar este serviço gratuitamente como presente de aniversário
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}