import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Filter,
  ChevronDown,
  ChevronRight,
  Users,
  Building2,
  Wifi,
  X,
  RefreshCw,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface Department {
  id: string;
  name: string;
  color: string;
}

interface Connection {
  id: string;
  name: string;
}

interface DashboardAdvancedFiltersProps {
  teamMembers: TeamMember[];
  departments: Department[];
  connections: Connection[];
  selectedAttendants: string[];
  selectedDepartments: string[];
  selectedConnections: string[];
  onAttendantsChange: (ids: string[]) => void;
  onDepartmentsChange: (ids: string[]) => void;
  onConnectionsChange: (ids: string[]) => void;
  onClearAll: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function DashboardAdvancedFilters({
  teamMembers,
  departments,
  connections,
  selectedAttendants,
  selectedDepartments,
  selectedConnections,
  onAttendantsChange,
  onDepartmentsChange,
  onConnectionsChange,
  onClearAll,
  onRefresh,
  isLoading,
}: DashboardAdvancedFiltersProps) {
  const [open, setOpen] = useState(false);
  const [attendantOpen, setAttendantOpen] = useState(true);
  const [departmentOpen, setDepartmentOpen] = useState(true);
  const [connectionOpen, setConnectionOpen] = useState(true);

  const totalFilters = 
    selectedAttendants.length + 
    selectedDepartments.length + 
    selectedConnections.length;

  const toggleAttendant = (id: string) => {
    if (selectedAttendants.includes(id)) {
      onAttendantsChange(selectedAttendants.filter(a => a !== id));
    } else {
      onAttendantsChange([...selectedAttendants, id]);
    }
  };

  const toggleDepartment = (id: string) => {
    if (selectedDepartments.includes(id)) {
      onDepartmentsChange(selectedDepartments.filter(d => d !== id));
    } else {
      onDepartmentsChange([...selectedDepartments, id]);
    }
  };

  const toggleConnection = (id: string) => {
    if (selectedConnections.includes(id)) {
      onConnectionsChange(selectedConnections.filter(c => c !== id));
    } else {
      onConnectionsChange([...selectedConnections, id]);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {totalFilters > 0 && (
              <Badge 
                variant="secondary" 
                className="ml-1 h-5 min-w-5 flex items-center justify-center rounded-full text-xs"
              >
                {totalFilters}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="font-medium text-sm">Filtros Avançados</span>
            {totalFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onClearAll();
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Limpar tudo
              </Button>
            )}
          </div>

          <ScrollArea className="max-h-[400px]">
            <div className="p-2 space-y-2">
              {/* Attendants Section */}
              <Collapsible open={attendantOpen} onOpenChange={setAttendantOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Atendentes</span>
                    {selectedAttendants.length > 0 && (
                      <Badge variant="secondary" className="h-5 text-xs">
                        {selectedAttendants.length}
                      </Badge>
                    )}
                  </div>
                  {attendantOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 py-1 space-y-1">
                  {teamMembers.map(member => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedAttendants.includes(member.id)}
                        onCheckedChange={() => toggleAttendant(member.id)}
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {member.full_name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{member.full_name}</span>
                    </label>
                  ))}
                  {teamMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      Nenhum atendente encontrado
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Departments Section */}
              <Collapsible open={departmentOpen} onOpenChange={setDepartmentOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Departamentos</span>
                    {selectedDepartments.length > 0 && (
                      <Badge variant="secondary" className="h-5 text-xs">
                        {selectedDepartments.length}
                      </Badge>
                    )}
                  </div>
                  {departmentOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 py-1 space-y-1">
                  {departments.map(dept => (
                    <label
                      key={dept.id}
                      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedDepartments.includes(dept.id)}
                        onCheckedChange={() => toggleDepartment(dept.id)}
                      />
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: dept.color }}
                      />
                      <span className="text-sm truncate">{dept.name}</span>
                    </label>
                  ))}
                  {departments.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      Nenhum departamento encontrado
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Connections Section */}
              <Collapsible open={connectionOpen} onOpenChange={setConnectionOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Conexões</span>
                    {selectedConnections.length > 0 && (
                      <Badge variant="secondary" className="h-5 text-xs">
                        {selectedConnections.length}
                      </Badge>
                    )}
                  </div>
                  {connectionOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pr-2 py-1 space-y-1">
                  {connections.map(conn => (
                    <label
                      key={conn.id}
                      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedConnections.includes(conn.id)}
                        onCheckedChange={() => toggleConnection(conn.id)}
                      />
                      <Wifi className="h-4 w-4 text-green-500" />
                      <span className="text-sm truncate">{conn.name}</span>
                    </label>
                  ))}
                  {connections.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      Nenhuma conexão encontrada
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0"
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
      </Button>

      {/* Active filter badges */}
      {totalFilters > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedAttendants.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Users className="h-3 w-3" />
              {selectedAttendants.length} atendente{selectedAttendants.length > 1 ? "s" : ""}
              <button
                onClick={() => onAttendantsChange([])}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedDepartments.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Building2 className="h-3 w-3" />
              {selectedDepartments.length} dept{selectedDepartments.length > 1 ? "s" : ""}
              <button
                onClick={() => onDepartmentsChange([])}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedConnections.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Wifi className="h-3 w-3" />
              {selectedConnections.length} conexã{selectedConnections.length > 1 ? "es" : "o"}
              <button
                onClick={() => onConnectionsChange([])}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
