import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Filter, Bot, User, Wifi, Tag, X, Search, Folder } from "lucide-react";
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
  availableStatuses: Array<{ id: string; name: string; color: string }>;
  availableConnections: string[];
  availableDepartments: Array<{ id: string; name: string; color: string }>;
  availableTags: Array<{ id: string; name: string; color: string }>;
}

export function KanbanFilters({ 
  filters, 
  onFiltersChange,
  searchQuery,
  onSearchChange,
  availableStatuses,
  availableConnections,
  availableDepartments,
  availableTags
}: KanbanFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  const activeFiltersCount = 
    filters.statuses.length + 
    filters.handlers.length + 
    filters.connections.length +
    filters.departments.length +
    filters.tags.length;

  const toggleStatus = (statusId: string) => {
    const newStatuses = filters.statuses.includes(statusId)
      ? filters.statuses.filter(s => s !== statusId)
      : [...filters.statuses, statusId];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

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
    const newDepts = filters.departments.includes(deptId)
      ? filters.departments.filter(d => d !== deptId)
      : [...filters.departments, deptId];
    onFiltersChange({ ...filters, departments: newDepts });
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

      {/* Unified Filters Popover */}
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
          
          <ScrollArea className="max-h-[400px]">
            <div className="p-3 space-y-4">
              {/* Status Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Status
                  {filters.statuses.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                      {filters.statuses.length}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 pl-6">
                  {availableStatuses.map(status => (
                    <label 
                      key={status.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
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
                    <p className="text-xs text-muted-foreground">Nenhum status</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Handler Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Atendente
                  {filters.handlers.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                      {filters.handlers.length}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 pl-6">
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <Checkbox 
                      checked={filters.handlers.includes('ai')}
                      onCheckedChange={() => toggleHandler('ai')}
                    />
                    <Bot className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">Inteligência Artificial</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <Checkbox 
                      checked={filters.handlers.includes('human')}
                      onCheckedChange={() => toggleHandler('human')}
                    />
                    <User className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Humano</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Department Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  Departamentos
                  {filters.departments.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                      {filters.departments.length}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 pl-6">
                  {availableDepartments.map(dept => (
                    <label 
                      key={dept.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
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
                    <p className="text-xs text-muted-foreground">Nenhum departamento</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Connection Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  Conexão
                  {filters.connections.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                      {filters.connections.length}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 pl-6">
                  {availableConnections.map(connection => (
                    <label 
                      key={connection} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
                    >
                      <Checkbox 
                        checked={filters.connections.includes(connection)}
                        onCheckedChange={() => toggleConnection(connection)}
                      />
                      <Wifi className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{connection}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Tags Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Etiquetas
                  {filters.tags.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                      {filters.tags.length}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 pl-6">
                  {availableTags.map(tag => (
                    <label 
                      key={tag.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
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
                    <p className="text-xs text-muted-foreground">Nenhuma etiqueta</p>
                  )}
                </div>
              </div>
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