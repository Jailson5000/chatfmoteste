import { useState } from "react";
import { Eye, EyeOff, Loader2, Save, TestTube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface EvolutionAdminConfigProps {
  apiUrl: string;
  apiKey: string;
  onApiUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => void;
  onSave: () => void;
  onTest: () => Promise<void>;
  isTesting: boolean;
  isSaving: boolean;
  isConfigured: boolean;
}

export function EvolutionAdminConfig({
  apiUrl,
  apiKey,
  onApiUrlChange,
  onApiKeyChange,
  onSave,
  onTest,
  isTesting,
  isSaving,
  isConfigured,
}: EvolutionAdminConfigProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha a URL e a API Key para testar a conexão",
        variant: "destructive",
      });
      return;
    }
    await onTest();
  };

  return (
    <div className="space-y-4">
      <Alert className="bg-primary/5 border-primary/20">
        <AlertDescription className="text-sm">
          <strong>Configuração Admin:</strong> Insira a API Key Global do Evolution. 
          Esta chave será armazenada de forma segura e nunca será exposta aos clientes.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="evolution-url">URL do Servidor Evolution</Label>
          <Input
            id="evolution-url"
            value={apiUrl}
            onChange={(e) => onApiUrlChange(e.target.value)}
            placeholder="https://evolution.seuservidor.com"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            URL completa da sua instância Evolution API
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="evolution-key">API Key Global</Label>
          <div className="flex gap-2">
            <Input
              id="evolution-key"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Sua chave de API"
              className="flex-1 font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A chave será armazenada de forma segura no backend
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={isTesting || !apiUrl.trim() || !apiKey.trim()}
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testando...
            </>
          ) : (
            <>
              <TestTube className="h-4 w-4 mr-2" />
              Testar Conexão
            </>
          )}
        </Button>
        <Button onClick={onSave} disabled={isSaving || !apiUrl.trim() || !apiKey.trim()}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configuração
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
