import { useState } from "react";
import { 
  Users, 
  Circle, 
  SlidersHorizontal, 
  Check, 
  Search, 
  ChevronDown,
  ChevronUp,
  Building2, 
  Smartphone, 
  Tag, 
  Calendar as CalendarIcon,
  Bot,
  Mail,
  MessageCircle,
  Eye,
  Focus,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  type?: 'human' | 'ai';
}

export interface Status {
  id: string;
  name: string;
  color: string;
}

export interface Department {
  id: string;
  name: string;
  color: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Connection {
  id: string;
  name: string;
  phone?: string | null;
}

export interface AdvancedFilters {
  onlyUnread?: boolean;
  onlyNoResponse?: boolean;
  shadowMode?: boolean;
  focusMode?: boolean;
  showInactive?: boolean;
}

export interface FilterBarProps {
  // Responsible filter
  selectedResponsibles: string[];
  onResponsiblesChange: (ids: string[]) => void;
  teamMembers: TeamMember[];
  
  // Status filter
  selectedStatuses: string[];
  onStatusesChange: (ids: string[]) => void;
  statuses: Status[];
  
  // Advanced filters (shown in dialog)
  selectedDepartments?: string[];
  onDepartmentsChange?: (ids: string[]) => void;
  departments?: Department[];
  
  selectedTags?: string[];
  onTagsChange?: (ids: string[]) => void;
  tags?: Tag[];
  
  selectedConnections?: string[];
  onConnectionsChange?: (ids: string[]) => void;
  connections?: Connection[];
  
  // Date range filter
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  
  // Advanced toggle filters
  advancedFilters?: AdvancedFilters;
  onAdvancedFiltersChange?: (filters: AdvancedFilters) => void;
  
  // Results count for the dialog
  resultsCount?: number;
  
  // Optional: hide certain filters
  hideResponsible?: boolean;
  hideStatus?: boolean;
  hideAdvanced?: boolean;
}

// Quick date period options
const quickPeriods = [
  { label: "Hoje", getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: "Ontem", getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: "Últimos 7 dias", getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Esta semana", getValue: () => ({ from: startOfWeek(new Date(), { locale: ptBR }), to: endOfWeek(new Date(), { locale: ptBR }) }) },
  { label: "Últimos 30 dias", getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "Este mês", getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Mês passado", getValue: () => {
    const lastMonth = subDays(startOfMonth(new Date()), 1);
    return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
  }},
  { label: "Todo o tempo", getValue: () => undefined },
];

export function FilterBar({
  selectedResponsibles,
  onResponsiblesChange,
  teamMembers,
  selectedStatuses,
  onStatusesChange,
  statuses,
  selectedDepartments = [],
  onDepartmentsChange,
  departments = [],
  selectedTags = [],
  onTagsChange,
  tags = [],
  selectedConnections = [],
  onConnectionsChange,
  connections = [],
  dateRange,
  onDateRangeChange,
  advancedFilters = {},
  onAdvancedFiltersChange,
  resultsCount,
  hideResponsible,
  hideStatus,
  hideAdvanced,
}: FilterBarProps) {
  const [responsibleOpen, setResponsibleOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [responsibleSearch, setResponsibleSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  
  // Dialog internal state for collapsible sections
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [responsibleExpanded, setResponsibleExpanded] = useState(false);
  const [deptExpanded, setDeptExpanded] = useState(false);
  const [periodExpanded, setPeriodExpanded] = useState(false);
  const [connExpanded, setConnExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  const advancedTogglesCount = Object.values(advancedFilters).filter(Boolean).length;

  const advancedFiltersCount = 
    selectedStatuses.length +
    selectedResponsibles.length +
    selectedDepartments.length + 
    selectedTags.length + 
    selectedConnections.length +
    (dateRange?.from ? 1 : 0) +
    advancedTogglesCount;

  const toggleResponsible = (id: string) => {
    const newSelection = selectedResponsibles.includes(id)
      ? selectedResponsibles.filter(r => r !== id)
      : [...selectedResponsibles, id];
    onResponsiblesChange(newSelection);
  };

  const toggleStatus = (id: string) => {
    const newSelection = selectedStatuses.includes(id)
      ? selectedStatuses.filter(s => s !== id)
      : [...selectedStatuses, id];
    onStatusesChange(newSelection);
  };

  const updateAdvancedFilter = (key: keyof AdvancedFilters, value: boolean) => {
    onAdvancedFiltersChange?.({
      ...advancedFilters,
      [key]: value,
    });
  };

  const filteredMembers = teamMembers.filter(m => 
    m.full_name.toLowerCase().includes(responsibleSearch.toLowerCase())
  );

  const filteredStatuses = statuses.filter(s => 
    s.name.toLowerCase().includes(statusSearch.toLowerCase())
  );

  const clearAllFilters = () => {
    onResponsiblesChange([]);
    onStatusesChange([]);
    onDepartmentsChange?.([]);
    onTagsChange?.([]);
    onConnectionsChange?.([]);
    onDateRangeChange?.(undefined);
    onAdvancedFiltersChange?.({});
  };

  return (
    <div className="flex items-center gap-2">
      {/* Responsible Filter */}
      {!hideResponsible && (
        <Popover open={responsibleOpen} onOpenChange={setResponsibleOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 gap-2 border-border bg-transparent",
                selectedResponsibles.length > 0 && "border-primary/50"
              )}
            >
              <Users className="h-4 w-4" />
              <span>Responsável</span>
              {selectedResponsibles.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-primary/20 text-primary">
                  {selectedResponsibles.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 bg-popover" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar responsável..."
                  value={responsibleSearch}
                  onChange={(e) => setResponsibleSearch(e.target.value)}
                  className="pl-8 h-8 bg-transparent border-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="p-1">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => toggleResponsible(member.id)}
                    className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox 
                      checked={selectedResponsibles.includes(member.id)}
                      className="pointer-events-none"
                    />
                    {member.type === 'ai' ? (
                      <div className="h-7 w-7 rounded-full bg-violet-500/20 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-violet-500" />
                      </div>
                    ) : (
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/20 text-primary">
                          {member.full_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 text-left">
                      <span className="text-sm truncate block">{member.full_name}</span>
                      {member.type === 'ai' && (
                        <span className="text-xs text-violet-500">Agente IA</span>
                      )}
                    </div>
                    {selectedResponsibles.includes(member.id) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
                {filteredMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum responsável encontrado
                  </p>
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}

      {/* Status Filter */}
      {!hideStatus && (
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 gap-2 border-border bg-transparent",
                selectedStatuses.length > 0 && "border-primary/50"
              )}
            >
              <Circle className="h-4 w-4" />
              <span>Status</span>
              {selectedStatuses.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-primary/20 text-primary">
                  {selectedStatuses.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 bg-popover" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Circle className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar status..."
                  value={statusSearch}
                  onChange={(e) => setStatusSearch(e.target.value)}
                  className="pl-8 h-8 bg-transparent border-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="p-1">
                {filteredStatuses.map((status) => (
                  <button
                    key={status.id}
                    onClick={() => toggleStatus(status.id)}
                    className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox 
                      checked={selectedStatuses.includes(status.id)}
                      className="pointer-events-none"
                    />
                    <Badge
                      variant="outline"
                      className="font-normal"
                      style={{
                        backgroundColor: `${status.color}20`,
                        borderColor: status.color,
                        color: status.color,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: status.color }}
                      />
                      {status.name}
                    </Badge>
                    {selectedStatuses.includes(status.id) && (
                      <Check className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </button>
                ))}
                {filteredStatuses.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum status encontrado
                  </p>
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}

      {/* Advanced Filters Button - Opens Dialog */}
      {!hideAdvanced && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 gap-2 border-border bg-transparent",
                advancedFiltersCount > 0 && "border-primary/50"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Mais filtros</span>
              {advancedFiltersCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-primary/20 text-primary">
                  {advancedFiltersCount}
                </Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 pb-4">
              <DialogTitle>Filtros</DialogTitle>
              <DialogDescription>
                Configure todos os filtros para refinar sua busca por conversas e veja os resultados em tempo real
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 pb-4">
                {/* Classification Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Classificação</h4>
                  
                  {/* Status */}
                  <Collapsible open={statusExpanded} onOpenChange={setStatusExpanded}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <Circle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">Status</span>
                        {selectedStatuses.length > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {selectedStatuses.length}
                          </Badge>
                        )}
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", statusExpanded && "rotate-180")} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-1">
                      {statuses.map(status => (
                        <button
                          key={status.id}
                          onClick={() => toggleStatus(status.id)}
                          className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox checked={selectedStatuses.includes(status.id)} className="pointer-events-none" />
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                          <span className="text-sm">{status.name}</span>
                        </button>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Responsável */}
                  <Collapsible open={responsibleExpanded} onOpenChange={setResponsibleExpanded}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">Responsável</span>
                        {selectedResponsibles.length > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {selectedResponsibles.length}
                          </Badge>
                        )}
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", responsibleExpanded && "rotate-180")} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-1">
                      {teamMembers.map(member => (
                        <button
                          key={member.id}
                          onClick={() => toggleResponsible(member.id)}
                          className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox checked={selectedResponsibles.includes(member.id)} className="pointer-events-none" />
                          {member.type === 'ai' ? (
                            <Bot className="h-4 w-4 text-violet-500" />
                          ) : (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                                {member.full_name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span className="text-sm">{member.full_name}</span>
                          {member.type === 'ai' && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-violet-500/20 text-violet-500 border-0">IA</Badge>
                          )}
                        </button>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Departamento */}
                  {departments.length > 0 && (
                    <Collapsible open={deptExpanded} onOpenChange={setDeptExpanded}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">Departamento</span>
                          {selectedDepartments.length > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {selectedDepartments.length}
                            </Badge>
                          )}
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", deptExpanded && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2 space-y-1">
                        {departments.map(dept => (
                          <button
                            key={dept.id}
                            onClick={() => {
                              const newSelection = selectedDepartments.includes(dept.id)
                                ? selectedDepartments.filter(d => d !== dept.id)
                                : [...selectedDepartments, dept.id];
                              onDepartmentsChange?.(newSelection);
                            }}
                            className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox checked={selectedDepartments.includes(dept.id)} className="pointer-events-none" />
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color }} />
                            <span className="text-sm">{dept.name}</span>
                          </button>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <Collapsible open={tagsExpanded} onOpenChange={setTagsExpanded}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">Tags</span>
                          {selectedTags.length > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {selectedTags.length}
                            </Badge>
                          )}
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", tagsExpanded && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2 space-y-1">
                        {tags.map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => {
                              const newSelection = selectedTags.includes(tag.id)
                                ? selectedTags.filter(t => t !== tag.id)
                                : [...selectedTags, tag.id];
                              onTagsChange?.(newSelection);
                            }}
                            className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox checked={selectedTags.includes(tag.id)} className="pointer-events-none" />
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            <span className="text-sm">{tag.name}</span>
                          </button>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Conexão */}
                  {connections.length > 0 && (
                    <Collapsible open={connExpanded} onOpenChange={setConnExpanded}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">Conexão</span>
                          {selectedConnections.length > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {selectedConnections.length}
                            </Badge>
                          )}
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", connExpanded && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2 space-y-1">
                        {connections.map(conn => (
                          <button
                            key={conn.id}
                            onClick={() => {
                              const newSelection = selectedConnections.includes(conn.id)
                                ? selectedConnections.filter(c => c !== conn.id)
                                : [...selectedConnections, conn.id];
                              onConnectionsChange?.(newSelection);
                            }}
                            className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox checked={selectedConnections.includes(conn.id)} className="pointer-events-none" />
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm flex-1">{conn.name}</span>
                            {conn.phone && (
                              <span className="text-xs text-muted-foreground">{conn.phone}</span>
                            )}
                          </button>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>

                {/* Período Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Período</h4>
                  <Collapsible open={periodExpanded} onOpenChange={setPeriodExpanded}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">
                          {dateRange?.from ? (
                            dateRange.to ? (
                              `${format(dateRange.from, "dd/MM/yy")} - ${format(dateRange.to, "dd/MM/yy")}`
                            ) : (
                              format(dateRange.from, "dd/MM/yyyy")
                            )
                          ) : (
                            "Período"
                          )}
                        </span>
                        {dateRange?.from && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">1</Badge>
                        )}
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", periodExpanded && "rotate-180")} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="rounded-lg border border-border bg-muted/20 p-3 overflow-visible">
                        <div className="flex gap-4 flex-wrap">
                          {/* Quick periods */}
                          <div className="space-y-1 min-w-[130px]">
                            <p className="text-xs font-medium text-muted-foreground mb-2">PERÍODOS RÁPIDOS</p>
                            {quickPeriods.map((period) => (
                              <button
                                key={period.label}
                                onClick={() => onDateRangeChange?.(period.getValue())}
                                className={cn(
                                  "block w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 transition-colors",
                                  !dateRange?.from && period.label === "Todo o tempo" && "text-primary font-medium"
                                )}
                              >
                                {period.label}
                              </button>
                            ))}
                          </div>
                          
                          {/* Calendar */}
                          <div className="flex-1 min-w-[280px]">
                            <Calendar
                              mode="range"
                              selected={dateRange}
                              onSelect={onDateRangeChange}
                              locale={ptBR}
                              className={cn("rounded-md pointer-events-auto")}
                              numberOfMonths={1}
                            />
                          </div>
                        </div>
                        
                        {dateRange?.from && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <Badge variant="secondary" className="gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              {dateRange.to ? (
                                `${format(dateRange.from, "dd MMM", { locale: ptBR })} - ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`
                              ) : (
                                format(dateRange.from, "dd MMM yyyy", { locale: ptBR })
                              )}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Avançado Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Avançado</h4>
                  <Collapsible open={advancedExpanded} onOpenChange={setAdvancedExpanded}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
                      {advancedExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {advancedExpanded ? "Ver menos" : "Ver mais"}
                      {advancedTogglesCount > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-auto">
                          {advancedTogglesCount}
                        </Badge>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 space-y-3">
                      {/* Somente conversas não lidas */}
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <Switch
                          checked={advancedFilters.onlyUnread || false}
                          onCheckedChange={(checked) => updateAdvancedFilter('onlyUnread', checked)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Somente conversas não lidas</p>
                          <p className="text-xs text-muted-foreground">Mostra apenas conversas que ainda não foram visualizadas.</p>
                        </div>
                      </div>

                      {/* Somente conversas sem resposta */}
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <Switch
                          checked={advancedFilters.onlyNoResponse || false}
                          onCheckedChange={(checked) => updateAdvancedFilter('onlyNoResponse', checked)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Somente conversas sem resposta</p>
                          <p className="text-xs text-muted-foreground">Filtra conversas onde o último contato foi feito pelo cliente.</p>
                        </div>
                      </div>

                      {/* Modo Sombra */}
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <Switch
                          checked={advancedFilters.shadowMode || false}
                          onCheckedChange={(checked) => updateAdvancedFilter('shadowMode', checked)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Modo Sombra</p>
                          <p className="text-xs text-muted-foreground">Permite olhar conversas sem marcar como lidas.</p>
                        </div>
                      </div>

                      {/* Modo Foco */}
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <Switch
                          checked={advancedFilters.focusMode || false}
                          onCheckedChange={(checked) => updateAdvancedFilter('focusMode', checked)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Modo Foco</p>
                          <p className="text-xs text-muted-foreground">Mostra todas conversas pendentes e apenas suas conversas ativas.</p>
                        </div>
                      </div>

                      {/* Mostrar conversas com inatividade */}
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <Switch
                          checked={advancedFilters.showInactive || false}
                          onCheckedChange={(checked) => updateAdvancedFilter('showInactive', checked)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Mostrar conversas com inatividade</p>
                          <p className="text-xs text-muted-foreground">Identifica conversas que não tiveram interação do cliente.</p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="border-t border-border p-6 pt-4 flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={clearAllFilters}
                className="flex-1"
              >
                Limpar todos
              </Button>
              <Button 
                onClick={() => setDialogOpen(false)}
                className="flex-1"
              >
                Mostrar {resultsCount?.toLocaleString('pt-BR') || 0} resultados
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
