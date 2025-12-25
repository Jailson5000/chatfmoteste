import { useState, useMemo, useEffect } from "react";
import { Plus, GripVertical, Folder, Bot, User, Clock, MessageSquare, Phone, Wifi, Tag, FolderPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import { useConversations } from "@/hooks/useConversations";
import { useTags } from "@/hooks/useTags";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link } from "react-router-dom";

interface ConversationCardProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    status: string;
    current_handler: 'ai' | 'human';
    last_message_at: string | null;
    tags: string[] | null;
    department_id: string | null;
    last_message?: { content: string | null; created_at: string } | null;
    whatsapp_instance?: { instance_name: string } | null;
    assigned_profile?: { full_name: string } | null;
  };
  isDragging: boolean;
  onDragStart: () => void;
  onClick: () => void;
}

function ConversationCard({ conversation, isDragging, onDragStart, onClick }: ConversationCardProps) {
  const lastFourDigits = conversation.contact_phone?.slice(-4) || "----";
  const timeAgo = conversation.last_message_at 
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })
    : "---";
  
  const handlerName = conversation.current_handler === 'ai' 
    ? 'IA' 
    : (conversation.assigned_profile?.full_name?.split(' ')[0] || 'Humano');

  const connectionName = conversation.whatsapp_instance?.instance_name || 'WhatsApp';
  
  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:-translate-y-0.5 bg-card",
        isDragging && "opacity-50 scale-95"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", conversation.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Name and Time */}
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm truncate flex-1">
            {conversation.contact_name || conversation.contact_phone || "Sem nome"}
          </h4>
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
            <Clock className="h-3 w-3" />
            <span className="whitespace-nowrap">{timeAgo}</span>
          </div>
        </div>
        
        {/* Status Badge */}
        <Badge 
          className="text-xs h-5 px-1.5"
          variant="secondary"
        >
          {conversation.status.replace('_', ' ')}
        </Badge>
        
        {/* Tags */}
        {conversation.tags && conversation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {conversation.tags.slice(0, 2).map((tag, idx) => (
              <Badge 
                key={idx}
                variant="outline" 
                className="text-xs h-5 px-1.5"
              >
                <Tag className="h-2.5 w-2.5 mr-0.5" />
                {tag}
              </Badge>
            ))}
            {conversation.tags.length > 2 && (
              <Badge variant="outline" className="text-xs h-5 px-1.5">
                +{conversation.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
        
        {/* Message Preview */}
        <div className="flex items-start gap-2">
          <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground line-clamp-2">
            {conversation.last_message?.content || "Sem mensagens"}
          </p>
        </div>
        
        {/* Footer: Phone, Connection, Handler */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="flex items-center gap-2">
            {/* Phone last 4 digits */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>•••• {lastFourDigits}</span>
            </div>
            
            {/* Connection */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Wifi className="h-3 w-3" />
              <span className="truncate max-w-[60px]">{connectionName.replace('WhatsApp ', '')}</span>
            </div>
          </div>
          
          {/* Handler Badge */}
          <Badge 
            variant="secondary"
            className={cn(
              "text-xs px-1.5 py-0 h-5 gap-1",
              conversation.current_handler === 'ai' 
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" 
                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
            )}
          >
            {conversation.current_handler === 'ai' ? (
              <Bot className="h-3 w-3" />
            ) : (
              <User className="h-3 w-3" />
            )}
            <span className="truncate max-w-[50px]">{handlerName}</span>
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Kanban() {
  const { departments, isLoading: deptsLoading, reorderDepartments } = useDepartments();
  const { conversations, isLoading: convsLoading, updateConversationDepartment, transferHandler } = useConversations();
  const { tags } = useTags();
  
  const [draggedConversation, setDraggedConversation] = useState<string | null>(null);
  const [draggedDepartment, setDraggedDepartment] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<typeof conversations[0] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{
    statuses: string[];
    handlers: Array<'ai' | 'human'>;
    connections: string[];
    departments: string[];
    tags: string[];
  }>({ statuses: [], handlers: [], connections: [], departments: [], tags: [] });

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

  // Real-time subscription for conversations updates
  useEffect(() => {
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          console.log('Conversation realtime update:', payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Apply filters and search
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = conv.contact_name?.toLowerCase().includes(query);
        const phoneMatch = conv.contact_phone?.includes(query);
        if (!nameMatch && !phoneMatch) return false;
      }
      
      // Status filter
      if (filters.statuses.length > 0) {
        if (!filters.statuses.includes(conv.status)) return false;
      }
      
      // Handler filter
      if (filters.handlers.length > 0) {
        if (!filters.handlers.includes(conv.current_handler)) return false;
      }
      
      // Connection filter
      if (filters.connections.length > 0) {
        if (!conv.whatsapp_instance?.instance_name || 
            !filters.connections.includes(conv.whatsapp_instance.instance_name)) {
          return false;
        }
      }
      
      // Department filter
      if (filters.departments.length > 0) {
        // Handle "none" filter for unassigned conversations
        const hasNoneFilter = filters.departments.includes("none");
        const otherDeptFilters = filters.departments.filter(d => d !== "none");
        
        if (hasNoneFilter && otherDeptFilters.length > 0) {
          // Include unassigned OR selected departments
          if (conv.department_id && !otherDeptFilters.includes(conv.department_id)) {
            return false;
          }
        } else if (hasNoneFilter) {
          // Only unassigned
          if (conv.department_id) return false;
        } else {
          // Only selected departments
          if (!conv.department_id || !otherDeptFilters.includes(conv.department_id)) {
            return false;
          }
        }
      }
      
      // Tags filter
      if (filters.tags.length > 0) {
        if (!conv.tags || !conv.tags.some(t => filters.tags.includes(t))) {
          return false;
        }
      }
      
      return true;
    });
  }, [conversations, filters, searchQuery]);

  const handleConversationDragStart = (conversationId: string) => {
    setDraggedConversation(conversationId);
  };

  const handleConversationDrop = (departmentId: string | null) => {
    if (draggedConversation) {
      updateConversationDepartment.mutate({ 
        conversationId: draggedConversation, 
        departmentId 
      });
    }
    setDraggedConversation(null);
  };

  // Department drag handlers
  const handleDepartmentDragStart = (departmentId: string) => {
    setDraggedDepartment(departmentId);
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

    // Create new order
    const newOrder = [...activeDepartments];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Update positions
    reorderDepartments.mutate(newOrder.map(d => d.id));
    setDraggedDepartment(null);
  };

  const handleConversationClick = (conversation: typeof conversations[0]) => {
    setSelectedConversation(conversation);
    setSheetOpen(true);
  };

  // Get conversations by department
  const getConversationsByDepartment = (departmentId: string | null) =>
    filteredConversations.filter((c) => c.department_id === departmentId);

  // Get unassigned conversations (no department)
  const unassignedConversations = filteredConversations.filter(c => !c.department_id);

  // Active departments only
  const activeDepartments = departments.filter(d => d.is_active);

  const isLoading = deptsLoading || convsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Empty state - no departments created
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
              Crie departamentos para organizar suas conversas no Kanban. Os departamentos representam as áreas de atuação do seu escritório.
            </p>
            <Button asChild>
              <Link to="/settings">
                <Plus className="h-4 w-4 mr-2" />
                Criar Departamentos
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border flex-shrink-0">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold">Kanban</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Arraste conversas entre departamentos para organizar
            </p>
          </div>
          
          {/* Filters */}
          <KanbanFilters 
            filters={filters}
            onFiltersChange={setFilters}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            availableConnections={availableConnections}
            availableDepartments={departments}
            availableTags={tags}
          />
        </div>
      </div>

      {/* Kanban Board with horizontal scroll */}
      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-4 md:p-6 min-w-max items-start">
          {/* Unassigned column - conversations without department */}
          {unassignedConversations.length > 0 && (
            <div
              className="w-72 md:w-80 flex-shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("ring-2", "ring-primary/50");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("ring-2", "ring-primary/50");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("ring-2", "ring-primary/50");
                handleConversationDrop(null);
              }}
            >
              <div 
                className="rounded-xl border"
                style={{ 
                  backgroundColor: `#71717a08`,
                  borderColor: `#71717a30`
                }}
              >
                <div 
                  className="flex items-center justify-between p-3 border-b sticky top-0 backdrop-blur-sm z-10 rounded-t-xl"
                  style={{ 
                    borderColor: `#71717a30`,
                    backgroundColor: `#71717a10`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
                    <h3 className="font-semibold text-sm">Sem Departamento</h3>
                    <Badge 
                      variant="outline" 
                      className="text-xs h-5 px-1.5"
                    >
                      {unassignedConversations.length}
                    </Badge>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {unassignedConversations.map((conv) => (
                    <ConversationCard
                      key={conv.id}
                      conversation={conv}
                      isDragging={draggedConversation === conv.id}
                      onDragStart={() => handleConversationDragStart(conv.id)}
                      onClick={() => handleConversationClick(conv)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Department columns */}
          {activeDepartments.map((department) => {
            const departmentConversations = getConversationsByDepartment(department.id);
            const isDraggingThis = draggedDepartment === department.id;
            
            return (
              <div
                key={department.id}
                className={cn(
                  "w-72 md:w-80 flex-shrink-0 transition-all",
                  isDraggingThis && "opacity-50 scale-95"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  // Only show drop effect if dragging a conversation
                  if (draggedConversation) {
                    e.dataTransfer.dropEffect = "move";
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (draggedConversation) {
                    e.currentTarget.classList.add("ring-2", "ring-primary/50");
                  }
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("ring-2", "ring-primary/50");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("ring-2", "ring-primary/50");
                  if (draggedConversation) {
                    handleConversationDrop(department.id);
                  }
                }}
              >
                <div 
                  className={cn(
                    "rounded-xl border transition-shadow",
                    draggedDepartment && !isDraggingThis && "hover:ring-2 hover:ring-primary/30"
                  )}
                  style={{ 
                    backgroundColor: `${department.color}08`,
                    borderColor: `${department.color}30`
                  }}
                >
                  {/* Draggable header */}
                  <div 
                    className="flex items-center justify-between p-3 border-b sticky top-0 backdrop-blur-sm z-10 rounded-t-xl cursor-grab active:cursor-grabbing"
                    style={{ 
                      borderColor: `${department.color}30`,
                      backgroundColor: `${department.color}10`
                    }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("department", department.id);
                      e.dataTransfer.effectAllowed = "move";
                      handleDepartmentDragStart(department.id);
                    }}
                    onDragEnd={() => setDraggedDepartment(null)}
                    onDragOver={(e) => {
                      if (draggedDepartment && draggedDepartment !== department.id) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDrop={(e) => {
                      if (draggedDepartment) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDepartmentDrop(department.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: department.color }} />
                      <h3 className="font-semibold text-sm">{department.name}</h3>
                      <Badge 
                        variant="outline" 
                        className="text-xs h-5 px-1.5"
                        style={{ borderColor: department.color, color: department.color }}
                      >
                        {departmentConversations.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {departmentConversations.map((conv) => (
                      <ConversationCard
                        key={conv.id}
                        conversation={conv}
                        isDragging={draggedConversation === conv.id}
                        onDragStart={() => handleConversationDragStart(conv.id)}
                        onClick={() => handleConversationClick(conv)}
                      />
                    ))}
                    {departmentConversations.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Arraste conversas para cá
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {conversations.length === 0 && (
            <div className="flex items-center justify-center w-full h-48 border-2 border-dashed rounded-xl text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa encontrada</p>
                <p className="text-xs mt-1">As conversas aparecerão aqui quando chegarem</p>
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Conversation Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {selectedConversation?.contact_name || selectedConversation?.contact_phone || "Conversa"}
            </SheetTitle>
          </SheetHeader>
          {selectedConversation && (
            <div className="mt-6 space-y-4">
              <div>
                <span className="text-sm text-muted-foreground">Telefone:</span>
                <p className="font-medium">{selectedConversation.contact_phone || "---"}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Status:</span>
                <p className="font-medium">{selectedConversation.status.replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Departamento:</span>
                <p className="font-medium">
                  {departments.find(d => d.id === selectedConversation.department_id)?.name || "Não atribuído"}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Handler:</span>
                <Badge 
                  variant="secondary"
                  className={cn(
                    "ml-2",
                    selectedConversation.current_handler === 'ai' 
                      ? "bg-purple-100 text-purple-700" 
                      : "bg-green-100 text-green-700"
                  )}
                >
                  {selectedConversation.current_handler === 'ai' ? 'IA' : 'Humano'}
                </Badge>
              </div>
              {selectedConversation.last_message?.content && (
                <div>
                  <span className="text-sm text-muted-foreground">Última mensagem:</span>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-lg">
                    {selectedConversation.last_message.content}
                  </p>
                </div>
              )}
              <div className="pt-4 space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    transferHandler.mutate({
                      conversationId: selectedConversation.id,
                      handlerType: selectedConversation.current_handler === 'ai' ? 'human' : 'ai'
                    });
                    setSheetOpen(false);
                  }}
                >
                  {selectedConversation.current_handler === 'ai' 
                    ? 'Transferir para Humano' 
                    : 'Transferir para IA'}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
