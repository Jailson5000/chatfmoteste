import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Users, Wifi, Loader2, Package, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAdminAddonRequests } from "@/hooks/useAddonRequests";
import { formatCurrency, calculateAdditionalCosts, ADDITIONAL_PRICING } from "@/lib/billing-config";

export function AddonRequestsSection() {
  const { pendingRequests, isLoading, approveRequest, rejectRequest } = useAdminAddonRequests();
  const [rejectingRequest, setRejectingRequest] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch company details with plan info for calculating new total
  const { data: companiesData } = useQuery({
    queryKey: ["addon-companies-plans"],
    queryFn: async () => {
      // First get companies
      const { data: companies, error: companyError } = await supabase
        .from("companies")
        .select(`
          id,
          plan_id,
          max_users,
          max_instances,
          max_agents,
          max_ai_conversations,
          max_tts_minutes,
          use_custom_limits
        `);
      if (companyError) throw companyError;
      
      // Then get plans
      const { data: plans, error: planError } = await supabase
        .from("plans")
        .select("id, name, price, max_users, max_instances, max_agents, max_ai_conversations, max_tts_minutes");
      if (planError) throw planError;
      
      // Join manually
      return companies?.map(company => ({
        ...company,
        plan: plans?.find(p => p.id === company.plan_id) || null,
      }));
    },
    enabled: pendingRequests.length > 0,
  });

  const getCompanyBillingInfo = (companyId: string, additionalUsers: number, additionalInstances: number) => {
    const company = companiesData?.find(c => c.id === companyId);
    if (!company || !company.plan) return null;

    const plan = company.plan;

    // Calculate what the NEW limits will be after approval
    const currentExtraUsers = company.use_custom_limits ? Math.max(0, (company.max_users || 0) - plan.max_users) : 0;
    const currentExtraInstances = company.use_custom_limits ? Math.max(0, (company.max_instances || 0) - plan.max_instances) : 0;

    const newTotalExtraUsers = currentExtraUsers + additionalUsers;
    const newTotalExtraInstances = currentExtraInstances + additionalInstances;

    const additionalCost = (newTotalExtraUsers * ADDITIONAL_PRICING.user) + (newTotalExtraInstances * ADDITIONAL_PRICING.whatsappInstance);
    const newMonthlyTotal = plan.price + additionalCost;

    return {
      planName: plan.name,
      planPrice: plan.price,
      currentExtraUsers,
      currentExtraInstances,
      newTotalExtraUsers,
      newTotalExtraInstances,
      additionalCost,
      newMonthlyTotal,
    };
  };

  const handleApprove = (requestId: string, companyId: string, additionalUsers: number, additionalInstances: number) => {
    const billingInfo = getCompanyBillingInfo(companyId, additionalUsers, additionalInstances);
    
    approveRequest.mutate({
      requestId,
      companyId,
      newMonthlyValue: billingInfo?.newMonthlyTotal,
    });
  };

  const handleReject = () => {
    if (!rejectingRequest) return;
    rejectRequest.mutate({
      requestId: rejectingRequest,
      reason: rejectionReason || undefined,
    });
    setRejectingRequest(null);
    setRejectionReason("");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Solicitações de Adicionais
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (pendingRequests.length === 0) {
    return null; // Hide when no pending requests
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Solicitações de Adicionais
            <Badge variant="secondary" className="ml-2">
              {pendingRequests.length} pendente{pendingRequests.length > 1 ? "s" : ""}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Adicionais</TableHead>
                <TableHead>Valor Mensal</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRequests.map((request) => {
                const company = request.company as { id: string; name: string; email: string } | null;
                
                return (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{company?.name || "Empresa desconhecida"}</p>
                        <p className="text-sm text-muted-foreground">{company?.email || "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {request.additional_users > 0 && (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>+{request.additional_users} usuário(s)</span>
                          </div>
                        )}
                        {request.additional_instances > 0 && (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>+{request.additional_instances} conexão(ões)</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-primary">
                        {formatCurrency(request.monthly_cost)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setRejectingRequest(request.id)}
                          disabled={rejectRequest.isPending}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Rejeitar
                        </Button>
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90"
                          onClick={() => handleApprove(
                            request.id, 
                            request.company_id, 
                            request.additional_users, 
                            request.additional_instances
                          )}
                          disabled={approveRequest.isPending}
                        >
                          {approveRequest.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Aprovar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={!!rejectingRequest} onOpenChange={(open) => !open && setRejectingRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição (opcional). O cliente será notificado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Motivo da rejeição..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingRequest(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectRequest.isPending}>
              {rejectRequest.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
