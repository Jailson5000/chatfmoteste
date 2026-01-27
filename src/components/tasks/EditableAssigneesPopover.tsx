import { useState, useEffect } from "react";
import { Check, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface EditableAssigneesPopoverProps {
  selectedIds: string[];
  teamMembers: TeamMember[];
  onSave: (selectedIds: string[]) => void;
  isPending?: boolean;
}

export function EditableAssigneesPopover({
  selectedIds,
  teamMembers,
  onSave,
  isPending,
}: EditableAssigneesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds);

  // Sync with prop when opening
  useEffect(() => {
    if (open) {
      setLocalSelected(selectedIds);
      setSearch("");
    }
  }, [open, selectedIds]);

  const filteredMembers = teamMembers.filter((member) =>
    member.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (memberId: string) => {
    setLocalSelected((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSave = () => {
    onSave(localSelected);
    setOpen(false);
  };

  const hasChanges = JSON.stringify(localSelected.sort()) !== JSON.stringify(selectedIds.sort());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <UserPlus className="h-3 w-3" />
          Editar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar membro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[200px]">
          <div className="p-2">
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                Nenhum membro encontrado
              </p>
            ) : (
              filteredMembers.map((member) => {
                const isSelected = localSelected.includes(member.id);
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-muted"
                    )}
                    onClick={() => handleToggle(member.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {member.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 truncate">
                      {member.full_name}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isPending}
          >
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
