import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ColorPicker } from "@/components/ui/color-picker";
import { StatusFollowUpEditor } from "./StatusFollowUpEditor";
import type { CustomStatus } from "@/hooks/useCustomStatuses";

interface StatusEditDialogProps {
  status: CustomStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: { name: string; color: string; description?: string }) => Promise<void>;
  isPending?: boolean;
}

export function StatusEditDialog({ 
  status, 
  open, 
  onOpenChange, 
  onSave,
  isPending 
}: StatusEditDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [description, setDescription] = useState("");
  const [activeTab, setActiveTab] = useState("geral");

  useEffect(() => {
    if (status) {
      setName(status.name);
      setColor(status.color);
      setDescription((status as any).description || "");
      setActiveTab("geral");
    }
  }, [status]);

  const handleSave = async () => {
    if (!status || !name.trim()) return;
    await onSave(status.id, { name, color, description });
    onOpenChange(false);
  };

  if (!status) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            Editar Status
            <Badge 
              style={{ 
                backgroundColor: `${color}20`, 
                color: color,
                borderColor: color 
              }}
              variant="outline"
            >
              <span 
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: color }}
              />
              {name || status.name}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Formulário para editar as propriedades do item: nome, cor e descrição
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="followup">Follow Up</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Nome do Status</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do status"
              />
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva quando usar este status..."
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="followup" className="mt-6">
            <StatusFollowUpEditor statusId={status.id} />
          </TabsContent>
        </Tabs>

        <SheetFooter className="mt-6">
          <Button
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="w-full"
          >
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
