import { useState } from "react";
import { Plus, MoreHorizontal, User, Clock, Tag, GripVertical, Folder } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDepartments } from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";

export default function Kanban() {
  const { departments, isLoading: deptsLoading, reorderDepartments } = useDepartments();
  const { clients, moveClientToDepartment } = useClients();
  const { statuses } = useCustomStatuses();
  
  const [draggedClient, setDraggedClient] = useState<string | null>(null);
  const [draggedDept, setDraggedDept] = useState<string | null>(null);

  const handleClientDragStart = (clientId: string) => {
    setDraggedClient(clientId);
  };

  const handleClientDrop = (departmentId: string) => {
    if (draggedClient) {
      moveClientToDepartment.mutate({ clientId: draggedClient, departmentId });
      setDraggedClient(null);
    }
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
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Kanban</h1>
            <p className="text-muted-foreground mt-1">
              Arraste departamentos para reordenar e clientes entre colunas
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="flex gap-4 min-w-max pb-4">
          {/* Unassigned column */}
          <div
            className="w-80 flex-shrink-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => draggedClient && moveClientToDepartment.mutate({ clientId: draggedClient, departmentId: null })}
          >
            <div className="rounded-xl p-4 bg-muted/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-foreground/70" />
                  <h3 className="font-semibold">Sem Departamento</h3>
                  <Badge variant="secondary">{getUnassignedClients().length}</Badge>
                </div>
              </div>
              <div className="space-y-3">
                {getUnassignedClients().map((client) => {
                  const status = getStatusById(client.custom_status_id);
                  return (
                    <Card
                      key={client.id}
                      className={cn(
                        "cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:-translate-y-0.5",
                        draggedClient === client.id && "opacity-50"
                      )}
                      draggable
                      onDragStart={() => handleClientDragStart(client.id)}
                    >
                      <CardContent className="p-4">
                        <h4 className="font-medium">{client.name}</h4>
                        <p className="text-sm text-muted-foreground">{client.phone}</p>
                        {status && (
                          <Badge className="mt-2" style={{ backgroundColor: status.color, color: "#fff" }}>
                            {status.name}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Department columns */}
          {departments.map((dept) => {
            const deptClients = getClientsByDepartment(dept.id);
            return (
              <div
                key={dept.id}
                className={cn("w-80 flex-shrink-0", draggedDept === dept.id && "opacity-50")}
                draggable
                onDragStart={() => handleDeptDragStart(dept.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedDept) handleDeptDrop(dept.id);
                  else if (draggedClient) handleClientDrop(dept.id);
                }}
              >
                <div className="rounded-xl p-4" style={{ backgroundColor: `${dept.color}15` }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: dept.color }} />
                      <h3 className="font-semibold">{dept.name}</h3>
                      <Badge variant="secondary">{deptClients.length}</Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {deptClients.map((client) => {
                      const status = getStatusById(client.custom_status_id);
                      return (
                        <Card
                          key={client.id}
                          className={cn(
                            "cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:-translate-y-0.5",
                            draggedClient === client.id && "opacity-50"
                          )}
                          draggable
                          onDragStart={() => handleClientDragStart(client.id)}
                        >
                          <CardContent className="p-4">
                            <h4 className="font-medium">{client.name}</h4>
                            <p className="text-sm text-muted-foreground">{client.phone}</p>
                            {status && (
                              <Badge className="mt-2" style={{ backgroundColor: status.color, color: "#fff" }}>
                                {status.name}
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {departments.length === 0 && (
            <div className="flex items-center justify-center w-80 h-48 border-2 border-dashed rounded-xl text-muted-foreground">
              <div className="text-center">
                <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Crie departamentos em Configurações</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
