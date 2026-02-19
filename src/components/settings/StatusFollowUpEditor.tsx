import { useState } from "react";
import { Plus, GripVertical, Copy, Trash2, Search, HelpCircle, ChevronDown, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useStatusFollowUps, type StatusFollowUp } from "@/hooks/useStatusFollowUps";
import { useTemplates } from "@/hooks/useTemplates";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";

interface StatusFollowUpEditorProps {
  statusId: string;
}

export function StatusFollowUpEditor({ statusId }: StatusFollowUpEditorProps) {
  const { followUps, createFollowUp, updateFollowUp, deleteFollowUp } = useStatusFollowUps(statusId);
  const { templates } = useTemplates();
  const { statuses } = useCustomStatuses();
  const [searchQuery, setSearchQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  // Filter out the current status from the dropdown options
  const availableStatuses = statuses.filter(s => s.id !== statusId);

  const filteredFollowUps = followUps.filter(f => {
    // If no search query, show all follow-ups
    if (!searchQuery.trim()) return true;
    // Otherwise filter by template name/shortcut
    return f.template?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.template?.shortcut?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAddFollowUp = async () => {
    await createFollowUp.mutateAsync({
      status_id: statusId,
      template_id: null,
      delay_minutes: 10,
      delay_unit: "min",
      position: followUps.length,
      give_up_on_no_response: false,
    });
  };

  const handleUpdateFollowUp = async (id: string, updates: Partial<StatusFollowUp>) => {
    await updateFollowUp.mutateAsync({ id, ...updates });
  };

  const handleDeleteFollowUp = async (id: string) => {
    await deleteFollowUp.mutateAsync(id);
  };

  const handleDuplicateFollowUp = async (followUp: StatusFollowUp) => {
    await createFollowUp.mutateAsync({
      status_id: statusId,
      template_id: followUp.template_id,
      delay_minutes: followUp.delay_minutes,
      delay_unit: followUp.delay_unit,
      position: followUps.length,
      give_up_on_no_response: followUp.give_up_on_no_response,
    });
  };

  return (
    <div className="space-y-4">
      {/* Search and Help */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar Follow Up..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              Como funcionam os Follow Ups?
              <ChevronDown className={`h-4 w-4 transition-transform ${helpOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="absolute right-0 mt-2 w-96 p-4 bg-popover border rounded-lg shadow-lg z-50">
            <h4 className="font-semibold mb-2">Como funcionam os Follow Ups?</h4>
            <p className="text-sm text-muted-foreground">
              Follow Ups são mensagens automáticas enviadas aos clientes quando eles entram em um status específico. 
              Você pode configurar múltiplos follow-ups em sequência, cada um com seu próprio tempo de espera.
            </p>
            <ul className="mt-3 text-sm text-muted-foreground space-y-1">
              <li>• Selecione um template de mensagem</li>
              <li>• Defina o tempo de espera antes do envio</li>
              <li>• O follow-up é cancelado se o cliente responder</li>
              <li>• Marque "desistir do lead" para parar a sequência se não houver resposta</li>
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Follow-up List */}
      <div className="space-y-3">
        {filteredFollowUps.map((followUp, index) => (
          <FollowUpCard
            key={followUp.id}
            followUp={followUp}
            index={index + 1}
            templates={templates}
            statuses={availableStatuses}
            onUpdate={handleUpdateFollowUp}
            onDelete={handleDeleteFollowUp}
            onDuplicate={handleDuplicateFollowUp}
          />
        ))}

        {/* Add new follow-up placeholder */}
        <div 
          onClick={handleAddFollowUp}
          className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <Button 
              size="icon" 
              variant="outline" 
              className="rounded-full h-10 w-10"
              disabled={createFollowUp.isPending}
            >
              <Plus className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Enviar</span>
              <div className="px-3 py-1 bg-muted rounded flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <span className="text-sm">/template</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>depois de</span>
              <div className="px-2 py-1 bg-muted rounded">10</div>
              <span>min.</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {followUps.length === 0 
              ? "Clique para adicionar seu primeiro follow up"
              : "Clique para adicionar um novo follow up"
            }
          </p>
        </div>
      </div>
    </div>
  );
}

interface FollowUpCardProps {
  followUp: StatusFollowUp;
  index: number;
  templates: Array<{ id: string; name: string; shortcut: string }>;
  statuses: Array<{ id: string; name: string; color: string }>;
  onUpdate: (id: string, updates: Partial<StatusFollowUp>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (followUp: StatusFollowUp) => Promise<void>;
}

function FollowUpCard({ followUp, index, templates, statuses, onUpdate, onDelete, onDuplicate }: FollowUpCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = async (field: keyof StatusFollowUp, value: any) => {
    setIsUpdating(true);
    try {
      // If turning off give_up, also clear the status
      if (field === "give_up_on_no_response" && value === false) {
        await onUpdate(followUp.id, { [field]: value, give_up_status_id: null });
      } else {
        await onUpdate(followUp.id, { [field]: value });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-start gap-3">
        {/* Drag Handle & Index */}
        <div className="flex items-center gap-2 pt-1">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
            {index}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {/* Template & Delay Row */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">Enviar</Label>
              <Select
                value={followUp.template_id || ""}
                onValueChange={(value) => handleChange("template_id", value || null)}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecione um template">
                    {followUp.template ? (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        /{followUp.template.shortcut}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        /template
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      /{template.shortcut} - {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">depois de</Label>
              <Input
                type="number"
                value={followUp.delay_minutes}
                onChange={(e) => {
                  const raw = parseInt(e.target.value) || 1;
                  if (followUp.delay_unit === "min") {
                    const rounded = Math.max(10, Math.round(raw / 10) * 10);
                    handleChange("delay_minutes", rounded);
                  } else {
                    handleChange("delay_minutes", Math.max(1, raw));
                  }
                }}
                className="w-20"
                min={followUp.delay_unit === "min" ? 10 : 1}
                step={followUp.delay_unit === "min" ? 10 : 1}
                disabled={isUpdating}
              />
              <Select
                value={followUp.delay_unit}
                onValueChange={(value) => {
                  handleChange("delay_unit", value);
                  // Ao mudar para minutos, ajustar valor para múltiplo de 10
                  if (value === "min" && followUp.delay_minutes < 10) {
                    handleChange("delay_minutes", 10);
                  } else if (value === "min") {
                    const rounded = Math.round(followUp.delay_minutes / 10) * 10;
                    handleChange("delay_minutes", Math.max(10, rounded));
                  }
                }}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="min">min.</SelectItem>
                  <SelectItem value="hour">hora(s)</SelectItem>
                  <SelectItem value="day">dia(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Give up toggle and status selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={followUp.give_up_on_no_response}
                onCheckedChange={(checked) => handleChange("give_up_on_no_response", checked)}
                disabled={isUpdating}
              />
              <Label className="text-muted-foreground cursor-pointer">
                desistir do lead?
              </Label>
            </div>

            {/* Status selection when give_up is enabled */}
            {followUp.give_up_on_no_response && (
              <div className="flex items-center gap-2 pl-12">
                <Label className="text-muted-foreground">Alterar status para</Label>
                <Select
                  value={followUp.give_up_status_id || ""}
                  onValueChange={(value) => handleChange("give_up_status_id", value || null)}
                  disabled={isUpdating}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Status">
                      {followUp.give_up_status ? (
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: followUp.give_up_status.color }}
                          />
                          {followUp.give_up_status.name}
                        </span>
                      ) : (
                        "Status"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: status.color }}
                          />
                          {status.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="text-muted-foreground">e arquivar conversa</Label>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDuplicate(followUp)}
            disabled={isUpdating}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(followUp.id)}
            disabled={isUpdating}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
