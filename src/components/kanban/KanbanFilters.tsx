import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Bot, User, Wifi, Tag, X } from "lucide-react";

interface FilterState {
  statuses: string[];
  handlers: Array<'ai' | 'human'>;
  connections: string[];
}

interface KanbanFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableStatuses: Array<{ id: string; name: string; color: string }>;
  availableConnections: string[];
}

export function KanbanFilters({ 
  filters, 
  onFiltersChange, 
  availableStatuses,
  availableConnections 
}: KanbanFiltersProps) {
  const activeFiltersCount = 
    filters.statuses.length + 
    filters.handlers.length + 
    filters.connections.length;

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

  const clearFilters = () => {
    onFiltersChange({ statuses: [], handlers: [], connections: [] });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Status Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Tag className="h-3.5 w-3.5" />
            Status
            {filters.statuses.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                {filters.statuses.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filtrar por Status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableStatuses.map(status => (
            <DropdownMenuCheckboxItem
              key={status.id}
              checked={filters.statuses.includes(status.id)}
              onCheckedChange={() => toggleStatus(status.id)}
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: status.color }} 
                />
                {status.name}
              </div>
            </DropdownMenuCheckboxItem>
          ))}
          {availableStatuses.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhum status disponível
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Handler Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <User className="h-3.5 w-3.5" />
            Atendente
            {filters.handlers.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                {filters.handlers.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filtrar por Atendente</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={filters.handlers.includes('ai')}
            onCheckedChange={() => toggleHandler('ai')}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-500" />
              Inteligência Artificial
            </div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={filters.handlers.includes('human')}
            onCheckedChange={() => toggleHandler('human')}
          >
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-green-500" />
              Humano
            </div>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Connection Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Wifi className="h-3.5 w-3.5" />
            Conexão
            {filters.connections.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                {filters.connections.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filtrar por Conexão</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableConnections.map(connection => (
            <DropdownMenuCheckboxItem
              key={connection}
              checked={filters.connections.includes(connection)}
              onCheckedChange={() => toggleConnection(connection)}
            >
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                {connection}
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear filters */}
      {activeFiltersCount > 0 && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-2 text-muted-foreground"
          onClick={clearFilters}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar ({activeFiltersCount})
        </Button>
      )}
    </div>
  );
}
