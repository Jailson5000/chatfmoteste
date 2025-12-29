import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { 
  Search, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock,
  RefreshCw,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const actionLabels: Record<string, string> = {
  COMPANY_PROVISION_START: "Início Provisionamento",
  COMPANY_PROVISION_COMPLETE: "Provisionamento Concluído",
  COMPANY_PROVISION_FAIL: "Provisionamento Falhou",
  COMPANY_PROVISION_CRITICAL_FAIL: "Falha Crítica Provisionamento",
  COMPANY_CREATE: "Empresa Criada",
  LAW_FIRM_CREATE: "Escritório Criado",
  AUTOMATION_CREATE: "Automação Criada",
  N8N_WORKFLOW_CREATE: "Workflow Criado",
  N8N_WORKFLOW_ACTIVATE: "Workflow Ativado",
  N8N_WORKFLOW_LINK: "Workflow Vinculado",
  N8N_WORKFLOW_PROVISION_START: "Início Workflow",
  N8N_WORKFLOW_PROVISION_COMPLETE: "Workflow Completo",
  N8N_WORKFLOW_PROVISION_FAIL: "Workflow Falhou",
  N8N_TEMPLATE_FETCH: "Template Obtido",
  create: "Criação",
  update: "Atualização",
  delete: "Exclusão",
};

const entityTypeLabels: Record<string, string> = {
  company: "Empresa",
  law_firm: "Escritório",
  automation: "Automação",
  n8n_workflow: "Workflow n8n",
  plan: "Plano",
  user: "Usuário",
};

export default function GlobalAdminAuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { logs, isLoading, refetch } = useAuditLogs({
    search: searchQuery,
    action: actionFilter !== "all" ? actionFilter : undefined,
    entityType: entityFilter !== "all" ? entityFilter : undefined,
    page,
    pageSize,
  });

  const getStatusBadge = (status: string | undefined) => {
    if (status === "success") {
      return (
        <Badge className="bg-green-600/20 text-green-400 border-green-600/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Sucesso
        </Badge>
      );
    }
    if (status === "failed") {
      return (
        <Badge className="bg-red-600/20 text-red-400 border-red-600/30">
          <XCircle className="h-3 w-3 mr-1" />
          Falhou
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Clock className="h-3 w-3 mr-1" />
        -
      </Badge>
    );
  };

  const uniqueActions = [...new Set(logs.map(log => log.action))];
  const uniqueEntityTypes = [...new Set(logs.map(log => log.entity_type))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logs de Auditoria</h1>
          <p className="text-muted-foreground">
            Histórico de ações e eventos do sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar em logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background/50"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-[220px] bg-background/50">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action}>
                    {actionLabels[action] || action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full md:w-[200px] bg-background/50">
                <SelectValue placeholder="Tipo de entidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {uniqueEntityTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {entityTypeLabels[type] || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Eventos Recentes
            <Badge variant="secondary" className="ml-2">
              {logs.length} registros
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Data/Hora</TableHead>
                      <TableHead className="text-muted-foreground">Ação</TableHead>
                      <TableHead className="text-muted-foreground">Tipo</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum log encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => {
                        const metadata = log.new_values as Record<string, any> || {};
                        const status = metadata?.status;
                        
                        return (
                          <TableRow key={log.id} className="border-border/50">
                            <TableCell className="font-mono text-sm">
                              <div>
                                {format(new Date(log.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-medium">
                                {actionLabels[log.action] || log.action}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {entityTypeLabels[log.entity_type] || log.entity_type}
                              </span>
                              {log.entity_id && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {log.entity_id.slice(0, 8)}...
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(status)}
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-sm text-muted-foreground truncate cursor-pointer hover:text-foreground">
                                      {metadata?.message || metadata?.error || metadata?.company_name || metadata?.workflow_name || "-"}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md">
                                    <pre className="text-xs whitespace-pre-wrap">
                                      {JSON.stringify(metadata, null, 2)}
                                    </pre>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <p className="text-sm text-muted-foreground">
                  Página {page}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={logs.length < pageSize}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
