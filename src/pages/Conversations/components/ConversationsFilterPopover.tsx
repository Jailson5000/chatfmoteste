import React, { useState } from "react";
import { Filter, Tag, Folder, Bot, User, UserX, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConversationFilters } from "../types";

interface ConversationsFilterPopoverProps {
  filters: ConversationFilters;
  statuses: Array<{ id: string; name: string; color: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  departments: Array<{ id: string; name: string; color: string }>;
  activeFiltersCount: number;
  onToggleStatus: (id: string) => void;
  onToggleHandler: (handler: 'ai' | 'human' | 'unassigned') => void;
  onToggleTag: (id: string) => void;
  onToggleDepartment: (id: string) => void;
  onClearAll: () => void;
}

export const ConversationsFilterPopover = React.memo(function ConversationsFilterPopover({
  filters,
  statuses,
  tags,
  departments,
  activeFiltersCount,
  onToggleStatus,
  onToggleHandler,
  onToggleTag,
  onToggleDepartment,
  onClearAll,
}: ConversationsFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [handlerOpen, setHandlerOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 relative">
          <Filter className="h-4 w-4" />
          {activeFiltersCount > 0 && (
            <Badge 
              variant="secondary" 
              className="absolute -top-1 -right-1 h-4 px-1 text-[10px] min-w-4"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Filtros</h4>
            {activeFiltersCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onClearAll}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="max-h-[50vh]">
          <div className="p-2 space-y-1">
            {/* Status Filter */}
            <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-9 px-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Status</span>
                    {filters.statuses.length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {filters.statuses.length}
                      </Badge>
                    )}
                  </div>
                  {statusOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                {statuses.map(status => (
                  <label key={status.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                    <Checkbox 
                      checked={filters.statuses.includes(status.id)}
                      onCheckedChange={() => onToggleStatus(status.id)}
                    />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                    <span className="text-sm">{status.name}</span>
                  </label>
                ))}
                {statuses.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">Nenhum status</p>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Separator className="my-1" />

            {/* Handler Filter */}
            <Collapsible open={handlerOpen} onOpenChange={setHandlerOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-9 px-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Responsável</span>
                    {filters.handlers.length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {filters.handlers.length}
                      </Badge>
                    )}
                  </div>
                  {handlerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                  <Checkbox 
                    checked={filters.handlers.includes('ai')}
                    onCheckedChange={() => onToggleHandler('ai')}
                  />
                  <Bot className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Inteligência Artificial</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                  <Checkbox 
                    checked={filters.handlers.includes('human')}
                    onCheckedChange={() => onToggleHandler('human')}
                  />
                  <User className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Humano</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                  <Checkbox 
                    checked={filters.handlers.includes('unassigned')}
                    onCheckedChange={() => onToggleHandler('unassigned')}
                  />
                  <UserX className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Sem responsável</span>
                </label>
              </CollapsibleContent>
            </Collapsible>

            <Separator className="my-1" />

            {/* Tags Filter */}
            <Collapsible open={tagOpen} onOpenChange={setTagOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-9 px-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Etiquetas</span>
                    {filters.tags.length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {filters.tags.length}
                      </Badge>
                    )}
                  </div>
                  {tagOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                {tags.map(tag => (
                  <label key={tag.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                    <Checkbox 
                      checked={filters.tags.includes(tag.id)}
                      onCheckedChange={() => onToggleTag(tag.id)}
                    />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="text-sm">{tag.name}</span>
                  </label>
                ))}
                {tags.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">Nenhuma etiqueta</p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {departments.length > 0 && (
              <>
                <Separator className="my-1" />

                {/* Department Filter */}
                <Collapsible open={departmentOpen} onOpenChange={setDepartmentOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between h-9 px-2">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Departamento</span>
                        {filters.departments.length > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {filters.departments.length}
                          </Badge>
                        )}
                      </div>
                      {departmentOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                    {departments.map(dept => (
                      <label key={dept.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                        <Checkbox 
                          checked={filters.departments.includes(dept.id)}
                          onCheckedChange={() => onToggleDepartment(dept.id)}
                        />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                        <span className="text-sm">{dept.name}</span>
                      </label>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});
