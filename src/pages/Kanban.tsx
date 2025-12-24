import { useState, useMemo } from "react";
import { Plus, GripVertical, Folder, Bot, User, Clock, MessageSquare, Phone, Wifi } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// Mock data for testing - simulating conversation info
const mockConversationData: Record<string, {
  lastMessage: string;
  connection: string;
  handler: 'ai' | 'human';
  handlerName: string;
  arrivedAt: Date;
}> = {};

// Generate mock data for any client
const getMockData = (clientId: string, clientName: string) => {
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
    };
  }
  return mockConversationData[clientId];
};

// Mock clients for testing when database is empty
const mockClients = [
  { id: 'mock-1', name: 'Maria Santos', phone: '11987654321', department_id: null, custom_status_id: null },
  { id: 'mock-2', name: 'João Oliveira', phone: '11976543210', department_id: null, custom_status_id: null },
  { id: 'mock-3', name: 'Ana Silva', phone: '21998765432', department_id: null, custom_status_id: null },
  { id: 'mock-4', name: 'Carlos Souza', phone: '11965432109', department_id: null, custom_status_id: null },
  { id: 'mock-5', name: 'Fernanda Lima', phone: '31987651234', department_id: null, custom_status_id: null },
];

interface ClientCardProps {
  client: {
    id: string;
    name: string;
    phone: string;
    custom_status_id: string | null;
  };
  status: { name: string; color: string } | undefined;
  isDragging: boolean;
  onDragStart: () => void;
}

function ClientCard({ client, status, isDragging, onDragStart }: ClientCardProps) {
  const mockData = getMockData(client.id, client.name);
  const lastFourDigits = client.phone.slice(-4);
  const timeAgo = formatDistanceToNow(mockData.arrivedAt, { addSuffix: true, locale: ptBR });
  
  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:-translate-y-0.5 border-l-4",
        isDragging && "opacity-50"
      )}
      style={{ borderLeftColor: status?.color || 'hsl(var(--border))' }}
      draggable
      onDragStart={onDragStart}
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
        
        {/* Message Preview */}
        <div className="flex items-start gap-2">
          <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground line-clamp-2">{mockData.lastMessage}</p>
        </div>
        
        {/* Footer: Phone, Connection, Handler */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="flex items-center gap-3">
            {/* Phone last 4 digits */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>•••• {lastFourDigits}</span>
            </div>
            
            {/* Connection */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Wifi className="h-3 w-3" />
              <span className="truncate max-w-[80px]">{mockData.connection.replace('WhatsApp ', '')}</span>
            </div>
          </div>
          
          {/* Handler Badge */}
          <Badge 
            variant={mockData.handler === 'ai' ? 'secondary' : 'default'}
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
            <span className="truncate max-w-[60px]">{mockData.handlerName.split(' ')[0]}</span>
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Kanban() {
  const { departments, isLoading: deptsLoading, reorderDepartments } = useDepartments();
  const { clients: dbClients, moveClientToDepartment } = useClients();
  const { statuses } = useCustomStatuses();
  
  const [draggedClient, setDraggedClient] = useState<string | null>(null);
  const [draggedDept, setDraggedDept] = useState<string | null>(null);

  // Use mock clients if database is empty, distribute among departments
  const clients = useMemo(() => {
    if (dbClients.length > 0) return dbClients;
    
    // Distribute mock clients among departments
    return mockClients.map((client, index) => ({
      ...client,
      department_id: departments[index % Math.max(departments.length, 1)]?.id || null,
    }));
  }, [dbClients, departments]);

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

  const getClientsByDepartment = (deptId: string) =>
    clients.filter((c) => c.department_id === deptId);

  const getUnassignedClients = () =>
    clients.filter((c) => !c.department_id);

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
      </div>

      {/* Kanban Board with horizontal scroll */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="flex gap-4 p-4 md:p-6 min-w-max">
            {/* Unassigned column */}
            <div
              className="w-72 md:w-80 flex-shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleClientDrop(null)}
            >
              <div className="rounded-xl bg-muted/40 border border-border/50 h-full">
                <div className="flex items-center justify-between p-3 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
                    <h3 className="font-semibold text-sm">Sem Departamento</h3>
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      {getUnassignedClients().length}
                    </Badge>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-220px)]">
                  <div className="p-3 space-y-2">
                    {getUnassignedClients().map((client) => (
                      <ClientCard
                        key={client.id}
                        client={client}
                        status={getStatusById(client.custom_status_id)}
                        isDragging={draggedClient === client.id}
                        onDragStart={() => handleClientDragStart(client.id)}
                      />
                    ))}
                    {getUnassignedClients().length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum lead sem departamento
                      </div>
                    )}
                  </div>
                </ScrollArea>
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
                    className="rounded-xl border h-full"
                    style={{ 
                      backgroundColor: `${dept.color}08`,
                      borderColor: `${dept.color}30`
                    }}
                  >
                    <div 
                      className="flex items-center justify-between p-3 border-b"
                      style={{ borderColor: `${dept.color}30` }}
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
                    <ScrollArea className="h-[calc(100vh-220px)]">
                      <div className="p-3 space-y-2">
                        {deptClients.map((client) => (
                          <ClientCard
                            key={client.id}
                            client={client}
                            status={getStatusById(client.custom_status_id)}
                            isDragging={draggedClient === client.id}
                            onDragStart={() => handleClientDragStart(client.id)}
                          />
                        ))}
                        {deptClients.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            Arraste leads para cá
                          </div>
                        )}
                      </div>
                    </ScrollArea>
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
      </div>
    </div>
  );
}
