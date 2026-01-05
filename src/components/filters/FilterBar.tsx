import { useState } from "react";
import { Users, Circle, SlidersHorizontal, Check, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url?: string | null;
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

export interface FilterBarProps {
  // Responsible filter
  selectedResponsibles: string[];
  onResponsiblesChange: (ids: string[]) => void;
  teamMembers: TeamMember[];
  
  // Status filter
  selectedStatuses: string[];
  onStatusesChange: (ids: string[]) => void;
  statuses: Status[];
  
  // Advanced filters (shown in sheet)
  selectedDepartments?: string[];
  onDepartmentsChange?: (ids: string[]) => void;
  departments?: Department[];
  
  selectedTags?: string[];
  onTagsChange?: (ids: string[]) => void;
  tags?: Tag[];
  
  selectedConnections?: string[];
  onConnectionsChange?: (ids: string[]) => void;
  connections?: string[];
  
  // Results count for the sheet
  resultsCount?: number;
  
  // Optional: hide certain filters
  hideResponsible?: boolean;
  hideStatus?: boolean;
  hideAdvanced?: boolean;
}

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
  resultsCount,
  hideResponsible,
  hideStatus,
  hideAdvanced,
}: FilterBarProps) {
  const [responsibleOpen, setResponsibleOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [responsibleSearch, setResponsibleSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");

  const advancedFiltersCount = 
    selectedDepartments.length + 
    selectedTags.length + 
    selectedConnections.length;

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
          <PopoverContent className="w-72 p-0" align="start">
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
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {member.full_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 text-left truncate">{member.full_name}</span>
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
            <div className="p-2 border-t border-border text-xs text-muted-foreground">
              Use ↑↓ para navegar, ↵ para selecionar, Tab para próximo, Esc para fechar
            </div>
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
          <PopoverContent className="w-72 p-0" align="start">
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
            <div className="p-2 border-t border-border text-xs text-muted-foreground">
              Use ↑↓ para navegar, ↵ para selecionar, Tab para próximo, Esc para fechar
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Advanced Filters Button */}
      {!hideAdvanced && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
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
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>
                Configure todos os filtros para refinar sua busca por conversas e veja os resultados em tempo real
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 py-4">
                {/* Classification Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Classificação</h4>
                  <div className="space-y-1">
                    <FilterSheetItem 
                      icon={<Circle className="h-4 w-4" />}
                      label="Status"
                      count={selectedStatuses.length}
                    />
                    <FilterSheetItem 
                      icon={<Users className="h-4 w-4" />}
                      label="Responsável"
                      count={selectedResponsibles.length}
                    />
                    {departments.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <FilterSheetItem 
                            icon={<div className="h-4 w-4 flex items-center justify-center"><span className="text-xs">🏢</span></div>}
                            label="Departamento"
                            count={selectedDepartments.length}
                            expandable
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-8 space-y-1 mt-1">
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
                    {tags.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <FilterSheetItem 
                            icon={<div className="h-4 w-4 flex items-center justify-center"><span className="text-xs">🏷️</span></div>}
                            label="Tags"
                            count={selectedTags.length}
                            expandable
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-8 space-y-1 mt-1">
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
                    {connections.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <FilterSheetItem 
                            icon={<div className="h-4 w-4 flex items-center justify-center"><span className="text-xs">📱</span></div>}
                            label="Conexão"
                            count={selectedConnections.length}
                            expandable
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-8 space-y-1 mt-1">
                          {connections.map(conn => (
                            <button
                              key={conn}
                              onClick={() => {
                                const newSelection = selectedConnections.includes(conn)
                                  ? selectedConnections.filter(c => c !== conn)
                                  : [...selectedConnections, conn];
                                onConnectionsChange?.(newSelection);
                              }}
                              className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                            >
                              <Checkbox checked={selectedConnections.includes(conn)} className="pointer-events-none" />
                              <span className="text-sm">{conn}</span>
                            </button>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>

                {/* Origin Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Origem</h4>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-4 w-4 flex items-center justify-center"><span className="text-xs">🌐</span></div>
                      <span className="text-sm">Origem</span>
                    </div>
                  </div>
                </div>

                {/* Period Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Período</h4>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-4 w-4 flex items-center justify-center"><span className="text-xs">📅</span></div>
                      <span className="text-sm">Período</span>
                    </div>
                  </div>
                </div>

                {/* Advanced Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Avançado</h4>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-4 w-4" />
                      Ver mais
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <p className="text-sm text-muted-foreground">
                        Filtros avançados disponíveis em breve.
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </ScrollArea>

            <SheetFooter className="border-t border-border pt-4 mt-auto flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={clearAllFilters}
                className="flex-1"
              >
                Limpar todos
              </Button>
              <Button 
                onClick={() => setSheetOpen(false)}
                className="flex-1"
              >
                Mostrar {resultsCount?.toLocaleString('pt-BR') || 0} resultados
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

interface FilterSheetItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  expandable?: boolean;
}

function FilterSheetItem({ icon, label, count, expandable }: FilterSheetItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
          {count}
        </Badge>
      )}
      {expandable && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}
