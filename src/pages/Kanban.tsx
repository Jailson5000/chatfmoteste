import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FolderPlus, MessageSquare, Plus, UserPlus, LayoutGrid, Phone, Search, X } from "lucide-react";
import { DateRange } from "react-day-picker";
import { parseISO, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useDepartments } from "@/hooks/useDepartments";
import { useConversations } from "@/hooks/useConversations";
import { useTags } from "@/hooks/useTags";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAutomations } from "@/hooks/useAutomations";
import { useClients } from "@/hooks/useClients";
import { FilterBar } from "@/components/filters/FilterBar";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanChatPanel } from "@/components/kanban/KanbanChatPanel";
import { CreateDepartmentDialog } from "@/components/kanban/CreateDepartmentDialog";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { ImportContactsDialog } from "@/components/contacts/ImportContactsDialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [groupBy, setGroupBy] = useState<'department' | 'status' | 'responsible' | 'ticket' | 'origin' | 'connection'>('department');
  const [filterConnection, setFilterConnection] = useState<string>('all');
  
  // Multi-select filters
  const [selectedResponsibles, setSelectedResponsibles] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // New contact dialog state
  const navigate = useNavigate();
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isCreatingContact, setIsCreatingContact] = useState(false);

  // Get available connections with phone numbers from WhatsApp instances
  const availableConnections = useMemo(() => {
    const instancesMap = new Map<string, { id: string; name: string; phone?: string | null }>();
    conversations.forEach(conv => {
      if (conv.whatsapp_instance?.instance_name) {
        const instanceName = conv.whatsapp_instance.instance_name;
        instancesMap.set(instanceName, {
          id: instanceName,
          name: conv.whatsapp_instance.display_name || instanceName,
          phone: conv.whatsapp_instance.phone_number
        });
      }
    });
    return Array.from(instancesMap.values());
  }, [conversations]);

  // Build team members list including AI agents
  const allResponsibles = useMemo(() => {
    const humans = members.map(m => ({
      id: m.id,
      full_name: m.full_name,
      avatar_url: m.avatar_url,
      type: 'human' as const,
    }));
    
    const aiAgents = automations
      .filter(a => a.is_active)
      .map(a => ({
        id: a.id,
        full_name: a.name,
        avatar_url: null,
        type: 'ai' as const,
      }));
    
    return [...humans, ...aiAgents];
  }, [members, automations]);

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
      // Exclude archived conversations (those with archived_at set)
      if ((conv as any).archived_at) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = conv.contact_name?.toLowerCase().includes(query);
        const phoneMatch = conv.contact_phone?.includes(query);
        if (!nameMatch && !phoneMatch) return false;
      }
      
      // Responsible filter (multi-select) - includes both humans and AI agents
      if (selectedResponsibles.length > 0) {
        const matchesHuman = conv.assigned_to && selectedResponsibles.includes(conv.assigned_to);
        const matchesAI = conv.current_automation_id && selectedResponsibles.includes(conv.current_automation_id);
        if (!matchesHuman && !matchesAI) return false;
      }

      // Status filter (multi-select) - filter by client status
      if (selectedStatuses.length > 0) {
        const clientStatusId = conv.client?.custom_status_id;
        if (!clientStatusId || !selectedStatuses.includes(clientStatusId)) return false;
      }

      // Connection dropdown filter (when grouping by status)
      if (filterConnection !== 'all') {
        if (!conv.whatsapp_instance?.instance_name || 
            conv.whatsapp_instance.instance_name !== filterConnection) {
          return false;
        }
      }
      
      // Department filter (multi-select)
      if (selectedDepartments.length > 0) {
        const hasNoneFilter = selectedDepartments.includes("none");
        const otherDeptFilters = selectedDepartments.filter(d => d !== "none");
        
        if (hasNoneFilter && otherDeptFilters.length > 0) {
          if (conv.department_id && !otherDeptFilters.includes(conv.department_id)) return false;
        } else if (hasNoneFilter) {
          if (conv.department_id) return false;
        } else {
          if (!conv.department_id || !otherDeptFilters.includes(conv.department_id)) return false;
        }
      }
      
      // Tags filter (multi-select)
      if (selectedTags.length > 0) {
        if (!conv.tags || !conv.tags.some(t => selectedTags.includes(t))) return false;
      }

      // Connections filter (multi-select from advanced)
      if (selectedConnections.length > 0) {
        if (!conv.whatsapp_instance?.instance_name || 
            !selectedConnections.includes(conv.whatsapp_instance.instance_name)) {
          return false;
        }
      }

      // Date range filter - filter by conversation created_at or last_message_at
      if (dateRange?.from) {
        const convDate = parseISO(conv.last_message_at || conv.created_at);
        const startDate = startOfDay(dateRange.from);
        const afterStart = isAfter(convDate, startDate) || convDate >= startDate;
        
        if (!afterStart) return false;
        
        if (dateRange.to) {
          const endDate = endOfDay(dateRange.to);
          const beforeEnd = isBefore(convDate, endDate) || convDate <= endDate;
          if (!beforeEnd) return false;
        }
      }
      
      return true;
    });
  }, [conversations, searchQuery, selectedResponsibles, selectedStatuses, selectedDepartments, selectedTags, selectedConnections, filterConnection, dateRange]);

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
            {/* Search Input */}
            <div className="relative min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            <Button size="icon" variant="default" className="h-9 w-9 shrink-0" onClick={() => setNewContactDialogOpen(true)}>
              <UserPlus className="h-4 w-4" />
            </Button>

            <FilterBar
              selectedResponsibles={selectedResponsibles}
              onResponsiblesChange={setSelectedResponsibles}
              teamMembers={allResponsibles}
              selectedStatuses={selectedStatuses}
              onStatusesChange={setSelectedStatuses}
              statuses={customStatuses.map(s => ({
                id: s.id,
                name: s.name,
                color: s.color,
              }))}
              selectedDepartments={selectedDepartments}
              onDepartmentsChange={setSelectedDepartments}
              departments={departments.map(d => ({
                id: d.id,
                name: d.name,
                color: d.color,
              }))}
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              tags={tags.map(t => ({
                id: t.id,
                name: t.name,
                color: t.color,
              }))}
              selectedConnections={selectedConnections}
              onConnectionsChange={setSelectedConnections}
              connections={availableConnections}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              resultsCount={filteredConversations.length}
              hideStatus
            />
          </div>

          {/* Right: Group by selector */}
          <div className="flex items-center gap-2">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger className="w-[220px] h-9">
                <LayoutGrid className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-muted-foreground mr-1">Agrupar:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="responsible">Responsável</SelectItem>
                <SelectItem value="ticket">Ticket</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="department">Departamento</SelectItem>
                <SelectItem value="origin">Origem</SelectItem>
                <SelectItem value="connection">Conexão</SelectItem>
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
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col h-full [&>button]:hidden">
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

      {/* New Contact Dialog */}
      <NewContactDialog
        open={newContactDialogOpen}
        onClose={() => setNewContactDialogOpen(false)}
        onCreate={async (phone) => {
          setIsCreatingContact(true);
          try {
            // Navigate to conversations with phone param to create new conversation
            navigate(`/conversations?phone=${encodeURIComponent(phone)}`);
            setNewContactDialogOpen(false);
          } catch (error) {
            console.error("Erro ao criar contato:", error);
            toast({
              title: "Erro ao criar contato",
              description: "Não foi possível criar o contato.",
              variant: "destructive",
            });
          } finally {
            setIsCreatingContact(false);
          }
        }}
        onOpenImport={() => {
          setNewContactDialogOpen(false);
          setImportDialogOpen(true);
        }}
        isCreating={isCreatingContact}
      />

      {/* Import Contacts Dialog */}
      <ImportContactsDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={async () => {
          toast({ title: "Contatos importados com sucesso" });
        }}
      />
    </div>
  );
}
