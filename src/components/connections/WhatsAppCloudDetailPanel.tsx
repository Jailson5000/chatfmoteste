import { MessageCircle, Bot, Phone, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface MetaConnection {
  id: string;
  page_name: string | null;
  page_id: string;
  type: string;
  is_active: boolean;
  created_at: string;
  default_department_id: string | null;
  default_status_id: string | null;
  default_automation_id: string | null;
  default_handler_type: string | null;
  default_human_agent_id: string | null;
}

interface WhatsAppCloudDetailPanelProps {
  connection: MetaConnection;
  onClose: () => void;
  onDeleted: () => void;
  departments: Array<{ id: string; name: string; color: string }>;
  statuses: Array<{ id: string; name: string; color: string }>;
  automations: Array<{ id: string; name: string; is_active: boolean }>;
  teamMembers: Array<{ id: string; full_name: string; avatar_url: string | null }>;
}

export function WhatsAppCloudDetailPanel({
  connection,
  onClose,
  onDeleted,
  departments,
  statuses,
  automations,
  teamMembers,
}: WhatsAppCloudDetailPanelProps) {
  const { toast } = useToast();
  const [isActive, setIsActive] = useState(connection.is_active);

  const updateField = async (field: string, value: any) => {
    const { error } = await supabase
      .from("meta_connections")
      .update({ [field]: value } as any)
      .eq("id", connection.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (active: boolean) => {
    setIsActive(active);
    await updateField("is_active", active);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("meta_connections").delete().eq("id", connection.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conexão excluída" });
      onDeleted();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <SheetHeader className="p-6 border-b bg-gradient-to-r from-[#25D366]/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-[#25D366]/20 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-[#25D366]" />
          </div>
          <div>
            <SheetTitle className="text-[#25D366]">
              {connection.page_name || "WhatsApp Cloud"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              API Oficial
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-[#25D366]/10 text-[#25D366]">
                CLOUD
              </Badge>
            </p>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Ativo</span>
          <Switch checked={isActive} onCheckedChange={handleToggleActive} />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Phone Number ID</span>
          <span className="font-mono text-xs">{connection.page_id}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Criado em</span>
          <span>{new Date(connection.created_at).toLocaleDateString("pt-BR")}</span>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold mb-4">Configurações Padrão</h3>
          <div className="space-y-4">
            {/* Status Padrão */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Status Padrão</label>
              <Select
                value={connection.default_status_id || "none"}
                onValueChange={(v) => updateField("default_status_id", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Departamento */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Departamento Padrão</label>
              <Select
                value={connection.default_department_id || "none"}
                onValueChange={(v) => updateField("default_department_id", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Atendimento */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Tipo de Atendimento</label>
              <Select
                value={connection.default_handler_type || "human"}
                onValueChange={(v) => {
                  updateField("default_handler_type", v);
                  if (v === "human") updateField("default_automation_id", null);
                  else updateField("default_human_agent_id", null);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="human">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-green-500" /> Atendente Humano
                    </div>
                  </SelectItem>
                  <SelectItem value="ai">
                    <div className="flex items-center gap-2">
                      <Bot className="h-3 w-3 text-blue-500" /> Agente IA
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agente IA */}
            {(connection.default_handler_type === "ai") && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Agente IA</label>
                <Select
                  value={connection.default_automation_id || "none"}
                  onValueChange={(v) => updateField("default_automation_id", v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {automations.filter((a) => a.is_active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="h-3 w-3 text-blue-500" /> {a.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Atendente Humano */}
            {(connection.default_handler_type === "human") && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Atendente Responsável</label>
                <Select
                  value={connection.default_human_agent_id || "none"}
                  onValueChange={(v) => updateField("default_human_agent_id", v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Fila)</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={m.avatar_url || undefined} />
                            <AvatarFallback className="text-[8px]">
                              {m.full_name?.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {m.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t pt-6">
          <Button variant="destructive" className="w-full" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir Conexão
          </Button>
        </div>
      </div>
    </div>
  );
}
