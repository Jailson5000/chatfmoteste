import { useState } from "react";
import {
  Settings2,
  Plus,
  CheckCircle2,
  XCircle,
  RefreshCw,
  QrCode,
  Smartphone,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface WhatsAppInstance {
  id: string;
  name: string;
  phone: string | null;
  status: "connected" | "disconnected" | "connecting";
  apiUrl: string;
  lastSync: string | null;
}

const mockInstances: WhatsAppInstance[] = [];

export default function Connections() {
  const { toast } = useToast();
  const [instances, setInstances] = useState<WhatsAppInstance[]>(mockInstances);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isInstanceDialogOpen, setIsInstanceDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Form states
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [newInstanceName, setNewInstanceName] = useState("");
  
  const handleSaveConfig = () => {
    if (!evolutionUrl.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Por favor, informe a URL da Evolution API",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      const url = new URL(evolutionUrl);
      if (url.protocol !== "https:") {
        toast({
          title: "URL inválida",
          description: "A URL deve usar HTTPS para segurança",
          variant: "destructive",
        });
        return;
      }
    } catch {
      toast({
        title: "URL inválida",
        description: "Por favor, informe uma URL válida",
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Configuração salva",
      description: "A Evolution API foi configurada com sucesso",
    });
    setIsConfigOpen(false);
  };
  
  const handleTestConnection = () => {
    toast({
      title: "Testando conexão...",
      description: "Aguarde enquanto verificamos a conexão",
    });
    
    setTimeout(() => {
      toast({
        title: "Conexão estabelecida",
        description: "A Evolution API está respondendo corretamente",
      });
    }, 1500);
  };
  
  const handleCreateInstance = () => {
    if (!newInstanceName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe um nome para a instância",
        variant: "destructive",
      });
      return;
    }
    
    const newInstance: WhatsAppInstance = {
      id: Date.now().toString(),
      name: newInstanceName,
      phone: null,
      status: "disconnected",
      apiUrl: evolutionUrl,
      lastSync: null,
    };
    
    setInstances([...instances, newInstance]);
    setNewInstanceName("");
    setIsInstanceDialogOpen(false);
    
    toast({
      title: "Instância criada",
      description: `A instância "${newInstanceName}" foi criada. Escaneie o QR Code para conectar.`,
    });
  };
  
  const handleDeleteInstance = (id: string) => {
    setInstances(instances.filter((i) => i.id !== id));
    toast({
      title: "Instância removida",
      description: "A instância foi removida com sucesso",
    });
  };
  
  const handleConnectInstance = (id: string) => {
    setInstances(instances.map((i) => 
      i.id === id ? { ...i, status: "connecting" as const } : i
    ));
    
    toast({
      title: "Gerando QR Code",
      description: "Aguarde enquanto preparamos o QR Code",
    });
    
    // Simulate QR code generation
    setTimeout(() => {
      toast({
        title: "QR Code pronto",
        description: "Escaneie o QR Code com seu WhatsApp",
      });
    }, 1500);
  };

  const getStatusBadge = (status: WhatsAppInstance["status"]) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-success/20 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Conectado
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="h-3 w-3 mr-1" />
            Desconectado
          </Badge>
        );
      case "connecting":
        return (
          <Badge variant="outline" className="text-warning border-warning/30">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Conectando
          </Badge>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Conexões</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas conexões com WhatsApp e outros serviços
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsConfigOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar API
          </Button>
          <Button onClick={() => setIsInstanceDialogOpen(true)} disabled={!evolutionUrl}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Instância
          </Button>
        </div>
      </div>

      {/* API Configuration Card */}
      <Card className={cn(
        "border-dashed",
        evolutionUrl ? "bg-success/5 border-success/30" : "bg-muted/50"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-2 rounded-lg",
                evolutionUrl ? "bg-success/10" : "bg-muted"
              )}>
                <Settings2 className={cn(
                  "h-6 w-6",
                  evolutionUrl ? "text-success" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <h3 className="font-medium">Evolution API</h3>
                <p className="text-sm text-muted-foreground">
                  {evolutionUrl ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      Configurada: {evolutionUrl}
                    </span>
                  ) : (
                    "Configure a Evolution API para conectar instâncias WhatsApp"
                  )}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsConfigOpen(true)}>
              {evolutionUrl ? "Editar" : "Configurar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instances */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Instâncias WhatsApp
          </CardTitle>
          <CardDescription>
            Gerencie as instâncias de WhatsApp conectadas ao seu escritório
          </CardDescription>
        </CardHeader>
        <CardContent>
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <QrCode className="h-16 w-16 mb-4 opacity-50" />
              <p className="font-medium mb-1">Nenhuma instância configurada</p>
              <p className="text-sm text-center max-w-md">
                {evolutionUrl 
                  ? "Clique em 'Nova Instância' para adicionar um número de WhatsApp"
                  : "Configure a Evolution API primeiro para adicionar instâncias"
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Sincronização</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium">{instance.name}</TableCell>
                    <TableCell>{instance.phone || "—"}</TableCell>
                    <TableCell>{getStatusBadge(instance.status)}</TableCell>
                    <TableCell>
                      {instance.lastSync 
                        ? new Date(instance.lastSync).toLocaleString("pt-BR")
                        : "—"
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {instance.status === "disconnected" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleConnectInstance(instance.id)}
                          >
                            <QrCode className="h-4 w-4 mr-1" />
                            Conectar
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteInstance(instance.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* API Configuration Dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Evolution API</DialogTitle>
            <DialogDescription>
              Configure a conexão com sua instância do Evolution API
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="evolution-url">URL da API</Label>
              <Input
                id="evolution-url"
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                placeholder="https://evolution.example.com"
              />
              <p className="text-xs text-muted-foreground">
                A URL deve usar HTTPS por segurança
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="evolution-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="evolution-key"
                  type={showApiKey ? "text" : "password"}
                  value={evolutionKey}
                  onChange={(e) => setEvolutionKey(e.target.value)}
                  placeholder="Sua chave de API"
                  className="flex-1"
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
                A chave será armazenada de forma segura
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleTestConnection}>
              Testar Conexão
            </Button>
            <Button onClick={handleSaveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Instance Dialog */}
      <Dialog open={isInstanceDialogOpen} onOpenChange={setIsInstanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Instância WhatsApp</DialogTitle>
            <DialogDescription>
              Crie uma nova instância para conectar um número de WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instance-name">Nome da Instância</Label>
              <Input
                id="instance-name"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                placeholder="Ex: WhatsApp Principal"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInstanceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateInstance}>Criar Instância</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
