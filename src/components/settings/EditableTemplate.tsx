import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, MessageSquareText, Image, Video, Mic } from "lucide-react";

interface EditableTemplateProps {
  id: string;
  name: string;
  shortcut: string;
  content: string;
  category: string;
  onUpdate: (data: { id: string; name: string; shortcut: string; content: string; category: string }) => void;
  onDelete: (id: string) => void;
  isPending?: boolean;
}

const templateTypes = [
  { value: "text", label: "Texto", icon: MessageSquareText },
  { value: "image", label: "Imagem", icon: Image },
  { value: "video", label: "Vídeo", icon: Video },
  { value: "audio", label: "Áudio", icon: Mic },
];

export function EditableTemplate({
  id,
  name,
  shortcut,
  content,
  category,
  onUpdate,
  onDelete,
  isPending,
}: EditableTemplateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editShortcut, setEditShortcut] = useState(shortcut);
  const [editContent, setEditContent] = useState(content);
  const [editCategory, setEditCategory] = useState(category || "text");

  const templateType = templateTypes.find(t => t.value === category) || templateTypes[0];
  const TypeIcon = templateType.icon;

  const handleSave = () => {
    onUpdate({ id, name: editName, shortcut: editShortcut, content: editContent, category: editCategory });
    setIsOpen(false);
  };

  const handleOpen = () => {
    setEditName(name);
    setEditShortcut(shortcut);
    setEditContent(content);
    setEditCategory(category || "text");
    setIsOpen(true);
  };

  return (
    <>
      <div className="flex items-start justify-between p-4 rounded-lg border">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <TypeIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{name}</span>
              <Badge variant="secondary" className="text-xs">
                /{shortcut}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">
                {templateType.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {content.startsWith("[") 
                ? content.split("\n").slice(1).join("\n") || "Mídia anexada"
                : content
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleOpen}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Tipo de Template</Label>
              <div className="grid grid-cols-4 gap-2">
                {templateTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setEditCategory(type.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                      editCategory === type.value 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <type.icon className={`h-5 w-5 ${editCategory === type.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs ${editCategory === type.value ? "text-primary font-medium" : "text-muted-foreground"}`}>
                      {type.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nome do Template</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ex: Boas-vindas"
              />
            </div>
            <div className="space-y-2">
              <Label>Atalho (comando)</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">/</span>
                <Input
                  value={editShortcut}
                  onChange={(e) => setEditShortcut(e.target.value.toLowerCase().replace(/\s/g, ""))}
                  placeholder="boasvindas"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Conteúdo do template..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isPending || !editName.trim() || !editShortcut.trim()}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
