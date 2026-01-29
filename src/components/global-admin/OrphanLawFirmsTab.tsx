import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Users,
  MessageSquare,
  UserCircle,
  Bot,
} from "lucide-react";
import { useOrphanLawFirms, OrphanLawFirm } from "@/hooks/useOrphanLawFirms";

export function OrphanLawFirmsTab() {
  const { orphans, isLoading, refetch, cleanup, isCleaningUp, summary } = useOrphanLawFirms();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    lawFirms: OrphanLawFirm[];
    hasData: boolean;
  }>({ open: false, lawFirms: [], hasData: false });
  const [confirmText, setConfirmText] = useState("");

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAllEmpty = () => {
    const emptyIds = orphans.filter(o => o.risk_level === 'safe').map(o => o.id);
    setSelectedIds(new Set(emptyIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleCleanupClick = (lawFirms: OrphanLawFirm[]) => {
    const hasData = lawFirms.some(lf => lf.has_data);
    setConfirmDialog({ open: true, lawFirms, hasData });
    setConfirmText("");
  };

  const handleConfirmCleanup = async () => {
    const ids = confirmDialog.lawFirms.map(lf => lf.id);
    await cleanup({
      lawFirmIds: ids,
      confirmDataDeletion: confirmDialog.hasData,
    });
    setConfirmDialog({ open: false, lawFirms: [], hasData: false });
    setSelectedIds(new Set());
  };

  const selectedOrphans = orphans.filter(o => selectedIds.has(o.id));

  const getRiskBadge = (risk: 'safe' | 'low' | 'attention') => {
    switch (risk) {
      case 'safe':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Seguro</Badge>;
      case 'low':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Baixo</Badge>;
      case 'attention':
        return <Badge variant="destructive">Atenção</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Law Firms Órfãos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info Alert */}
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:bg-yellow-900/20 dark:border-yellow-800">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Law Firms sem Company Associada
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Esses registros ficaram órfãos por falhas no provisionamento ou fluxos de teste antigos.
                  A exclusão remove todos os dados associados permanentemente.
                </p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total Órfãos</p>
            </div>
            <div className="rounded-lg border p-3 text-center bg-green-50 dark:bg-green-900/20">
              <p className="text-2xl font-bold text-green-700">{summary.safe}</p>
              <p className="text-xs text-muted-foreground">Vazios (Seguros)</p>
            </div>
            <div className="rounded-lg border p-3 text-center bg-yellow-50 dark:bg-yellow-900/20">
              <p className="text-2xl font-bold text-yellow-700">{summary.low}</p>
              <p className="text-xs text-muted-foreground">Apenas Usuários</p>
            </div>
            <div className="rounded-lg border p-3 text-center bg-red-50 dark:bg-red-900/20">
              <p className="text-2xl font-bold text-red-700">{summary.attention}</p>
              <p className="text-xs text-muted-foreground">Com Dados</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllEmpty}
                disabled={summary.safe === 0}
              >
                Selecionar Vazios ({summary.safe})
              </Button>
              {selectedIds.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Limpar Seleção
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleCleanupClick(selectedOrphans)}
                  disabled={isCleaningUp}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Selecionados ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          {orphans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <p>Nenhum law firm órfão encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead className="text-center">
                    <Users className="h-4 w-4 mx-auto" />
                  </TableHead>
                  <TableHead className="text-center">
                    <MessageSquare className="h-4 w-4 mx-auto" />
                  </TableHead>
                  <TableHead className="text-center">
                    <UserCircle className="h-4 w-4 mx-auto" />
                  </TableHead>
                  <TableHead className="text-center">
                    <Bot className="h-4 w-4 mx-auto" />
                  </TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphans.map((orphan) => (
                  <TableRow 
                    key={orphan.id}
                    className={orphan.risk_level === 'attention' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(orphan.id)}
                        onCheckedChange={() => toggleSelect(orphan.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{orphan.name}</p>
                        {orphan.email && (
                          <p className="text-xs text-muted-foreground">{orphan.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {orphan.subdomain ? (
                        <span className="font-mono text-sm">{orphan.subdomain}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={orphan.user_count > 0 ? 'font-medium' : 'text-muted-foreground'}>
                        {orphan.user_count}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={orphan.conversation_count > 0 ? 'font-medium text-blue-600' : 'text-muted-foreground'}>
                        {orphan.conversation_count}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={orphan.client_count > 0 ? 'font-medium text-purple-600' : 'text-muted-foreground'}>
                        {orphan.client_count}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={orphan.automation_count > 0 ? 'font-medium' : 'text-muted-foreground'}>
                        {orphan.automation_count}
                      </span>
                    </TableCell>
                    <TableCell>{getRiskBadge(orphan.risk_level)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(orphan.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCleanupClick([orphan])}
                        disabled={isCleaningUp}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, lawFirms: [], hasData: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Exclusão
            </DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Todos os dados associados serão permanentemente removidos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4 space-y-3">
              <p className="font-medium">Serão excluídos:</p>
              <ul className="text-sm space-y-1">
                {confirmDialog.lawFirms.map(lf => (
                  <li key={lf.id} className="flex items-center gap-2">
                    <span className="font-medium">{lf.name}</span>
                    {lf.has_data && (
                      <Badge variant="destructive" className="text-xs">
                        {lf.message_count} msgs, {lf.client_count} clientes
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
              
              {confirmDialog.hasData && (
                <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200">
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                    ⚠️ Um ou mais law firms possuem dados reais (mensagens, clientes).
                  </p>
                </div>
              )}
            </div>

            {confirmDialog.hasData && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Digite <span className="font-mono bg-muted px-1">CONFIRMAR</span> para prosseguir:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Digite CONFIRMAR"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog({ open: false, lawFirms: [], hasData: false })}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCleanup}
              disabled={isCleaningUp || (confirmDialog.hasData && confirmText !== 'CONFIRMAR')}
            >
              {isCleaningUp ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Permanentemente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
