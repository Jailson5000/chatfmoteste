import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  SlidersHorizontal, 
  CircleDot, 
  Users, 
  Folder, 
  Tag, 
  Wifi, 
  Globe, 
  Calendar as CalendarIcon,
  ChevronDown, 
  ChevronRight,
  X
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AdvancedFilters {
  statuses: string[];
  handlers: string[];
  departments: string[];
  tags: string[];
  connections: string[];
  origins: string[];
  dateRange: { from?: Date; to?: Date };
}

interface AdvancedFiltersSheetProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  availableStatuses: Array<{ id: string; name: string; color: string }>;
  availableTags: Array<{ id: string; name: string; color: string }>;
  availableDepartments: Array<{ id: string; name: string; color: string }>;
  availableConnections: Array<{ id: string; name: string; phone?: string | null }>;
  availableMembers: Array<{ id: string; full_name: string }>;
  totalResults: number;
}

export function AdvancedFiltersSheet({
  filters,
  onFiltersChange,
  availableStatuses,
  availableTags,
  availableDepartments,
  availableConnections,
  availableMembers,
  totalResults,
}: AdvancedFiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [handlerOpen, setHandlerOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [originOpen, setOriginOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const activeFiltersCount = 
    filters.statuses.length + 
    filters.handlers.length + 
    filters.departments.length +
    filters.tags.length +
    filters.connections.length +
    filters.origins.length +
    (filters.dateRange.from || filters.dateRange.to ? 1 : 0);

  const toggleStatus = (statusId: string) => {
    const newStatuses = filters.statuses.includes(statusId)
      ? filters.statuses.filter(s => s !== statusId)
      : [...filters.statuses, statusId];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

  const toggleHandler = (handlerId: string) => {
    const newHandlers = filters.handlers.includes(handlerId)
      ? filters.handlers.filter(h => h !== handlerId)
      : [...filters.handlers, handlerId];
    onFiltersChange({ ...filters, handlers: newHandlers });
  };

  const toggleDepartment = (deptId: string) => {
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

  const toggleConnection = (connId: string) => {
    const newConnections = filters.connections.includes(connId)
      ? filters.connections.filter(c => c !== connId)
      : [...filters.connections, connId];
    onFiltersChange({ ...filters, connections: newConnections });
  };

  const toggleOrigin = (origin: string) => {
    const newOrigins = filters.origins.includes(origin)
      ? filters.origins.filter(o => o !== origin)
      : [...filters.origins, origin];
    onFiltersChange({ ...filters, origins: newOrigins });
  };

  const clearFilters = () => {
    onFiltersChange({
      statuses: [],
      handlers: [],
      departments: [],
      tags: [],
      connections: [],
      origins: [],
      dateRange: {},
    });
  };

  const origins = [
    { id: "whatsapp", name: "WhatsApp" },
    { id: "website", name: "Website" },
    { id: "manual", name: "Manual" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Mais filtros
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px] flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="text-xl font-bold">Filtros</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Configure todos os filtros para refinar sua busca por conversas e veja os resultados em tempo real
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-2">
            {/* Classificação Section */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Classificação
              </p>

              {/* Status */}
              <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <CircleDot className="h-4 w-4 text-muted-foreground" />
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
                <CollapsibleContent className="pl-6 pr-2 py-2 space-y-1">
                  {availableStatuses.map(status => (
                    <label 
                      key={status.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
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
                </CollapsibleContent>
              </Collapsible>

              {/* Responsável */}
              <Collapsible open={handlerOpen} onOpenChange={setHandlerOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
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
                <CollapsibleContent className="pl-6 pr-2 py-2 space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                    <Checkbox 
                      checked={filters.handlers.includes('ai')}
                      onCheckedChange={() => toggleHandler('ai')}
                    />
                    <span className="text-sm">Inteligência Artificial</span>
                  </label>
                  {availableMembers.map(member => (
                    <label 
                      key={member.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                    >
                      <Checkbox 
                        checked={filters.handlers.includes(member.id)}
                        onCheckedChange={() => toggleHandler(member.id)}
                      />
                      <span className="text-sm">{member.full_name}</span>
                    </label>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Departamento */}
              <Collapsible open={departmentOpen} onOpenChange={setDepartmentOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
                  >
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
                <CollapsibleContent className="pl-6 pr-2 py-2 space-y-1">
                  {availableDepartments.map(dept => (
                    <label 
                      key={dept.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
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
                </CollapsibleContent>
              </Collapsible>

              {/* Tags */}
              <Collapsible open={tagOpen} onOpenChange={setTagOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Tags</span>
                      {filters.tags.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.tags.length}
                        </Badge>
                      )}
                    </div>
                    {tagOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 py-2 space-y-1">
                  {availableTags.map(tag => (
                    <label 
                      key={tag.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
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
                </CollapsibleContent>
              </Collapsible>

              {/* Conexão */}
              <Collapsible open={connectionOpen} onOpenChange={setConnectionOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
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
                    {connectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 py-2 space-y-1">
                  {availableConnections.map(conn => (
                    <label 
                      key={conn.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                    >
                      <Checkbox 
                        checked={filters.connections.includes(conn.id)}
                        onCheckedChange={() => toggleConnection(conn.id)}
                      />
                      <span className="text-sm">{conn.name}</span>
                      {conn.phone && (
                        <span className="text-xs text-muted-foreground">
                          ({conn.phone.slice(-4)})
                        </span>
                      )}
                    </label>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <Separator className="my-4" />

            {/* Origem Section */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Origem
              </p>
              
              <Collapsible open={originOpen} onOpenChange={setOriginOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Origem</span>
                      {filters.origins.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {filters.origins.length}
                        </Badge>
                      )}
                    </div>
                    {originOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 py-2 space-y-1">
                  {origins.map(origin => (
                    <label 
                      key={origin.id} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                    >
                      <Checkbox 
                        checked={filters.origins.includes(origin.id)}
                        onCheckedChange={() => toggleOrigin(origin.id)}
                      />
                      <span className="text-sm">{origin.name}</span>
                    </label>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <Separator className="my-4" />

            {/* Período Section */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Período
              </p>
              
              <Collapsible open={periodOpen} onOpenChange={setPeriodOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-10 px-3 bg-muted/50 hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Período</span>
                      {(filters.dateRange.from || filters.dateRange.to) && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          1
                        </Badge>
                      )}
                    </div>
                    {periodOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !filters.dateRange.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateRange.from ? (
                            format(filters.dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            "Data início"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.dateRange.from}
                          onSelect={(date) => onFiltersChange({
                            ...filters,
                            dateRange: { ...filters.dateRange, from: date }
                          })}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground">até</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !filters.dateRange.to && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateRange.to ? (
                            format(filters.dateRange.to, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            "Data fim"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.dateRange.to}
                          onSelect={(date) => onFiltersChange({
                            ...filters,
                            dateRange: { ...filters.dateRange, to: date }
                          })}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <Separator className="my-4" />

            {/* Avançado Section */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between h-10 px-3"
                >
                  <span className="text-sm text-muted-foreground">Ver mais</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="py-2">
                <p className="text-sm text-muted-foreground text-center py-4">
                  Mais opções de filtro em breve...
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-6 pt-4 border-t flex items-center justify-between gap-3">
          <Button 
            variant="ghost" 
            onClick={clearFilters}
            disabled={activeFiltersCount === 0}
          >
            Limpar todos
          </Button>
          <Button onClick={() => setOpen(false)}>
            Mostrar {totalResults.toLocaleString('pt-BR')} resultados
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
