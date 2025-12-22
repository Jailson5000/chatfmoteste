import { useState } from "react";
import {
  Building2,
  Users,
  Shield,
  Bell,
  Database,
  FileText,
  Save,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const teamMembers = [
  { id: "1", name: "Dr. Carlos Mendes", email: "carlos@escritorio.com", role: "admin", oab: "OAB/SP 123456" },
  { id: "2", name: "Dra. Fernanda Lima", email: "fernanda@escritorio.com", role: "advogado", oab: "OAB/SP 234567" },
  { id: "3", name: "Dr. Roberto Alves", email: "roberto@escritorio.com", role: "advogado", oab: "OAB/SP 345678" },
  { id: "4", name: "Ana Silva", email: "ana@escritorio.com", role: "estagiario", oab: null },
  { id: "5", name: "João Santos", email: "joao@escritorio.com", role: "atendente", oab: null },
];

const roleLabels = {
  admin: { label: "Administrador", color: "bg-primary text-primary-foreground" },
  advogado: { label: "Advogado", color: "bg-accent text-accent-foreground" },
  estagiario: { label: "Estagiário", color: "bg-secondary text-secondary-foreground" },
  atendente: { label: "Atendente", color: "bg-muted text-muted-foreground" },
};

export default function Settings() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    toast({
      title: "Configurações salvas",
      description: "Suas alterações foram salvas com sucesso.",
    });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu escritório, equipe e preferências
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      <Tabs defaultValue="office">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="office">
            <Building2 className="h-4 w-4 mr-2" />
            Escritório
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" />
            Equipe
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="lgpd">
            <FileText className="h-4 w-4 mr-2" />
            LGPD
          </TabsTrigger>
        </TabsList>

        {/* Office Settings */}
        <TabsContent value="office" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Escritório</CardTitle>
              <CardDescription>
                Informações básicas do seu escritório de advocacia
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="office-name">Nome do Escritório</Label>
                  <Input id="office-name" placeholder="Escritório de Advocacia" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-cnpj">CNPJ</Label>
                  <Input id="office-cnpj" placeholder="00.000.000/0001-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-phone">Telefone</Label>
                  <Input id="office-phone" placeholder="(11) 3000-0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-email">Email</Label>
                  <Input id="office-email" type="email" placeholder="contato@escritorio.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-address">Endereço</Label>
                <Textarea id="office-address" placeholder="Rua, número, bairro, cidade - UF" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Settings */}
        <TabsContent value="team" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Membros da Equipe</CardTitle>
                  <CardDescription>
                    Gerencie os usuários e suas permissões
                  </CardDescription>
                </div>
                <Button>
                  <Users className="h-4 w-4 mr-2" />
                  Convidar membro
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>OAB</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge className={roleLabels[member.role as keyof typeof roleLabels].color}>
                          {roleLabels[member.role as keyof typeof roleLabels].label}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.oab || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
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
                    Exigir 2FA para todos os advogados
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

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>
                Configure quando e como você quer ser notificado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Nova conversa</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando um novo cliente entrar em contato
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Transferência para advogado</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando a IA transferir para humano
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Documentos recebidos</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando um cliente enviar documentos
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Resumo diário</Label>
                  <p className="text-sm text-muted-foreground">
                    Receber um resumo das atividades do dia
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LGPD */}
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
                  defaultValue="Ao continuar com este atendimento, você autoriza a coleta e processamento dos seus dados pessoais exclusivamente para fins de prestação de serviços jurídicos, conforme a Lei Geral de Proteção de Dados (LGPD)."
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
    </div>
  );
}
