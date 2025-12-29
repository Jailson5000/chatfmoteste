import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Bell, 
  Shield, 
  Database, 
  Globe, 
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { useLawFirmSettings } from "@/hooks/useLawFirmSettings";

export default function AdminSettings() {
  const { settings } = useLawFirmSettings();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações Avançadas</h1>
        <p className="text-muted-foreground">
          Configurações técnicas e de segurança da empresa
        </p>
      </div>

      <div className="grid gap-6">
        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Configuração de API
            </CardTitle>
            <CardDescription>
              Configurações de integração com Evolution API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">URL da API</p>
                <p className="text-sm text-muted-foreground">
                  {settings?.evolution_api_url || "Não configurado"}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/connections">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Gerenciar Conexões
                </a>
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">API Key</p>
                <p className="text-sm text-muted-foreground">
                  {settings?.evolution_api_key ? "••••••••••••" : "Não configurado"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações
            </CardTitle>
            <CardDescription>
              Configurações de notificações da equipe
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notificações por e-mail</Label>
                <p className="text-sm text-muted-foreground">
                  Enviar resumo diário de atividades
                </p>
              </div>
              <Switch disabled />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Alertas de novas conversas</Label>
                <p className="text-sm text-muted-foreground">
                  Notificar quando houver novas mensagens
                </p>
              </div>
              <Switch disabled />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Segurança
            </CardTitle>
            <CardDescription>
              Configurações de segurança e privacidade
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Autenticação em duas etapas (2FA)</Label>
                <p className="text-sm text-muted-foreground">
                  Exigir 2FA para todos os membros
                </p>
              </div>
              <Switch disabled />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Logs de auditoria</Label>
                <p className="text-sm text-muted-foreground">
                  Registrar todas as ações dos usuários
                </p>
              </div>
              <Switch disabled defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Gerenciamento de Dados
            </CardTitle>
            <CardDescription>
              Exportação e backup de dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Exportar Dados</p>
                <p className="text-sm text-muted-foreground">
                  Baixar todos os dados da empresa em formato CSV
                </p>
              </div>
              <Button variant="outline" size="sm" disabled>
                Exportar
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Backup Automático</p>
                <p className="text-sm text-muted-foreground">
                  Último backup: Nunca
                </p>
              </div>
              <Button variant="outline" size="sm" disabled>
                Configurar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Zona de Perigo
            </CardTitle>
            <CardDescription>
              Ações irreversíveis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Excluir Empresa</p>
                <p className="text-sm text-muted-foreground">
                  Remover permanentemente todos os dados
                </p>
              </div>
              <Button variant="destructive" size="sm" disabled>
                Excluir
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
