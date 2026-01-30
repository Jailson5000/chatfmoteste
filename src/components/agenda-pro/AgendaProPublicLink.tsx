import { useState } from "react";
import { Copy, Check, ExternalLink, Link2, Globe, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAgendaPro } from "@/hooks/useAgendaPro";
import { useToast } from "@/hooks/use-toast";

export function AgendaProPublicLink() {
  const { settings, updateSettings, isLoading } = useAgendaPro();
  const { toast } = useToast();
  const [slug, setSlug] = useState(settings?.public_slug || "");
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const baseUrl = window.location.origin;
  const publicUrl = slug ? `${baseUrl}/agendar/${slug}` : "";

  const handleTogglePublic = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({ public_booking_enabled: enabled });
      toast({ 
        title: enabled ? "Link público ativado!" : "Link público desativado",
        description: enabled ? "Clientes podem agendar online" : "Apenas você pode criar agendamentos"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSlug = async () => {
    if (!slug.trim()) {
      toast({ title: "Informe um slug válido", variant: "destructive" });
      return;
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      toast({ 
        title: "Slug inválido", 
        description: "Use apenas letras minúsculas, números e hífens",
        variant: "destructive" 
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({ public_slug: slug });
      toast({ title: "Slug salvo com sucesso!" });
    } catch (error: any) {
      if (error.message?.includes("duplicate")) {
        toast({ 
          title: "Slug já em uso", 
          description: "Escolha outro identificador",
          variant: "destructive" 
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: "Link copiado!" });
      setTimeout(() => setCopied(false), 2000);
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
      {/* Enable/Disable */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Agendamento Online</CardTitle>
              <CardDescription>
                Permita que clientes agendem diretamente pelo link público
              </CardDescription>
            </div>
            <Switch
              checked={settings?.public_booking_enabled ?? false}
              onCheckedChange={handleTogglePublic}
              disabled={isSaving}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Public URL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Seu Link Público
          </CardTitle>
          <CardDescription>
            Compartilhe este link com seus clientes para agendamento online
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="slug">Identificador único</Label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-1 text-sm text-muted-foreground bg-muted rounded-lg px-3">
                <span>{baseUrl}/agendar/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="minha-clinica"
                  className="border-0 bg-transparent px-0 focus-visible:ring-0 text-foreground"
                />
              </div>
              <Button onClick={handleSaveSlug} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use apenas letras minúsculas, números e hífens
            </p>
          </div>

          {settings?.public_slug && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Link de agendamento:</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-background rounded px-3 py-2 truncate">
                    {publicUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(publicUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Alerta quando slug existe mas link está desativado */}
              {!settings?.public_booking_enabled && (
                <Alert variant="destructive" className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-300">
                    <strong>Link inativo!</strong> Ative o "Agendamento Online" acima para que 
                    seus clientes possam acessar este link. Atualmente, o link mostrará 
                    "Agenda não encontrada".
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1. Ative o agendamento online no switch acima</p>
          <p>2. Configure um identificador único (slug) para sua página</p>
          <p>3. Compartilhe o link com seus clientes</p>
          <p>4. Clientes poderão escolher serviço, profissional, data e horário</p>
          <p>5. Você receberá os agendamentos na sua agenda</p>
          
          <div className="pt-4 border-t">
            <h4 className="font-medium text-foreground mb-2">Dicas:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Coloque o link no seu Instagram, site ou cartão de visita</li>
              <li>Configure os serviços como "públicos" para aparecerem no link</li>
              <li>Ative as confirmações automáticas por WhatsApp</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
