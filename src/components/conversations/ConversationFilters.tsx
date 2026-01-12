import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Filter, Bot, User, Tag, X, Search, ChevronDown, ChevronRight, Folder, UserX } from "lucide-react";
import { useState } from "react";

interface FilterState {
  statuses: string[];
  handlers: Array<'ai' | 'human' | 'unassigned'>;
  tags: string[];
  departments: string[];
  searchName: string;
  searchPhone: string;
}

interface ConversationFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableStatuses: Array<{ id: string; name: string; color: string }>;
  availableTags: Array<{ id: string; name: string; color: string }>;
  availableDepartments?: Array<{ id: string; name: string; color: string }>;
}

export function ConversationFilters({ 
  filters, 
  onFiltersChange,
  searchQuery,
  onSearchChange,
  availableStatuses,
  availableTags,
  availableDepartments = []
}: ConversationFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [handlerOpen, setHandlerOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  
  const activeFiltersCount = 
    filters.statuses.length + 
    filters.handlers.length + 
    filters.tags.length +
    (filters.departments?.length || 0);

  const toggleStatus = (statusId: string) => {
    const newStatuses = filters.statuses.includes(statusId)
      ? filters.statuses.filter(s => s !== statusId)
      : [...filters.statuses, statusId];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

  const toggleHandler = (handler: 'ai' | 'human' | 'unassigned') => {
    const newHandlers = filters.handlers.includes(handler)
      ? filters.handlers.filter(h => h !== handler)
      : [...filters.handlers, handler];
    onFiltersChange({ ...filters, handlers: newHandlers });
  };

  const toggleTag = (tagId: string) => {
    const newTags = filters.tags.includes(tagId)
      ? filters.tags.filter(t => t !== tagId)
      : [...filters.tags, tagId];
    onFiltersChange({ ...filters, tags: newTags });
  };

  const toggleDepartment = (deptId: string) => {
    const currentDepts = filters.departments || [];
    const newDepartments = currentDepts.includes(deptId)
      ? currentDepts.filter(d => d !== deptId)
      : [...currentDepts, deptId];
    onFiltersChange({ ...filters, departments: newDepartments });
  };

  const clearFilters = () => {
    onFiltersChange({ statuses: [], handlers: [], tags: [], departments: [], searchName: '', searchPhone: '' });
    onSearchChange('');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar conversa..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => onSearchChange('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Cascade Filters Popover - estilo Kanban */}
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="h-4 w-4" />
            Mais filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
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
                  onClick={clearFilters}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
          
          <ScrollArea className="max-h-[60vh]">
            <div className="p-2 space-y-1">
              {/* Status Filter - Cascade */}
              <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-9 px-2"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Status</span>
                      {filters.statuses.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.statuses.length}
                        </Badge>
                      )}
                    </div>
                    {statusOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                  {availableStatuses.map(status => (
                    <label 
                      key={status.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                    >
                      <Checkbox 
                        checked={filters.statuses.includes(status.id)}
                        onCheckedChange={() => toggleStatus(status.id)}
                      />
                      <div 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: status.color }} 
                      />
                      <span className="text-sm">{status.name}</span>
                    </label>
                  ))}
                  {availableStatuses.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">Nenhum status</p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Separator className="my-1" />

              {/* Handler Filter - Cascade */}
              <Collapsible open={handlerOpen} onOpenChange={setHandlerOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-9 px-2"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Atendente</span>
                      {filters.handlers.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.handlers.length}
                        </Badge>
                      )}
                    </div>
                    {handlerOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                    <Checkbox 
                      checked={filters.handlers.includes('ai')}
                      onCheckedChange={() => toggleHandler('ai')}
                    />
                    <Bot className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">Inteligência Artificial</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                    <Checkbox 
                      checked={filters.handlers.includes('human')}
                      onCheckedChange={() => toggleHandler('human')}
                    />
                    <User className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Humano</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                    <Checkbox 
                      checked={filters.handlers.includes('unassigned' as any)}
                      onCheckedChange={() => toggleHandler('unassigned' as any)}
                    />
                    <UserX className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Sem responsável</span>
                  </label>
                </CollapsibleContent>
              </Collapsible>

              <Separator className="my-1" />

              {/* Tags Filter - Cascade */}
              <Collapsible open={tagOpen} onOpenChange={setTagOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-9 px-2"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Etiquetas</span>
                      {filters.tags.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.tags.length}
                        </Badge>
                      )}
                    </div>
                    {tagOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                  {availableTags.map(tag => (
                    <label 
                      key={tag.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                    >
                      <Checkbox 
                        checked={filters.tags.includes(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <div 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: tag.color }} 
                      />
                      <span className="text-sm">{tag.name}</span>
                    </label>
                  ))}
                  {availableTags.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">Nenhuma etiqueta</p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {availableDepartments.length > 0 && (
                <>
                  <Separator className="my-1" />

                  {/* Department Filter - Cascade */}
                  <Collapsible open={departmentOpen} onOpenChange={setDepartmentOpen}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between h-9 px-2"
                      >
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Departamento</span>
                          {(filters.departments?.length || 0) > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {filters.departments?.length}
                            </Badge>
                          )}
                        </div>
                        {departmentOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                      {availableDepartments.map(dept => (
                        <label 
                          key={dept.id} 
                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                        >
                          <Checkbox 
                            checked={filters.departments?.includes(dept.id) || false}
                            onCheckedChange={() => toggleDepartment(dept.id)}
                          />
                          <div 
                            className="w-2.5 h-2.5 rounded-full" 
                            style={{ backgroundColor: dept.color }} 
                          />
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
    </div>
  );
}
