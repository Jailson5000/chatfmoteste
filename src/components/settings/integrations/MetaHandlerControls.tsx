import { Bot, User } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutomations } from "@/hooks/useAutomations";
import { useTeamMembers } from "@/hooks/useTeamMembers";

interface MetaHandlerControlsProps {
  handlerType: string;
  automationId: string | null;
  humanAgentId: string | null;
  disabled?: boolean;
  onHandlerTypeChange: (value: string) => void;
  onAutomationChange: (value: string) => void;
  onHumanAgentChange: (value: string) => void;
}

export function MetaHandlerControls({
  handlerType,
  automationId,
  humanAgentId,
  disabled = false,
  onHandlerTypeChange,
  onAutomationChange,
  onHumanAgentChange,
}: MetaHandlerControlsProps) {
  const { automations } = useAutomations();
  const { members: teamMembers } = useTeamMembers();

  const activeAutomations = automations?.filter(a => a.is_active) || [];
  const activeMembers = teamMembers?.filter(m => m.is_active) || [];

  return (
    <div className="space-y-3 border-t pt-3 mt-3">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-muted-foreground min-w-[100px]">
          Atendimento:
        </Label>
        <Select
          value={handlerType}
          onValueChange={onHandlerTypeChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="human">
              <div className="flex items-center gap-2">
                <User className="h-3 w-3" />
                <span>Humano</span>
              </div>
            </SelectItem>
            <SelectItem value="ai">
              <div className="flex items-center gap-2">
                <Bot className="h-3 w-3" />
                <span>Agente IA</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {handlerType === "ai" && (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground min-w-[100px]">
            Agente IA:
          </Label>
          <Select
            value={automationId || "none"}
            onValueChange={onAutomationChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Selecione um agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum (aguardar humano)</SelectItem>
              {activeAutomations.map(automation => (
                <SelectItem key={automation.id} value={automation.id}>
                  {automation.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {handlerType === "human" && (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground min-w-[100px]">
            Responsável:
          </Label>
          <Select
            value={humanAgentId || "none"}
            onValueChange={onHumanAgentChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Selecione um responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Fila (sem responsável)</SelectItem>
              {activeMembers.map(member => (
                <SelectItem key={member.id} value={member.id}>
                  {member.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
