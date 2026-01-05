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
  X
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

  // Helper functions to get names
  const getStatusName = (id: string) => statuses.find(s => s.id === id)?.name || id;
  const getStatusColor = (id: string) => statuses.find(s => s.id === id)?.color || '#888';
  const getResponsibleName = (id: string) => teamMembers.find(m => m.id === id)?.full_name || id;
  const getDepartmentName = (id: string) => departments.find(d => d.id === id)?.name || id;
  const getDepartmentColor = (id: string) => departments.find(d => d.id === id)?.color || '#888';
  const getTagName = (id: string) => tags.find(t => t.id === id)?.name || id;
  const getTagColor = (id: string) => tags.find(t => t.id === id)?.color || '#888';
  const getConnectionName = (id: string) => connections.find(c => c.id === id)?.name || id;

  // Check if there are any active filters to show (excluding those with dedicated popovers like Status and Responsible)
  const hasActiveFilters = selectedDepartments.length > 0 || 
    selectedTags.length > 0 || 
    selectedConnections.length > 0 ||
    dateRange?.from ||
    advancedTogglesCount > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
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
          <DialogContent className="max-w-xl w-[min(92vw,36rem)] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden text-[13px]">
            <DialogHeader className="p-5 pb-3">
              <DialogTitle>Filtros</DialogTitle>
              <DialogDescription>
                Configure todos os filtros para refinar sua busca por conversas e veja os resultados em tempo real
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0 px-5">
              <div className="space-y-4 pb-6">
                {/* Classification Section */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">Classificação</h4>
                  
                  {/* Status - Multi-select with inline badges */}
                  <Collapsible open={statusExpanded} onOpenChange={setStatusExpanded}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {selectedStatuses.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {selectedStatuses.map(id => (
                                <Badge 
                                  key={id}
                                  variant="outline" 
                                  className="h-6 gap-1 text-xs px-2 cursor-pointer group"
                                  style={{ 
                                    backgroundColor: `${getStatusColor(id)}20`,
                                    borderColor: getStatusColor(id),
                                    color: getStatusColor(id),
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStatus(id);
                                  }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getStatusColor(id) }} />
                                  {getStatusName(id)}
                                  <X className="h-3 w-3 ml-0.5 opacity-60 group-hover:opacity-100" />
                                </Badge>
                              ))}
                              <span className="text-xs text-muted-foreground">Buscar status...</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Buscar status...</span>
                          )}
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", statusExpanded && "rotate-180")} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <div className="border border-border rounded-lg bg-background/50 max-h-[200px] overflow-auto">
                        {statuses.map(status => {
                          const isSelected = selectedStatuses.includes(status.id);
                          return (
                            <button
                              key={status.id}
                              onClick={() => toggleStatus(status.id)}
                              className={cn(
                                "flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors",
                                isSelected && "bg-primary/10"
                              )}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none" />
                              <Badge
                                variant="outline"
                                className="font-normal"
                                style={{
                                  backgroundColor: `${status.color}20`,
                                  borderColor: status.color,
                                  color: status.color,
                                }}
                              >
                                <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: status.color }} />
                                {status.name}
                              </Badge>
                              {isSelected && <Check className="h-4 w-4 text-primary ml-auto" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 px-1">
                        Use ↑ ↓ para navegar, ↵ para selecionar, Tab para próximo, Esc para fechar
                      </p>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Responsável */}
                  <Collapsible open={responsibleExpanded} onOpenChange={setResponsibleExpanded}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {selectedResponsibles.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {selectedResponsibles.map(id => {
                                const member = teamMembers.find(m => m.id === id);
                                return (
                                  <Badge 
                                    key={id}
                                    variant="outline" 
                                    className={cn(
                                      "h-6 gap-1 text-xs px-2 cursor-pointer group",
                                      member?.type === 'ai' && "bg-violet-500/20 text-violet-400 border-violet-500/30"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleResponsible(id);
                                    }}
                                  >
                                    {member?.type === 'ai' && <Bot className="h-3 w-3" />}
                                    {getResponsibleName(id)}
                                    <X className="h-3 w-3 ml-0.5 opacity-60 group-hover:opacity-100" />
                                  </Badge>
                                );
                              })}
                              <span className="text-xs text-muted-foreground">Buscar...</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Responsável</span>
                          )}
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", responsibleExpanded && "rotate-180")} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <div className="border border-border rounded-lg bg-background/50 max-h-[200px] overflow-auto">
                        {teamMembers.map(member => {
                          const isSelected = selectedResponsibles.includes(member.id);
                          return (
                            <button
                              key={member.id}
                              onClick={() => toggleResponsible(member.id)}
                              className={cn(
                                "flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors",
                                isSelected && "bg-primary/10"
                              )}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none" />
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
                              {isSelected && <Check className="h-4 w-4 text-primary ml-auto" />}
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Departamento */}
                  {departments.length > 0 && (
                    <Collapsible open={deptExpanded} onOpenChange={setDeptExpanded}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            {selectedDepartments.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {selectedDepartments.map(id => (
                                  <Badge 
                                    key={id}
                                    variant="outline" 
                                    className="h-6 gap-1 text-xs px-2 cursor-pointer group"
                                    style={{ 
                                      backgroundColor: `${getDepartmentColor(id)}20`,
                                      borderColor: getDepartmentColor(id),
                                      color: getDepartmentColor(id),
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newSelection = selectedDepartments.filter(d => d !== id);
                                      onDepartmentsChange?.(newSelection);
                                    }}
                                  >
                                    {getDepartmentName(id)}
                                    <X className="h-3 w-3 ml-0.5 opacity-60 group-hover:opacity-100" />
                                  </Badge>
                                ))}
                                <span className="text-xs text-muted-foreground">Buscar...</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Departamento</span>
                            )}
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", deptExpanded && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-1">
                        <div className="border border-border rounded-lg bg-background/50 max-h-[200px] overflow-auto">
                          {departments.map(dept => {
                            const isSelected = selectedDepartments.includes(dept.id);
                            return (
                              <button
                                key={dept.id}
                                onClick={() => {
                                  const newSelection = isSelected 
                                    ? selectedDepartments.filter(d => d !== dept.id)
                                    : [...selectedDepartments, dept.id];
                                  onDepartmentsChange?.(newSelection);
                                }}
                                className={cn(
                                  "flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors",
                                  isSelected && "bg-primary/10"
                                )}
                              >
                                <Checkbox checked={isSelected} className="pointer-events-none" />
                                <Badge
                                  variant="outline"
                                  className="font-normal"
                                  style={{
                                    backgroundColor: `${dept.color}20`,
                                    borderColor: dept.color,
                                    color: dept.color,
                                  }}
                                >
                                  {dept.name}
                                </Badge>
                                {isSelected && <Check className="h-4 w-4 text-primary ml-auto" />}
                              </button>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Conexão */}
                  {connections.length > 0 && (
                    <Collapsible open={connExpanded} onOpenChange={setConnExpanded}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                          <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            {selectedConnections.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {selectedConnections.map(id => (
                                  <Badge 
                                    key={id}
                                    variant="outline" 
                                    className="h-6 gap-1 text-xs px-2 cursor-pointer group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newSelection = selectedConnections.filter(c => c !== id);
                                      onConnectionsChange?.(newSelection);
                                    }}
                                  >
                                    <Smartphone className="h-3 w-3" />
                                    {getConnectionName(id)}
                                    <X className="h-3 w-3 ml-0.5 opacity-60 group-hover:opacity-100" />
                                  </Badge>
                                ))}
                                <span className="text-xs text-muted-foreground">Buscar...</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Conexão</span>
                            )}
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", connExpanded && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-1">
                        <div className="border border-border rounded-lg bg-background/50 max-h-[200px] overflow-auto">
                          {connections.map(conn => {
                            const isSelected = selectedConnections.includes(conn.id);
                            return (
                              <button
                                key={conn.id}
                                onClick={() => {
                                  const newSelection = isSelected 
                                    ? selectedConnections.filter(c => c !== conn.id)
                                    : [...selectedConnections, conn.id];
                                  onConnectionsChange?.(newSelection);
                                }}
                                className={cn(
                                  "flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors",
                                  isSelected && "bg-primary/10"
                                )}
                              >
                                <Checkbox checked={isSelected} className="pointer-events-none" />
                                <Smartphone className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1 text-left">
                                  <span className="text-sm">{conn.name}</span>
                                  {conn.phone && (
                                    <span className="text-xs text-muted-foreground ml-2">{conn.phone}</span>
                                  )}
                                </div>
                                {isSelected && <Check className="h-4 w-4 text-primary ml-auto" />}
                              </button>
                            );
                          })}
                        </div>
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
                        <span className="text-[13px] flex-1">
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
                                  "block w-full text-left text-[13px] px-2 py-1.5 rounded hover:bg-muted/50 transition-colors",
                                  !dateRange?.from && period.label === "Todo o tempo" && "text-primary font-medium"
                                )}
                              >
                                {period.label}
                              </button>
                            ))}
                          </div>
                          
                          {/* Calendar */}
                          <div className="flex-1 min-w-[264px]">
                            <Calendar
                              mode="range"
                              selected={dateRange}
                              onSelect={onDateRangeChange}
                              locale={ptBR}
                              className={cn("rounded-md pointer-events-auto p-2")}
                              classNames={{
                                month: "space-y-3",
                                caption_label: "text-xs font-medium",
                                head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.72rem]",
                                cell: "h-8 w-8 text-center text-[13px] p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                                day: "h-8 w-8 p-0 font-normal text-[13px] aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md",
                                nav_button: "h-6 w-6 bg-transparent p-0 opacity-60 hover:opacity-100",
                              }}
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

              </div>
            </ScrollArea>

            <DialogFooter className="border-t border-border p-5 pt-3 flex-row gap-2">
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

      {/* Active Filters Tags - Show when dialog is closed and filters are active */}
      {!dialogOpen && hasActiveFilters && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Department tags */}
          {selectedDepartments.map(id => (
            <Badge 
              key={`dept-${id}`}
              variant="secondary" 
              className="h-6 gap-1 text-xs px-2 cursor-pointer hover:bg-destructive/20"
              style={{ 
                backgroundColor: `${getDepartmentColor(id)}20`,
                color: getDepartmentColor(id),
              }}
              onClick={() => {
                const newSelection = selectedDepartments.filter(d => d !== id);
                onDepartmentsChange?.(newSelection);
              }}
            >
              <Building2 className="h-3 w-3" />
              {getDepartmentName(id)}
              <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
            </Badge>
          ))}

          {/* Tag tags */}
          {selectedTags.map(id => (
            <Badge 
              key={`tag-${id}`}
              variant="secondary" 
              className="h-6 gap-1 text-xs px-2 cursor-pointer hover:bg-destructive/20"
              style={{ 
                backgroundColor: `${getTagColor(id)}20`,
                color: getTagColor(id),
              }}
              onClick={() => {
                const newSelection = selectedTags.filter(t => t !== id);
                onTagsChange?.(newSelection);
              }}
            >
              <Tag className="h-3 w-3" />
              {getTagName(id)}
              <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
            </Badge>
          ))}

          {/* Connection tags */}
          {selectedConnections.map(id => (
            <Badge 
              key={`conn-${id}`}
              variant="secondary" 
              className="h-6 gap-1 text-xs px-2 cursor-pointer hover:bg-destructive/20"
              onClick={() => {
                const newSelection = selectedConnections.filter(c => c !== id);
                onConnectionsChange?.(newSelection);
              }}
            >
              <Smartphone className="h-3 w-3" />
              {getConnectionName(id)}
              <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
            </Badge>
          ))}

          {/* Date range tag */}
          {dateRange?.from && (
            <Badge 
              variant="secondary" 
              className="h-6 gap-1 text-xs px-2 cursor-pointer hover:bg-destructive/20"
              onClick={() => onDateRangeChange?.(undefined)}
            >
              <CalendarIcon className="h-3 w-3" />
              {dateRange.to 
                ? `${format(dateRange.from, "dd/MM")} - ${format(dateRange.to, "dd/MM")}`
                : format(dateRange.from, "dd/MM/yy")
              }
              <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
            </Badge>
          )}

          {/* Clear all button */}
          {advancedFiltersCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-muted-foreground hover:text-destructive"
              onClick={clearAllFilters}
            >
              Limpar tudo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
