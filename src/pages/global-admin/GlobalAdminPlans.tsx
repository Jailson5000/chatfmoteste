import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, CreditCard, Check, Pencil, Trash2 } from "lucide-react";
import { usePlans } from "@/hooks/usePlans";

export default function GlobalAdminPlans() {
  const { plans, isLoading, createPlan, updatePlan, deletePlan } = usePlans();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    billing_period: "monthly",
    max_users: 5,
    max_instances: 2,
    max_messages: 0,
    max_ai_conversations: 250,
    max_tts_minutes: 40,
    max_agents: 1,
    max_workspaces: 1,
    features: [] as string[],
    is_active: true,
  });

  const [newFeature, setNewFeature] = useState("");

  const handleAddFeature = () => {
    if (newFeature.trim()) {
      setFormData({ ...formData, features: [...formData.features, newFeature.trim()] });
      setNewFeature("");
    }
  };

  const handleRemoveFeature = (index: number) => {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index),
    });
  };

  const handleCreate = async () => {
    await createPlan.mutateAsync(formData);
    setIsCreateDialogOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingPlan) return;
    await updatePlan.mutateAsync({ id: editingPlan, ...formData });
    setEditingPlan(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este plano?")) {
      await deletePlan.mutateAsync(id);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: 0,
      billing_period: "monthly",
      max_users: 5,
      max_instances: 2,
      max_messages: 0,
      max_ai_conversations: 250,
      max_tts_minutes: 40,
      max_agents: 1,
      max_workspaces: 1,
      features: [],
      is_active: true,
    });
  };

  const openEditDialog = (plan: typeof plans[0]) => {
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price: plan.price,
      billing_period: plan.billing_period,
      max_users: plan.max_users,
      max_instances: plan.max_instances,
      max_messages: plan.max_messages || 0,
      max_ai_conversations: plan.max_ai_conversations || 250,
      max_tts_minutes: plan.max_tts_minutes || 40,
      max_agents: plan.max_agents || 1,
      max_workspaces: plan.max_workspaces || 1,
      features: plan.features || [],
      is_active: plan.is_active,
    });
    setEditingPlan(plan.id);
  };

  const PlanForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome do Plano</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: Professional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Preço (R$)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Descrição do plano..."
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="max_users">Máx. Usuários</Label>
          <Input
            id="max_users"
            type="number"
            value={formData.max_users}
            onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_instances">Máx. Conexões</Label>
          <Input
            id="max_instances"
            type="number"
            value={formData.max_instances}
            onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_agents">Máx. Agentes IA</Label>
          <Input
            id="max_agents"
            type="number"
            value={formData.max_agents}
            onChange={(e) => setFormData({ ...formData, max_agents: parseInt(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="max_ai_conversations">Conversas IA/mês</Label>
          <Input
            id="max_ai_conversations"
            type="number"
            value={formData.max_ai_conversations}
            onChange={(e) => setFormData({ ...formData, max_ai_conversations: parseInt(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_tts_minutes">Minutos TTS/mês</Label>
          <Input
            id="max_tts_minutes"
            type="number"
            value={formData.max_tts_minutes}
            onChange={(e) => setFormData({ ...formData, max_tts_minutes: parseInt(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_workspaces">Máx. Workspaces</Label>
          <Input
            id="max_workspaces"
            type="number"
            value={formData.max_workspaces}
            onChange={(e) => setFormData({ ...formData, max_workspaces: parseInt(e.target.value) })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Recursos</Label>
        <div className="flex gap-2">
          <Input
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            placeholder="Adicionar recurso..."
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddFeature())}
          />
          <Button type="button" onClick={handleAddFeature}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {formData.features.map((feature, index) => (
            <Badge key={index} variant="secondary" className="cursor-pointer" onClick={() => handleRemoveFeature(index)}>
              {feature} ×
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label>Plano ativo</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planos</h1>
          <p className="text-muted-foreground">
            Gerencie os planos de assinatura do sistema
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Plano</DialogTitle>
              <DialogDescription>
                Configure um novo plano de assinatura
              </DialogDescription>
            </DialogHeader>
            <PlanForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createPlan.isPending}>
                {createPlan.isPending ? "Criando..." : "Criar Plano"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(plan)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">R$ {plan.price.toLocaleString("pt-BR")}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.max_users >= 999 ? "Usuários ilimitados" : `Até ${plan.max_users} usuários`}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.max_instances} conexões WhatsApp
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.max_ai_conversations} conversas IA/mês
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.max_tts_minutes} min. áudio IA/mês
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.max_agents >= 999 ? "Agentes ilimitados" : `${plan.max_agents} agentes de IA`}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.max_workspaces} workspaces
                  </div>
                  {plan.features?.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      {feature}
                    </div>
                  ))}
                </div>
                {!plan.is_active && (
                  <Badge variant="outline">Inativo</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Plano</DialogTitle>
          </DialogHeader>
          <PlanForm isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updatePlan.isPending}>
              {updatePlan.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
