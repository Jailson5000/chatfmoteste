import { useState, useMemo, useEffect } from "react";
import { FolderPlus, MessageSquare, Plus, Users, CircleDot, SlidersHorizontal, LayoutGrid, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useDepartments } from "@/hooks/useDepartments";
import { useConversations } from "@/hooks/useConversations";
import { useTags } from "@/hooks/useTags";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAutomations } from "@/hooks/useAutomations";
import { useClients } from "@/hooks/useClients";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanChatPanel } from "@/components/kanban/KanbanChatPanel";
import { CreateDepartmentDialog } from "@/components/kanban/CreateDepartmentDialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function Kanban() {
  const { departments, isLoading: deptsLoading, reorderDepartments } = useDepartments();
  const { conversations, isLoading: convsLoading, updateConversationDepartment, transferHandler } = useConversations();
  const { tags } = useTags();
  const { statuses: customStatuses } = useCustomStatuses();
  const { members } = useTeamMembers();
  const { automations } = useAutomations();
  const { updateClientStatus } = useClients();
  const { toast } = useToast();
  
  const [draggedConversation, setDraggedConversation] = useState<string | null>(null);
  const [draggedDepartment, setDraggedDepartment] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<'department' | 'status'>('department');
  const [filterHandler, setFilterHandler] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterConnection, setFilterConnection] = useState<string>('all');
  const [filters, setFilters] = useState<{
    statuses: string[];
    handlers: Array<'ai' | 'human'>;
    connections: string[];
    departments: string[];
    tags: string[];
  }>({ statuses: [], handlers: [], connections: [], departments: [], tags: [] });

  // Get available connections with phone numbers from WhatsApp instances
  const availableInstancesWithPhone = useMemo(() => {
    const instancesMap = new Map<string, { name: string; phone?: string | null }>();
    conversations.forEach(conv => {
      if (conv.whatsapp_instance?.instance_name) {
        instancesMap.set(conv.whatsapp_instance.instance_name, {
          name: conv.whatsapp_instance.instance_name,
          phone: conv.whatsapp_instance.phone_number
        });
      }
    });
    return Array.from(instancesMap.values());
  }, [conversations]);

  // Get available connections from conversations
  const availableConnections = useMemo(() => {
    const connections = new Set<string>();
    conversations.forEach(conv => {
      if (conv.whatsapp_instance?.instance_name) {
        connections.add(conv.whatsapp_instance.instance_name);
      }
    });
    return Array.from(connections);
  }, [conversations]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {})
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Apply all filters
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = conv.contact_name?.toLowerCase().includes(query);
        const phoneMatch = conv.contact_phone?.includes(query);
        if (!nameMatch && !phoneMatch) return false;
      }
      
      // Handler dropdown filter
      if (filterHandler !== 'all') {
        if (filterHandler === 'ai' && conv.current_handler !== 'ai') return false;
        if (filterHandler !== 'ai' && filterHandler !== 'all') {
          // Check if assigned to specific member
          if (conv.assigned_to !== filterHandler && conv.current_handler !== 'human') return false;
        }
      }

      // Status dropdown filter
      if (filterStatus !== 'all' && conv.status !== filterStatus) return false;

      // Connection dropdown filter (when grouping by status)
      if (filterConnection !== 'all') {
        if (!conv.whatsapp_instance?.instance_name || 
            conv.whatsapp_instance.instance_name !== filterConnection) {
          return false;
        }
      }
      
      // Advanced filters
      if (filters.handlers.length > 0) {
        if (!filters.handlers.includes(conv.current_handler)) return false;
      }
      
      if (filters.connections.length > 0) {
        if (!conv.whatsapp_instance?.instance_name || 
            !filters.connections.includes(conv.whatsapp_instance.instance_name)) {
          return false;
        }
      }
      
      if (filters.departments.length > 0) {
        const hasNoneFilter = filters.departments.includes("none");
        const otherDeptFilters = filters.departments.filter(d => d !== "none");
        
        if (hasNoneFilter && otherDeptFilters.length > 0) {
          if (conv.department_id && !otherDeptFilters.includes(conv.department_id)) return false;
        } else if (hasNoneFilter) {
          if (conv.department_id) return false;
        } else {
          if (!conv.department_id || !otherDeptFilters.includes(conv.department_id)) return false;
        }
      }
      
      if (filters.tags.length > 0) {
        if (!conv.tags || !conv.tags.some(t => filters.tags.includes(t))) return false;
      }
      
      return true;
    });
  }, [conversations, filters, searchQuery, filterHandler, filterStatus]);

  const handleConversationDrop = (departmentId: string | null) => {
    if (draggedConversation) {
      updateConversationDepartment.mutate({ 
        conversationId: draggedConversation, 
        departmentId 
      });
    }
    setDraggedConversation(null);
  };

  // Handle status change via drag and drop
  const handleStatusDrop = (statusId: string, conversation: typeof conversations[0]) => {
    if (!conversation.client_id) {
      toast({
        title: "Sem cliente vinculado",
        description: "Esta conversa não tem um cliente vinculado para atualizar o status.",
        variant: "destructive",
      });
      return;
    }
    
    updateClientStatus.mutate({ 
      clientId: conversation.client_id, 
      statusId 
    }, {
      onSuccess: () => {
        toast({
          title: "Status atualizado",
          description: `Cliente movido para o novo status.`,
        });
      },
    });
  };

  const handleDepartmentDrop = (targetDepartmentId: string) => {
    if (!draggedDepartment || draggedDepartment === targetDepartmentId) {
      setDraggedDepartment(null);
      return;
    }

    const currentIndex = activeDepartments.findIndex(d => d.id === draggedDepartment);
    const targetIndex = activeDepartments.findIndex(d => d.id === targetDepartmentId);
    
    if (currentIndex === -1 || targetIndex === -1) {
      setDraggedDepartment(null);
      return;
    }

    const newOrder = [...activeDepartments];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    reorderDepartments.mutate(newOrder.map(d => d.id));
    setDraggedDepartment(null);
  };

  const handleConversationClick = (conversation: typeof conversations[0]) => {
    setSelectedConversationId(conversation.id);
    setSheetOpen(true);
  };

  // Group conversations by status when in status mode
  const getConversationsByStatus = (statusId: string | null) =>
    filteredConversations.filter((c) => {
      const clientStatusId = c.client?.custom_status_id || null;
      return clientStatusId === statusId;
    });

  const getConversationsByDepartment = (departmentId: string | null) =>
    filteredConversations.filter((c) => c.department_id === departmentId);

  const unassignedConversations = filteredConversations.filter(c => !c.department_id);
  const activeDepartments = departments.filter(d => d.is_active);
  const isLoading = deptsLoading || convsLoading;

  // Get handlers for dropdown (AI + team members)
  const handlerOptions = useMemo(() => {
    const options = [
      { value: 'all', label: 'Todos' },
      { value: 'ai', label: 'IA' },
    ];
    members.forEach(m => {
      options.push({ value: m.id, label: m.full_name.split(' ')[0] });
    });
    return options;
  }, [members]);

  // Status options for dropdown
  const statusOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'Todos' }];
    customStatuses.forEach(s => {
      options.push({ value: s.name, label: s.name });
    });
    return options;
  }, [customStatuses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (activeDepartments.length === 0) {
    return (
      <div className="h-screen flex flex-col animate-fade-in">
        <div className="p-4 md:p-6 border-b border-border flex-shrink-0">
          <h1 className="font-display text-2xl md:text-3xl font-bold">Kanban</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize conversas por departamentos
          </p>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FolderPlus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Nenhum departamento criado</h2>
            <p className="text-muted-foreground mb-6">
              Crie departamentos para organizar suas conversas no Kanban.
            </p>
            <CreateDepartmentDialog
              trigger={
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Departamento
                </Button>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* Top Filter Bar */}
      <div className="p-3 md:p-4 border-b border-border flex-shrink-0 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Search and main filters */}
          <div className="flex items-center gap-2 flex-1">
            <KanbanFilters 
              filters={filters}
              onFiltersChange={setFilters}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              availableConnections={availableConnections}
              availableDepartments={departments}
              availableTags={tags}
            />
            
            {/* Responsável dropdown */}
            <Select value={filterHandler} onValueChange={setFilterHandler}>
              <SelectTrigger className="w-[140px] h-9">
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                {handlerOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status dropdown */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px] h-9">
                <CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Connection dropdown - visible when grouping by status */}
            {groupBy === 'status' && (
              <Select value={filterConnection} onValueChange={setFilterConnection}>
                <SelectTrigger className="w-[160px] h-9">
                  <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Conexão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas conexões</SelectItem>
                  {availableInstancesWithPhone.map(inst => (
                    <SelectItem key={inst.name} value={inst.name}>
                      {inst.name} {inst.phone ? `(${inst.phone.slice(-4)})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* More filters button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Mais filtros
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="start">
                <p className="text-sm text-muted-foreground">
                  Use o painel de filtros para opções avançadas.
                </p>
              </PopoverContent>
            </Popover>
          </div>

          {/* Right: Group by selector */}
          <div className="flex items-center gap-2">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'department' | 'status')}>
              <SelectTrigger className="w-[180px] h-9">
                <LayoutGrid className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-muted-foreground mr-1">Agrupar:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="department">Departamento</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <ScrollArea className="flex-1">
        <div className="flex gap-3 p-3 md:p-4 min-w-max items-start">
          {groupBy === 'department' ? (
            <>
              {/* Unassigned column */}
              {unassignedConversations.length > 0 && (
                <KanbanColumn
                  id={null}
                  name="Sem Departamento"
                  color="#71717a"
                  conversations={unassignedConversations}
                  customStatuses={customStatuses}
                  tags={tags}
                  automations={automations}
                  isDragging={false}
                  draggedConversation={draggedConversation}
                  onDrop={() => handleConversationDrop(null)}
                  onConversationDragStart={(id) => setDraggedConversation(id)}
                  onConversationClick={handleConversationClick}
                />
              )}

              {/* Department columns */}
              {activeDepartments.map((department) => {
                const departmentConversations = getConversationsByDepartment(department.id);
                const isDraggingThis = draggedDepartment === department.id;
                
                return (
                  <KanbanColumn
                    key={department.id}
                    id={department.id}
                    name={department.name}
                    color={department.color}
                    conversations={departmentConversations}
                    customStatuses={customStatuses}
                    tags={tags}
                    automations={automations}
                    isDragging={isDraggingThis}
                    isDraggable={true}
                    draggedConversation={draggedConversation}
                    onDragStart={() => setDraggedDepartment(department.id)}
                    onDragEnd={() => setDraggedDepartment(null)}
                    onDrop={() => handleConversationDrop(department.id)}
                    onColumnDrop={() => handleDepartmentDrop(department.id)}
                    onConversationDragStart={(id) => setDraggedConversation(id)}
                    onConversationClick={handleConversationClick}
                  />
                );
              })}
            </>
          ) : (
            <>
              {/* Status columns - Sem Status first */}
              <KanbanColumn
                id={null}
                name="Sem Status"
                color="#71717a"
                conversations={getConversationsByStatus(null)}
                customStatuses={customStatuses}
                tags={tags}
                automations={automations}
                isDragging={false}
                draggedConversation={draggedConversation}
                groupByStatus={true}
                onDrop={() => {
                  const conv = conversations.find(c => c.id === draggedConversation);
                  if (conv && conv.client_id) {
                    updateClientStatus.mutate({ clientId: conv.client_id, statusId: null });
                  }
                  setDraggedConversation(null);
                }}
                onConversationDragStart={(id) => setDraggedConversation(id)}
                onConversationClick={handleConversationClick}
              />

              {/* Custom status columns */}
              {customStatuses.filter(s => s.is_active).map((status) => {
                const statusConversations = getConversationsByStatus(status.id);
                
                return (
                  <KanbanColumn
                    key={status.id}
                    id={status.id}
                    name={status.name}
                    color={status.color}
                    conversations={statusConversations}
                    customStatuses={customStatuses}
                    tags={tags}
                    automations={automations}
                    isDragging={false}
                    draggedConversation={draggedConversation}
                    groupByStatus={true}
                    onDrop={() => {
                      const conv = conversations.find(c => c.id === draggedConversation);
                      if (conv) {
                        handleStatusDrop(status.id, conv);
                      }
                      setDraggedConversation(null);
                    }}
                    onConversationDragStart={(id) => setDraggedConversation(id)}
                    onConversationClick={handleConversationClick}
                  />
                );
              })}
            </>
          )}

          {conversations.length === 0 && (
            <div className="flex items-center justify-center w-full h-48 border-2 border-dashed rounded-xl text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa encontrada</p>
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Conversation Chat Panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col [&>button]:hidden">
          {selectedConversation && (
            <KanbanChatPanel
              conversationId={selectedConversation.id}
              contactName={selectedConversation.contact_name}
              contactPhone={selectedConversation.contact_phone}
              currentHandler={selectedConversation.current_handler}
              currentAutomationId={selectedConversation.current_automation_id}
              currentAutomationName={(selectedConversation as any).current_automation?.name || null}
              assignedProfile={selectedConversation.assigned_profile}
              clientId={selectedConversation.client_id}
              clientStatus={selectedConversation.client?.custom_status_id}
              conversationTags={selectedConversation.tags}
              departmentId={selectedConversation.department_id}
              customStatuses={customStatuses}
              tags={tags}
              departments={departments}
              members={members}
              automations={automations}
              onClose={() => {
                setSheetOpen(false);
                setSelectedConversationId(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
