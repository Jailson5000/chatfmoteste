import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Globe, 
  Copy, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  Server,
  Shield,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface DomainConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: {
    id: string;
    name: string;
    law_firm?: {
      id: string;
      subdomain: string | null;
    } | null;
  } | null;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: string;
}

type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed';

export function DomainConfigDialog({ open, onOpenChange, company }: DomainConfigDialogProps) {
  const [customDomain, setCustomDomain] = useState("");
  const [domainStatus, setDomainStatus] = useState<DomainStatus>('pending');
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const subdomain = company?.law_firm?.subdomain;
  const defaultDomain = subdomain ? `${subdomain}.miauchat.com.br` : null;

  // DNS records for custom domain
  const dnsRecords: DnsRecord[] = [
    {
      type: "A",
      name: "@",
      value: "185.158.133.1",
      ttl: "3600"
    },
    {
      type: "A",
      name: "www",
      value: "185.158.133.1",
      ttl: "3600"
    },
    {
      type: "TXT",
      name: "_miauchat",
      value: `miauchat_verify=${company?.law_firm?.id || 'COMPANY_ID'}`,
      ttl: "3600"
    },
    {
      type: "CNAME",
      name: "www",
      value: defaultDomain || "empresa.miauchat.com.br",
      ttl: "3600"
    }
  ];

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copiado para a área de transferência");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleVerifyDomain = async () => {
    if (!customDomain) {
      toast.error("Digite um domínio para verificar");
      return;
    }

    setIsVerifying(true);
    setDomainStatus('verifying');

    // Simulate DNS verification (in production, this would call an edge function)
    setTimeout(() => {
      setIsVerifying(false);
      // Randomly set status for demo - in production this would be real verification
      const statuses: DomainStatus[] = ['active', 'failed', 'pending'];
      setDomainStatus(statuses[Math.floor(Math.random() * statuses.length)]);
    }, 3000);
  };

  const getStatusBadge = (status: DomainStatus) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case 'verifying':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1 animate-spin" />
            Verificando
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <AlertCircle className="h-3 w-3 mr-1" />
            Falha
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Configuração de Domínio - {company.name}
          </DialogTitle>
          <DialogDescription>
            Configure o domínio padrão e domínios customizados para esta empresa
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="default" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="default">Domínio Padrão</TabsTrigger>
            <TabsTrigger value="custom">Domínio Customizado</TabsTrigger>
          </TabsList>

          <TabsContent value="default" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Subdomínio MiauChat
                </CardTitle>
                <CardDescription>
                  Este é o domínio padrão fornecido automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">
                        {defaultDomain || "Nenhum subdomínio configurado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Domínio ativo e funcionando
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                    {defaultDomain && (
                      <Button variant="outline" size="sm" asChild>
                        <a 
                          href={`https://${defaultDomain}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-400">SSL/HTTPS Ativo</p>
                      <p className="text-sm text-muted-foreground">
                        Certificado SSL provisionado automaticamente. Todas as conexões são seguras.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Adicionar Domínio Customizado</CardTitle>
                <CardDescription>
                  Configure um domínio próprio para sua empresa (ex: app.suaempresa.com.br)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="custom-domain">Domínio</Label>
                  <div className="flex gap-2">
                    <Input
                      id="custom-domain"
                      placeholder="app.suaempresa.com.br"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleVerifyDomain}
                      disabled={isVerifying || !customDomain}
                    >
                      {isVerifying ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Verificando
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Verificar
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {customDomain && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <span className="text-sm">{customDomain}</span>
                    {getStatusBadge(domainStatus)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Configuração DNS
                </CardTitle>
                <CardDescription>
                  Adicione os seguintes registros DNS no painel do seu provedor de domínio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dnsRecords.map((record, index) => (
                    <div 
                      key={index}
                      className="grid grid-cols-12 gap-3 p-3 rounded-lg bg-muted/30 border text-sm"
                    >
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Tipo</span>
                        <p className="font-mono font-medium">{record.type}</p>
                      </div>
                      <div className="col-span-3">
                        <span className="text-muted-foreground text-xs">Nome</span>
                        <p className="font-mono font-medium">{record.name}</p>
                      </div>
                      <div className="col-span-5">
                        <span className="text-muted-foreground text-xs">Valor</span>
                        <p className="font-mono font-medium truncate" title={record.value}>
                          {record.value}
                        </p>
                      </div>
                      <div className="col-span-1">
                        <span className="text-muted-foreground text-xs">TTL</span>
                        <p className="font-mono font-medium">{record.ttl}</p>
                      </div>
                      <div className="col-span-1 flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyToClipboard(record.value, `record-${index}`)}
                        >
                          {copiedField === `record-${index}` ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-yellow-400">Importante</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Propagação DNS pode levar até 72 horas</li>
                        <li>• Certificado SSL será provisionado automaticamente após verificação</li>
                        <li>• Remova registros A/CNAME conflitantes do domínio</li>
                        <li>• Use <a href="https://dnschecker.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">DNSChecker.org</a> para verificar propagação</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Domínios Configurados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum domínio customizado configurado</p>
                  <p className="text-sm">Adicione um domínio acima para começar</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
