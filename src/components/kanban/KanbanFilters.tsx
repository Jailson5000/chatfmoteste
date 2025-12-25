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
import { Filter, Bot, User, Wifi, Tag, X, Search, Folder, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface FilterState {
  statuses: string[];
  handlers: Array<'ai' | 'human'>;
  connections: string[];
  departments: string[];
  tags: string[];
}

interface KanbanFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableConnections: string[];
  availableDepartments: Array<{ id: string; name: string; color: string }>;
  availableTags: Array<{ id: string; name: string; color: string }>;
}

export function KanbanFilters({ 
  filters, 
  onFiltersChange,
  searchQuery,
  onSearchChange,
  availableConnections,
  availableDepartments,
  availableTags
}: KanbanFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [handlerOpen, setHandlerOpen] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  
  const activeFiltersCount = 
    filters.handlers.length + 
    filters.connections.length +
    filters.departments.length +
    filters.tags.length;

  const toggleHandler = (handler: 'ai' | 'human') => {
    const newHandlers = filters.handlers.includes(handler)
      ? filters.handlers.filter(h => h !== handler)
      : [...filters.handlers, handler];
    onFiltersChange({ ...filters, handlers: newHandlers });
  };

  const toggleConnection = (connection: string) => {
    const newConnections = filters.connections.includes(connection)
      ? filters.connections.filter(c => c !== connection)
      : [...filters.connections, connection];
    onFiltersChange({ ...filters, connections: newConnections });
  };

  const toggleDepartment = (deptId: string) => {
    // Multi-select departments
    const newDepartments = filters.departments.includes(deptId)
      ? filters.departments.filter(d => d !== deptId)
      : [...filters.departments, deptId];
    onFiltersChange({ ...filters, departments: newDepartments });
  };

  const toggleTag = (tagId: string) => {
    const newTags = filters.tags.includes(tagId)
      ? filters.tags.filter(t => t !== tagId)
      : [...filters.tags, tagId];
    onFiltersChange({ ...filters, tags: newTags });
  };

  const clearFilters = () => {
    onFiltersChange({ statuses: [], handlers: [], connections: [], departments: [], tags: [] });
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
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

      {/* Cascade Filters Popover */}
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
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
                  Limpar todos
                </Button>
              )}
            </div>
          </div>
          
          <ScrollArea className="max-h-[60vh] overflow-y-auto">
            <div className="p-2 space-y-1">

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
                </CollapsibleContent>
              </Collapsible>

              <Separator className="my-1" />

              {/* Department Filter - Cascade */}
              <Collapsible open={deptOpen} onOpenChange={setDeptOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-9 px-2"
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Departamentos</span>
                      {filters.departments.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.departments.length}
                        </Badge>
                      )}
                    </div>
                    {deptOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                  {/* Sem Departamento option */}
                  <label 
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                  >
                    <Checkbox 
                      checked={filters.departments.includes("none")}
                      onCheckedChange={() => toggleDepartment("none")}
                    />
                    <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
                    <span className="text-sm">Sem Departamento</span>
                  </label>
                  {availableDepartments.map(dept => (
                    <label 
                      key={dept.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                    >
                      <Checkbox 
                        checked={filters.departments.includes(dept.id)}
                        onCheckedChange={() => toggleDepartment(dept.id)}
                      />
                      <div 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: dept.color }} 
                      />
                      <span className="text-sm">{dept.name}</span>
                    </label>
                  ))}
                  {availableDepartments.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">Nenhum departamento</p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Separator className="my-1" />

              {/* Connection Filter - Cascade */}
              <Collapsible open={connectionOpen} onOpenChange={setConnectionOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-9 px-2"
                  >
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Conexão</span>
                      {filters.connections.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.connections.length}
                        </Badge>
                      )}
                    </div>
                    {connectionOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                  {availableConnections.map(connection => (
                    <label 
                      key={connection} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                    >
                      <Checkbox 
                        checked={filters.connections.includes(connection)}
                        onCheckedChange={() => toggleConnection(connection)}
                      />
                      <Wifi className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{connection}</span>
                    </label>
                  ))}
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
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Active filter badges */}
      {activeFiltersCount > 0 && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-9 px-2 text-muted-foreground"
          onClick={clearFilters}
        >
          <X className="h-4 w-4 mr-1" />
          Limpar ({activeFiltersCount})
        </Button>
      )}
    </div>
  );
}
