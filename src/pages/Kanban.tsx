import { useState, useMemo, useEffect } from "react";
import { Plus, GripVertical, Folder, Bot, User, Clock, MessageSquare, Phone, Wifi, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTags } from "@/hooks/useTags";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClientDetailSheet } from "@/components/kanban/ClientDetailSheet";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";

// Mock data for testing - simulating conversation info
const mockConversationData: Record<string, {
  lastMessage: string;
  connection: string;
  handler: 'ai' | 'human';
  handlerName: string;
  arrivedAt: Date;
  tagIds: string[];
}> = {};

// Generate mock data for any client
const getMockData = (clientId: string) => {
  if (!mockConversationData[clientId]) {
    const handlers: Array<{ type: 'ai' | 'human'; name: string }> = [
      { type: 'ai', name: 'Assistente Jurídico' },
      { type: 'ai', name: 'IA Triagem' },
      { type: 'human', name: 'Dr. Carlos Silva' },
      { type: 'human', name: 'Dra. Ana Costa' },
      { type: 'human', name: 'João Atendente' },
    ];
    const connections = ['WhatsApp Principal', 'WhatsApp Comercial', 'WhatsApp Suporte'];
    const messages = [
      'Olá, preciso de ajuda com um processo...',
      'Gostaria de agendar uma consulta sobre...',
      'Tenho dúvidas sobre meus direitos...',
      'Recebi uma notificação judicial e...',
      'Quanto custa uma consulta para...',
    ];
    
    const randomHandler = handlers[Math.floor(Math.random() * handlers.length)];
    const hoursAgo = Math.floor(Math.random() * 72);
    
    mockConversationData[clientId] = {
      lastMessage: messages[Math.floor(Math.random() * messages.length)],
      connection: connections[Math.floor(Math.random() * connections.length)],
      handler: randomHandler.type,
      handlerName: randomHandler.name,
      arrivedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      tagIds: [],
    };
  }
  return mockConversationData[clientId];
};

// Mock clients for testing when database is empty
const mockClients = [
  { id: 'mock-1', name: 'Maria Santos', phone: '11987654321', department_id: null, custom_status_id: null, email: 'maria@email.com', address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-2', name: 'João Oliveira', phone: '11976543210', department_id: null, custom_status_id: null, email: 'joao@email.com', address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-3', name: 'Ana Silva', phone: '21998765432', department_id: null, custom_status_id: null, email: null, address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-4', name: 'Carlos Souza', phone: '11965432109', department_id: null, custom_status_id: null, email: 'carlos@email.com', address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-5', name: 'Fernanda Lima', phone: '31987651234', department_id: null, custom_status_id: null, email: null, address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-6', name: 'Pedro Almeida', phone: '11912345678', department_id: null, custom_status_id: null, email: 'pedro@email.com', address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-7', name: 'Lucia Ferreira', phone: '21987612345', department_id: null, custom_status_id: null, email: null, address: null, notes: null, created_at: new Date().toISOString() },
  { id: 'mock-8', name: 'Roberto Costa', phone: '11998761234', department_id: null, custom_status_id: null, email: 'roberto@email.com', address: null, notes: null, created_at: new Date().toISOString() },
];

interface ClientCardProps {
  client: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    custom_status_id: string | null;
  };
  status: { id: string; name: string; color: string } | undefined;
  clientTags: Array<{ id: string; name: string; color: string }>;
  isDragging: boolean;
  onDragStart: () => void;
  onClick: () => void;
}

function ClientCard({ client, status, clientTags, isDragging, onDragStart, onClick }: ClientCardProps) {
  const mockData = getMockData(client.id);
  const lastFourDigits = client.phone.slice(-4);
  const timeAgo = formatDistanceToNow(mockData.arrivedAt, { addSuffix: false, locale: ptBR });
  
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
          <h4 className="font-semibold text-sm truncate flex-1">{client.name}</h4>
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
            <Clock className="h-3 w-3" />
            <span className="whitespace-nowrap">{timeAgo}</span>
          </div>
        </div>
        
        {/* Status Badge */}
        {status && (
          <Badge 
            className="text-xs h-5 px-1.5"
            style={{ backgroundColor: status.color, color: '#fff' }}
          >
            {status.name}
          </Badge>
        )}
        
        {/* Tags */}
        {clientTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clientTags.slice(0, 2).map(tag => (
              <Badge 
                key={tag.id}
                variant="outline" 
                className="text-xs h-5 px-1.5"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                <Tag className="h-2.5 w-2.5 mr-0.5" />
                {tag.name}
              </Badge>
            ))}
            {clientTags.length > 2 && (
              <Badge variant="outline" className="text-xs h-5 px-1.5">
                +{clientTags.length - 2}
              </Badge>
            )}
          </div>
        )}
        
        {/* Message Preview */}
        <div className="flex items-start gap-2">
          <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground line-clamp-2">{mockData.lastMessage}</p>
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
              <span className="truncate max-w-[60px]">{mockData.connection.replace('WhatsApp ', '')}</span>
            </div>
          </div>
          
          {/* Handler Badge */}
          <Badge 
            variant="secondary"
            className={cn(
              "text-xs px-1.5 py-0 h-5 gap-1",
              mockData.handler === 'ai' 
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" 
                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
            )}
          >
            {mockData.handler === 'ai' ? (
              <Bot className="h-3 w-3" />
            ) : (
              <User className="h-3 w-3" />
            )}
            <span className="truncate max-w-[50px]">{mockData.handlerName.split(' ')[0]}</span>
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Kanban() {
  const { departments, isLoading: deptsLoading, reorderDepartments } = useDepartments();
  const { clients: dbClients, moveClientToDepartment, updateClient } = useClients();
  const { statuses } = useCustomStatuses();
  const { tags } = useTags();
  
  const [draggedClient, setDraggedClient] = useState<string | null>(null);
  const [draggedDept, setDraggedDept] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    created_at: string;
    custom_status_id: string | null;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState<{
    statuses: string[];
    handlers: Array<'ai' | 'human'>;
    connections: string[];
  }>({ statuses: [], handlers: [], connections: [] });

  // Available connections for filter
  const availableConnections = ['WhatsApp Principal', 'WhatsApp Comercial', 'WhatsApp Suporte'];

  // Real-time subscription for clients updates
  useEffect(() => {
    const channel = supabase
      .channel('clients-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients'
        },
        (payload) => {
          console.log('Client realtime update:', payload);
          // React Query will refetch automatically via invalidation
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Use mock clients if database is empty, distribute among departments
  const clients = useMemo(() => {
    if (dbClients.length > 0) return dbClients;
    
    // Distribute mock clients among departments
    return mockClients.map((client, index) => ({
      ...client,
      department_id: departments[index % Math.max(departments.length, 1)]?.id || null,
      custom_status_id: statuses[index % Math.max(statuses.length, 1)]?.id || null,
    }));
  }, [dbClients, departments, statuses]);

  // Apply filters
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const mockData = getMockData(client.id);
      
      // Status filter
      if (filters.statuses.length > 0 && client.custom_status_id) {
        if (!filters.statuses.includes(client.custom_status_id)) return false;
      } else if (filters.statuses.length > 0 && !client.custom_status_id) {
        return false;
      }
      
      // Handler filter
      if (filters.handlers.length > 0) {
        if (!filters.handlers.includes(mockData.handler)) return false;
      }
      
      // Connection filter
      if (filters.connections.length > 0) {
        if (!filters.connections.includes(mockData.connection)) return false;
      }
      
      return true;
    });
  }, [clients, filters]);

  // Mock tags for clients
  const getClientTags = (clientId: string) => {
    // Randomly assign 0-2 tags for demo
    const seed = clientId.charCodeAt(clientId.length - 1);
    const numTags = seed % 3;
    return tags.slice(0, numTags);
  };

  const handleClientDragStart = (clientId: string) => {
    setDraggedClient(clientId);
  };

  const handleClientDrop = (departmentId: string | null) => {
    if (draggedClient && !draggedClient.startsWith('mock-')) {
      moveClientToDepartment.mutate({ clientId: draggedClient, departmentId });
    }
    setDraggedClient(null);
  };

  const handleDeptDragStart = (deptId: string) => {
    setDraggedDept(deptId);
  };

  const handleDeptDrop = (targetId: string) => {
    if (!draggedDept || draggedDept === targetId) return;
    const orderedIds = [...departments].map(d => d.id);
    const draggedIndex = orderedIds.indexOf(draggedDept);
    const targetIndex = orderedIds.indexOf(targetId);
    orderedIds.splice(draggedIndex, 1);
    orderedIds.splice(targetIndex, 0, draggedDept);
    reorderDepartments.mutate(orderedIds);
    setDraggedDept(null);
  };

  const handleClientClick = (client: typeof clients[0]) => {
    setSelectedClient({
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      address: client.address,
      notes: client.notes,
      created_at: client.created_at,
      custom_status_id: client.custom_status_id,
    });
    setSheetOpen(true);
  };

  const handleUpdateClientName = (clientId: string, newName: string) => {
    if (!clientId.startsWith('mock-')) {
      updateClient.mutate({ id: clientId, name: newName });
    }
    // Update local state for mock clients
    if (selectedClient && selectedClient.id === clientId) {
      setSelectedClient({ ...selectedClient, name: newName });
    }
  };

  const handleTransferHandler = (clientId: string, handlerType: 'ai' | 'human', handlerName: string) => {
    // Update mock data for demo purposes
    const mockData = mockConversationData[clientId];
    if (mockData) {
      mockData.handler = handlerType;
      mockData.handlerName = handlerName;
    }
    console.log(`Client ${clientId} transferred to ${handlerType}: ${handlerName}`);
  };

  const getClientsByDepartment = (deptId: string) =>
    filteredClients.filter((c) => c.department_id === deptId);

  const getUnassignedClients = () =>
    filteredClients.filter((c) => !c.department_id);

  const getStatusById = (id: string | null) => statuses.find((s) => s.id === id);

  if (deptsLoading) {
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">Kanban</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Arraste para reordenar departamentos e mover clientes
              </p>
            </div>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </div>
          
          {/* Filters */}
          <KanbanFilters 
            filters={filters}
            onFiltersChange={setFilters}
            availableStatuses={statuses}
            availableConnections={availableConnections}
          />
        </div>
      </div>

      {/* Kanban Board with horizontal scroll */}
      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-4 md:p-6 min-w-max items-start">
          {/* Unassigned column */}
          <div
            className="w-72 md:w-80 flex-shrink-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleClientDrop(null)}
          >
            <div className="rounded-xl bg-muted/40 border border-border/50">
              <div className="flex items-center justify-between p-3 border-b border-border/30 sticky top-0 bg-muted/40 backdrop-blur-sm z-10 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
                  <h3 className="font-semibold text-sm">Sem Departamento</h3>
                  <Badge variant="outline" className="text-xs h-5 px-1.5">
                    {getUnassignedClients().length}
                  </Badge>
                </div>
              </div>
              <div className="p-3 space-y-2">
                {getUnassignedClients().map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    status={getStatusById(client.custom_status_id)}
                    clientTags={getClientTags(client.id)}
                    isDragging={draggedClient === client.id}
                    onDragStart={() => handleClientDragStart(client.id)}
                    onClick={() => handleClientClick(client)}
                  />
                ))}
                {getUnassignedClients().length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum lead sem departamento
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Department columns */}
          {departments.map((dept) => {
            const deptClients = getClientsByDepartment(dept.id);
            return (
              <div
                key={dept.id}
                className={cn("w-72 md:w-80 flex-shrink-0", draggedDept === dept.id && "opacity-50")}
                draggable
                onDragStart={() => handleDeptDragStart(dept.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedDept) handleDeptDrop(dept.id);
                  else if (draggedClient) handleClientDrop(dept.id);
                }}
              >
                <div 
                  className="rounded-xl border"
                  style={{ 
                    backgroundColor: `${dept.color}08`,
                    borderColor: `${dept.color}30`
                  }}
                >
                  <div 
                    className="flex items-center justify-between p-3 border-b sticky top-0 backdrop-blur-sm z-10 rounded-t-xl"
                    style={{ 
                      borderColor: `${dept.color}30`,
                      backgroundColor: `${dept.color}10`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                      <h3 className="font-semibold text-sm">{dept.name}</h3>
                      <Badge 
                        variant="outline" 
                        className="text-xs h-5 px-1.5"
                        style={{ borderColor: dept.color, color: dept.color }}
                      >
                        {deptClients.length}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="p-3 space-y-2">
                    {deptClients.map((client) => (
                      <ClientCard
                        key={client.id}
                        client={client}
                        status={getStatusById(client.custom_status_id)}
                        clientTags={getClientTags(client.id)}
                        isDragging={draggedClient === client.id}
                        onDragStart={() => handleClientDragStart(client.id)}
                        onClick={() => handleClientClick(client)}
                      />
                    ))}
                    {deptClients.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Arraste leads para cá
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {departments.length === 0 && (
            <div className="flex items-center justify-center w-72 md:w-80 h-48 border-2 border-dashed rounded-xl text-muted-foreground">
              <div className="text-center">
                <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Crie departamentos em Configurações</p>
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Client Detail Sheet */}
      <ClientDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        client={selectedClient}
        status={selectedClient ? getStatusById(selectedClient.custom_status_id) : undefined}
        tags={selectedClient ? getClientTags(selectedClient.id) : []}
        mockData={selectedClient ? getMockData(selectedClient.id) : undefined}
        onUpdateName={handleUpdateClientName}
        onTransferHandler={handleTransferHandler}
      />
    </div>
  );
}
