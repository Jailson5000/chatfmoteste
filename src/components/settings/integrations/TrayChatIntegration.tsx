import { useState } from "react";
import { MessageSquare, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useTrayIntegration } from "@/hooks/useTrayIntegration";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function TrayIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-[#00A651] flex items-center justify-center">
      <MessageSquare className="h-5 w-5 text-white" />
    </div>
  );
}

export function TrayChatIntegration() {
  const { integration, isLoading, toggleIntegration, isToggling } = useTrayIntegration();
  const [showSnippetDialog, setShowSnippetDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const isEnabled = integration?.is_enabled ?? false;

  const handleToggle = async (enabled: boolean) => {
    await toggleIntegration(enabled);
    if (enabled) {
      setShowSnippetDialog(true);
    }
  };

  const handleCopySnippet = async () => {
    if (!integration?.snippet_code) return;
    
    try {
      await navigator.clipboard.writeText(integration.snippet_code);
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar código");
    }
  };

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="p-4 flex items-center gap-4">
          <TrayIcon />
          <div className="flex-1">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-48 bg-muted animate-pulse rounded mt-2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <TrayIcon />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm">Chat no Site (Tray)</h3>
                {isEnabled && (
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                    Ativo
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                Adicione o chat do sistema ao seu site Tray Commerce para atender visitantes em tempo real.
              </p>
              
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="tray-toggle"
                    checked={isEnabled}
                    onCheckedChange={handleToggle}
                    disabled={isToggling}
                  />
                  <Label htmlFor="tray-toggle" className="text-xs">
                    {isToggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      isEnabled ? "Ativado" : "Desativado"
                    )}
                  </Label>
                </div>
                
                {isEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setShowSnippetDialog(true)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver código
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showSnippetDialog} onOpenChange={setShowSnippetDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrayIcon />
              Código do Chat Widget
            </DialogTitle>
            <DialogDescription>
              Cole este código no HEAD ou FOOTER do seu site Tray Commerce.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Textarea
                readOnly
                value={integration?.snippet_code || ""}
                className="font-mono text-xs min-h-[150px] bg-muted"
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={handleCopySnippet}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </>
                )}
              </Button>
            </div>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                ⚠️ <strong>Importante:</strong> Este código é único para sua empresa. Não compartilhe com terceiros.
              </p>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Status:</strong> {isEnabled ? "Integração ativa" : "Integração desativada"}</p>
              {integration?.created_at && (
                <p><strong>Criado em:</strong> {new Date(integration.created_at).toLocaleDateString('pt-BR')}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
