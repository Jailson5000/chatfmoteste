import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, FileText, Database } from "lucide-react";

export function SecuritySubTabs() {
  return (
    <Tabs defaultValue="security" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="security" className="gap-2">
          <Shield className="h-4 w-4" />
          Segurança
        </TabsTrigger>
        <TabsTrigger value="lgpd" className="gap-2">
          <FileText className="h-4 w-4" />
          LGPD
        </TabsTrigger>
      </TabsList>

      {/* Security Tab */}
      <TabsContent value="security" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Configurações de Segurança</CardTitle>
            <CardDescription>
              Controles de acesso e auditoria
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Autenticação em dois fatores</Label>
                <p className="text-sm text-muted-foreground">
                  Exigir 2FA para todos os usuários
                </p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Logs de acesso</Label>
                <p className="text-sm text-muted-foreground">
                  Registrar todas as ações dos usuários
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Criptografia de documentos</Label>
                <p className="text-sm text-muted-foreground">
                  Criptografar arquivos em repouso
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="space-y-2">
              <Label>Tempo de sessão</Label>
              <Select defaultValue="60">
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecione o tempo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                  <SelectItem value="480">8 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* LGPD Tab */}
      <TabsContent value="lgpd" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Conformidade LGPD</CardTitle>
            <CardDescription>
              Configurações de privacidade e proteção de dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Consentimento obrigatório</Label>
                <p className="text-sm text-muted-foreground">
                  Exigir aceite de termos antes do atendimento
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consent-text">Texto de consentimento</Label>
              <Textarea
                id="consent-text"
                rows={4}
                placeholder="Ao continuar, você concorda com..."
                defaultValue="Ao continuar com este atendimento, você autoriza a coleta e processamento dos seus dados pessoais exclusivamente para fins de prestação de serviços, conforme a Lei Geral de Proteção de Dados (LGPD)."
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Retenção de dados</Label>
                <p className="text-sm text-muted-foreground">
                  Período de retenção das conversas
                </p>
              </div>
              <Select defaultValue="5years">
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1year">1 ano</SelectItem>
                  <SelectItem value="3years">3 anos</SelectItem>
                  <SelectItem value="5years">5 anos</SelectItem>
                  <SelectItem value="10years">10 anos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Mascaramento de dados</Label>
                <p className="text-sm text-muted-foreground">
                  Ocultar dados sensíveis em logs
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Solicitações de Dados
            </CardTitle>
            <CardDescription>
              Gerencie solicitações de exclusão ou portabilidade
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma solicitação pendente</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
