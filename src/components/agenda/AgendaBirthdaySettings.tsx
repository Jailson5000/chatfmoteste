import { useState, useEffect } from "react";
import { Save, Gift, Clock, Percent, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBirthdaySettings } from "@/hooks/useBirthdaySettings";

export function AgendaBirthdaySettings() {
  const { settings, isLoading, saveSettings, defaultMessage } = useBirthdaySettings();
  const [formData, setFormData] = useState({
    enabled: false,
    message_template: defaultMessage,
    send_time: "09:00",
    include_coupon: false,
    coupon_discount_percent: 10,
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        enabled: settings.enabled,
        message_template: settings.message_template,
        send_time: settings.send_time,
        include_coupon: settings.include_coupon,
        coupon_discount_percent: settings.coupon_discount_percent,
      });
    }
  }, [settings]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveSettings.mutateAsync(formData);
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Mensagens de Aniversário</h2>
          <p className="text-sm text-muted-foreground">
            Configure o envio automático de mensagens de parabéns
          </p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || saveSettings.isPending}>
          <Save className="h-4 w-4 mr-2" />
          Salvar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Ativar Mensagens de Aniversário</CardTitle>
                <CardDescription>
                  Envie automaticamente mensagens para clientes no dia do aniversário
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={formData.enabled}
              onCheckedChange={(checked) => handleChange("enabled", checked)}
            />
          </div>
        </CardHeader>
      </Card>

      <Card className={!formData.enabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Horário de Envio
          </CardTitle>
          <CardDescription>
            Defina o horário para enviar as mensagens de aniversário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              type="time"
              value={formData.send_time}
              onChange={(e) => handleChange("send_time", e.target.value)}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">
              (Horário de Brasília)
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className={!formData.enabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Percent className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="text-base">Cupom de Desconto</CardTitle>
                <CardDescription>
                  Ofereça um desconto especial no aniversário do cliente
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={formData.include_coupon}
              onCheckedChange={(checked) => handleChange("include_coupon", checked)}
            />
          </div>
        </CardHeader>
        {formData.include_coupon && (
          <CardContent>
            <div className="space-y-2">
              <Label>Percentual de Desconto</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.coupon_discount_percent}
                  onChange={(e) => handleChange("coupon_discount_percent", parseInt(e.target.value) || 10)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className={!formData.enabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagem
          </CardTitle>
          <CardDescription>
            Personalize a mensagem de aniversário. Use {"{nome}"} para inserir o nome do cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={formData.message_template}
            onChange={(e) => handleChange("message_template", e.target.value)}
            rows={5}
            placeholder="Digite sua mensagem de aniversário..."
          />
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Prévia:</p>
            <p className="text-sm">
              {formData.message_template.replace("{nome}", "Maria")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
