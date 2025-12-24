import { useState, useMemo, useEffect } from "react";
import { Plus, GripVertical, Folder, Bot, User, Clock, MessageSquare, Phone, Wifi, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import { useConversations } from "@/hooks/useConversations";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTags } from "@/hooks/useTags";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface ConversationCardProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    status: string;
    current_handler: 'ai' | 'human';
    last_message_at: string | null;
    tags: string[] | null;
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
        "cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 bg-card",
        isDragging && "opacity-50"
      )}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
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

// Status columns configuration based on case_status enum
const statusColumns = [
  { id: 'novo_contato', name: 'Novo Contato', color: '#6366f1' },
  { id: 'triagem_ia', name: 'Triagem IA', color: '#8b5cf6' },
  { id: 'aguardando_documentos', name: 'Aguardando Docs', color: '#f59e0b' },
  { id: 'em_analise', name: 'Em Análise', color: '#3b82f6' },
  { id: 'em_andamento', name: 'Em Andamento', color: '#22c55e' },
  { id: 'encerrado', name: 'Encerrado', color: '#6b7280' },
];

export default function Kanban() {
  const { departments, isLoading: deptsLoading, reorderDepartments } = useDepartments();
  const { conversations, isLoading: convsLoading, updateConversationStatus, transferHandler } = useConversations();
  const { statuses } = useCustomStatuses();
  const { tags } = useTags();
  
  const [draggedConversation, setDraggedConversation] = useState<string | null>(null);
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

  const handleConversationDrop = (status: string) => {
    if (draggedConversation) {
      updateConversationStatus.mutate({ 
        conversationId: draggedConversation, 
        status 
      });
    }
    setDraggedConversation(null);
  };

  const handleConversationClick = (conversation: typeof conversations[0]) => {
    setSelectedConversation(conversation);
    setSheetOpen(true);
  };

  const getConversationsByStatus = (status: string) =>
    filteredConversations.filter((c) => c.status === status);

  // Check if any filters are active
  const hasActiveFilters = 
    filters.statuses.length > 0 || 
    filters.handlers.length > 0 || 
    filters.connections.length > 0 || 
    filters.tags.length > 0 ||
    searchQuery.length > 0;

  // Determine which columns to show based on filters
  const visibleColumns = statusColumns.filter(col => {
    if (filters.statuses.length > 0) {
      return filters.statuses.includes(col.id);
    }
    if (hasActiveFilters) {
      return getConversationsByStatus(col.id).length > 0;
    }
    return true;
  });

  const isLoading = deptsLoading || convsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
              Arraste para mover conversas entre status
            </p>
          </div>
          
          {/* Filters */}
          <KanbanFilters 
            filters={filters}
            onFiltersChange={setFilters}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            availableStatuses={statusColumns.map(s => ({ id: s.id, name: s.name, color: s.color }))}
            availableConnections={availableConnections}
            availableDepartments={departments}
            availableTags={tags}
          />
        </div>
      </div>

      {/* Kanban Board with horizontal scroll */}
      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-4 md:p-6 min-w-max items-start">
          {/* Status columns */}
          {visibleColumns.map((column) => {
            const columnConversations = getConversationsByStatus(column.id);
            return (
              <div
                key={column.id}
                className="w-72 md:w-80 flex-shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleConversationDrop(column.id)}
              >
                <div 
                  className="rounded-xl border"
                  style={{ 
                    backgroundColor: `${column.color}08`,
                    borderColor: `${column.color}30`
                  }}
                >
                  <div 
                    className="flex items-center justify-between p-3 border-b sticky top-0 backdrop-blur-sm z-10 rounded-t-xl"
                    style={{ 
                      borderColor: `${column.color}30`,
                      backgroundColor: `${column.color}10`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
                      <h3 className="font-semibold text-sm">{column.name}</h3>
                      <Badge 
                        variant="outline" 
                        className="text-xs h-5 px-1.5"
                        style={{ borderColor: column.color, color: column.color }}
                      >
                        {columnConversations.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {columnConversations.map((conv) => (
                      <ConversationCard
                        key={conv.id}
                        conversation={conv}
                        isDragging={draggedConversation === conv.id}
                        onDragStart={() => handleConversationDragStart(conv.id)}
                        onClick={() => handleConversationClick(conv)}
                      />
                    ))}
                    {columnConversations.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        {conversations.length === 0 
                          ? "Nenhuma conversa ainda"
                          : "Arraste conversas para cá"
                        }
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
                    : 'Transferir para IA'
                  }
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
