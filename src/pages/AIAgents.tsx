import { useState, useEffect } from "react";
import { 
  Save, 
  Clock, 
  Database, 
  Key, 
  MessageSquare, 
  Settings2, 
  Power,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  Loader2,
  Plus,
  ArrowLeft,
  Search,
  MoreHorizontal,
  GripVertical,
  Trash2,
  Bot,
  Copy,
  FolderPlus,
  Folder,
  FolderOpen,
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAutomations, Automation } from "@/hooks/useAutomations";
import { useAgentFolders, AgentFolder } from "@/hooks/useAgentFolders";
import { useKnowledgeItems } from "@/hooks/useKnowledgeItems";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { useDepartments } from "@/hooks/useDepartments";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const MAX_PROMPT_LENGTH = 5000;

type ChannelType = "all" | "instance" | "department";
type ViewMode = "list" | "editor";

// Color picker options
const FOLDER_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
];

// Draggable Agent Component
function DraggableAgent({ 
  agent, 
  children 
}: { 
  agent: Automation; 
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: agent.id,
    data: { type: 'agent', agent },
  });

  return (
    <div 
      ref={setNodeRef} 
      className={cn(isDragging && "opacity-50")}
    >
      <div className="flex items-center">
        <div 
          {...listeners} 
          {...attributes}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted/50 rounded"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        {children}
      </div>
    </div>
  );
}

// Droppable Folder Component
function DroppableFolder({ 
  folder, 
  children,
  isOver 
}: { 
  folder: AgentFolder | null;
  children: React.ReactNode;
  isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: folder ? folder.id : 'no-folder',
    data: { type: 'folder', folder },
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary/30 rounded-lg"
      )}
    >
      {children}
    </div>
  );
}

export default function AIAgents() {
  const { toast } = useToast();
  const { automations, isLoading: automationsLoading, updateAutomation, createAutomation, deleteAutomation } = useAutomations();
  const { folders, isLoading: foldersLoading, createFolder, updateFolder, deleteFolder, moveAgentToFolder } = useAgentFolders();
  const { knowledgeItems, isLoading: knowledgeLoading } = useKnowledgeItems();
  const { instances, isLoading: instancesLoading } = useWhatsAppInstances();
  const { departments, isLoading: departmentsLoading } = useDepartments();

  // DnD state
  const [activeAgent, setActiveAgent] = useState<Automation | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedAgent, setSelectedAgent] = useState<Automation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Automation | null>(null);
  
  // Folder state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#6366f1");
  const [folderToEdit, setFolderToEdit] = useState<AgentFolder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<AgentFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderColor, setEditFolderColor] = useState("#6366f1");

  // New agent form
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [newAgentFolderId, setNewAgentFolderId] = useState<string | null>(null);

  // Edit agent state
  const [agentToEditInfo, setAgentToEditInfo] = useState<Automation | null>(null);
  const [editAgentName, setEditAgentName] = useState("");
  const [editAgentDescription, setEditAgentDescription] = useState("");

  // Editor state
  const [prompt, setPrompt] = useState("");
  const [responseDelay, setResponseDelay] = useState(10);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("all");
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [promptVersion, setPromptVersion] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load agent data when selected
  useEffect(() => {
    if (selectedAgent) {
      setPrompt(selectedAgent.ai_prompt || "");
      setIsActive(selectedAgent.is_active);
      setLastUpdated(new Date(selectedAgent.updated_at));
      
      const config = selectedAgent.trigger_config;
      if (config?.keywords && config.keywords.length > 0) {
        setKeywords(config.keywords.join(", "));
      } else {
        setKeywords("");
      }
      
      setPromptVersion(1);
      setHasChanges(false);
    }
  }, [selectedAgent]);

  // Track changes
  useEffect(() => {
    if (selectedAgent) {
      const currentPrompt = selectedAgent.ai_prompt || "";
      setHasChanges(prompt !== currentPrompt || isActive !== selectedAgent.is_active);
    }
  }, [prompt, isActive, selectedAgent]);

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const agent = automations.find(a => a.id === active.id);
    if (agent) {
      setActiveAgent(agent);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveAgent(null);

    if (!over) return;

    const agentId = active.id as string;
    const targetId = over.id as string;

    // Determine target folder
    let targetFolderId: string | null = null;
    if (targetId === 'no-folder') {
      targetFolderId = null;
    } else {
      targetFolderId = targetId;
    }

    // Get current folder of agent
    const agent = automations.find(a => a.id === agentId) as any;
    const currentFolderId = agent?.folder_id || null;

    // Only move if target is different
    if (currentFolderId !== targetFolderId) {
      try {
        await moveAgentToFolder.mutateAsync({ agentId, folderId: targetFolderId });
        toast({
          title: targetFolderId ? "Agente movido" : "Agente removido da pasta",
          description: targetFolderId 
            ? "O agente foi movido para a pasta." 
            : "O agente foi removido da pasta.",
        });
        
        // Expand target folder if moving into one
        if (targetFolderId) {
          setExpandedFolders(prev => new Set([...prev, targetFolderId]));
        }
      } catch (error) {
        // Error handled in hook
      }
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSelectAgent = (agent: Automation) => {
    setSelectedAgent(agent);
    setViewMode("editor");
  };

  const handleBackToList = () => {
    if (hasChanges) {
      // Could add confirmation dialog here
    }
    setViewMode("list");
    setSelectedAgent(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createFolder.mutateAsync({
        name: newFolderName,
        color: newFolderColor,
      });
      
      setIsCreateFolderDialogOpen(false);
      setNewFolderName("");
      setNewFolderColor("#6366f1");
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleEditFolder = async () => {
    if (!folderToEdit || !editFolderName.trim()) return;
    
    try {
      await updateFolder.mutateAsync({
        id: folderToEdit.id,
        name: editFolderName,
        color: editFolderColor,
      });
      
      setFolderToEdit(null);
      toast({
        title: "Pasta atualizada",
        description: "A pasta foi atualizada com sucesso.",
      });
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    
    try {
      await deleteFolder.mutateAsync(folderToDelete.id);
      setFolderToDelete(null);
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleMoveToFolder = async (agentId: string, folderId: string | null) => {
    try {
      await moveAgentToFolder.mutateAsync({ agentId, folderId });
      toast({
        title: folderId ? "Agente movido" : "Agente removido da pasta",
        description: folderId 
          ? "O agente foi movido para a pasta." 
          : "O agente foi removido da pasta.",
      });
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) return;
    
    try {
      const result = await createAutomation.mutateAsync({
        name: newAgentName,
        description: newAgentDescription,
        webhook_url: "",
        trigger_type: "ai_agent",
        ai_prompt: "",
        is_active: true,
      });
      
      // Move to folder if selected
      if (newAgentFolderId && result) {
        await moveAgentToFolder.mutateAsync({ agentId: result.id, folderId: newAgentFolderId });
      }
      
      setIsCreateDialogOpen(false);
      setNewAgentName("");
      setNewAgentDescription("");
      setNewAgentFolderId(null);
      
      toast({
        title: "Agente criado",
        description: "O novo agente foi criado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao criar agente",
        description: "Não foi possível criar o agente.",
        variant: "destructive",
      });
    }
  };

  const handleEditAgentInfo = async () => {
    if (!agentToEditInfo || !editAgentName.trim()) return;
    
    try {
      await updateAutomation.mutateAsync({
        id: agentToEditInfo.id,
        name: editAgentName,
        description: editAgentDescription,
      });
      
      setAgentToEditInfo(null);
      toast({
        title: "Agente atualizado",
        description: "O nome e descrição foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o agente.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateAgent = async (agent: Automation) => {
    try {
      await createAutomation.mutateAsync({
        name: `${agent.name} (cópia)`,
        description: agent.description || "",
        webhook_url: agent.webhook_url || "",
        trigger_type: agent.trigger_type,
        trigger_config: agent.trigger_config || undefined,
        ai_prompt: agent.ai_prompt || "",
        ai_temperature: agent.ai_temperature || 0.7,
        is_active: false,
      });
      
      toast({
        title: "Agente duplicado",
        description: `Uma cópia de "${agent.name}" foi criada.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao duplicar",
        description: "Não foi possível duplicar o agente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAgent = async () => {
    if (!agentToDelete) return;
    
    try {
      await deleteAutomation.mutateAsync(agentToDelete.id);
      setAgentToDelete(null);
      
      if (selectedAgent?.id === agentToDelete.id) {
        setViewMode("list");
        setSelectedAgent(null);
      }
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o agente.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!selectedAgent) return;
    
    setIsSaving(true);
    try {
      const triggerConfig = {
        keywords: keywords.split(",").map(k => k.trim()).filter(k => k.length > 0),
        response_delay: responseDelay,
        channel_type: channelType,
        selected_instance: channelType === "instance" ? selectedInstance : null,
        selected_department: channelType === "department" ? selectedDepartment : null,
        knowledge_base_ids: selectedKnowledge,
      };

      await updateAutomation.mutateAsync({
        id: selectedAgent.id,
        ai_prompt: prompt,
        is_active: isActive,
        trigger_config: triggerConfig,
      });

      setHasChanges(false);
      setLastUpdated(new Date());
      setPromptVersion(prev => prev + 1);
      
      setSelectedAgent({
        ...selectedAgent,
        ai_prompt: prompt,
        is_active: isActive,
        trigger_config: triggerConfig,
      });
      
      toast({
        title: "Configuração salva",
        description: "As configurações do agente foram atualizadas.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Filter and group agents
  const filteredAgents = automations.filter(agent => 
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const agentsWithoutFolder = filteredAgents.filter(agent => {
    const agentAny = agent as any;
    return !agentAny.folder_id;
  });

  const getAgentsInFolder = (folderId: string) => {
    return filteredAgents.filter(agent => {
      const agentAny = agent as any;
      return agentAny.folder_id === folderId;
    });
  };

  const getAgentKeywords = (agent: Automation) => {
    const config = agent.trigger_config;
    if (config?.keywords && config.keywords.length > 0) {
      return config.keywords.join(", ");
    }
    return "Sem palavras-chave";
  };

  const getAgentDelay = (agent: Automation) => {
    const config = agent.trigger_config as any;
    return config?.response_delay || 10;
  };

  const isPrimaryAgent = (agent: Automation) => {
    return automations.indexOf(agent) === 0;
  };

  const isLoading = automationsLoading || foldersLoading || knowledgeLoading || instancesLoading || departmentsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Agent Row Component (without drag handle, used inside DraggableAgent)
  const AgentRowContent = ({ agent, inFolder = false }: { agent: Automation; inFolder?: boolean }) => (
    <div
      className={cn(
        "flex-1 grid gap-4 py-4 items-center hover:bg-muted/30 cursor-pointer transition-colors group",
        inFolder ? "grid-cols-[1fr_100px_150px_80px]" : "grid-cols-[1fr_100px_150px_80px]"
      )}
      onClick={() => handleSelectAgent(agent)}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{agent.name}</span>
          {isPrimaryAgent(agent) && (
            <Badge variant="secondary" className="text-xs">
              Primário
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {agent.description || "Sem descrição"}
        </p>
      </div>
      
      <div className="text-center">
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          {getAgentDelay(agent)}s
        </Badge>
      </div>
      
      <div className="text-sm text-muted-foreground truncate">
        {getAgentKeywords(agent)}
      </div>
      
      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleSelectAgent(agent)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Configurar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setAgentToEditInfo(agent);
              setEditAgentName(agent.name);
              setEditAgentDescription(agent.description || "");
            }}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar nome/descrição
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicateAgent(agent)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {folders.length > 0 && (
              <>
                <DropdownMenuItem 
                  className="text-muted-foreground text-xs cursor-default"
                  disabled
                >
                  Mover para pasta
                </DropdownMenuItem>
                {folders.map(folder => (
                  <DropdownMenuItem 
                    key={folder.id}
                    onClick={() => handleMoveToFolder(agent.id, folder.id)}
                  >
                    <Folder 
                      className="h-4 w-4 mr-2" 
                      style={{ color: folder.color }}
                    />
                    {folder.name}
                  </DropdownMenuItem>
                ))}
                {(agent as any).folder_id && (
                  <DropdownMenuItem onClick={() => handleMoveToFolder(agent.id, null)}>
                    <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                    Remover da pasta
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem 
              className="text-destructive"
              onClick={() => setAgentToDelete(agent)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  // Render List View
  if (viewMode === "list") {
    return (
      <DndContext 
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col h-full bg-background">
          {/* Tabs Header */}
          <div className="border-b border-border px-6 pt-4">
            <Tabs defaultValue="agents">
              <TabsList className="bg-transparent p-0 h-auto gap-6">
                <TabsTrigger 
                  value="agents" 
                  className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0 pb-3 text-muted-foreground data-[state=active]:text-primary font-medium"
                >
                  Meus Agentes
                </TabsTrigger>
                <TabsTrigger 
                  value="templates" 
                  className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0 pb-3 text-muted-foreground data-[state=active]:text-primary font-medium"
                >
                  Templates
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Search and Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar agentes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsCreateFolderDialogOpen(true)} 
                className="gap-2"
              >
                <FolderPlus className="h-4 w-4" />
                Nova Pasta
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Agente
              </Button>
            </div>
          </div>

          {/* Agents Table */}
          <div className="flex-1 overflow-auto">
            {/* Table Header */}
            <div className="grid grid-cols-[auto_1fr_100px_150px_80px] gap-4 px-6 py-3 border-b border-border bg-muted/30 text-sm font-medium text-muted-foreground">
              <div className="w-6"></div>
              <div>Agente</div>
              <div className="text-center">Delay</div>
              <div>Palavra-chave</div>
              <div className="text-center">Ações</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border">
              {filteredAgents.length === 0 && folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-1">Nenhum agente criado</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Crie seu primeiro agente de IA para automatizar atendimentos
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Criar Agente
                  </Button>
                </div>
              ) : (
                <>
                  {/* Folders */}
                  {folders.map((folder) => {
                    const folderAgents = getAgentsInFolder(folder.id);
                    const isExpanded = expandedFolders.has(folder.id);
                    
                    return (
                      <DroppableFolder key={folder.id} folder={folder}>
                        <Collapsible
                          open={isExpanded}
                          onOpenChange={() => toggleFolder(folder.id)}
                        >
                          <div className="border-b border-border">
                            <CollapsibleTrigger asChild>
                              <div className="grid grid-cols-[auto_1fr_100px_150px_80px] gap-4 px-6 py-3 items-center hover:bg-muted/30 cursor-pointer transition-colors group bg-muted/10">
                                <div className="flex items-center gap-2 w-6">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  <Folder 
                                    className="h-5 w-5" 
                                    style={{ color: folder.color }}
                                  />
                                  <span className="font-medium">{folder.name}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {folderAgents.length} agente{folderAgents.length !== 1 ? "s" : ""}
                                  </Badge>
                                </div>
                                
                                <div></div>
                                <div></div>
                                
                                <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => {
                                        setFolderToEdit(folder);
                                        setEditFolderName(folder.name);
                                        setEditFolderColor(folder.color);
                                      }}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Editar pasta
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        className="text-destructive"
                                        onClick={() => setFolderToDelete(folder)}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir pasta
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            
                            <CollapsibleContent>
                              <div className="divide-y divide-border bg-muted/5">
                                {folderAgents.length === 0 ? (
                                  <div className="pl-12 py-4 text-sm text-muted-foreground italic">
                                    Arraste um agente para esta pasta
                                  </div>
                                ) : (
                                  folderAgents.map((agent) => (
                                    <div key={agent.id} className="px-6 pl-10">
                                      <DraggableAgent agent={agent}>
                                        <AgentRowContent agent={agent} inFolder />
                                      </DraggableAgent>
                                    </div>
                                  ))
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      </DroppableFolder>
                    );
                  })}

                  {/* Agents without folder */}
                  <DroppableFolder folder={null}>
                    {agentsWithoutFolder.length > 0 && (
                      <div className="divide-y divide-border">
                        {agentsWithoutFolder.map((agent) => (
                          <div key={agent.id} className="px-6">
                            <DraggableAgent agent={agent}>
                              <AgentRowContent agent={agent} />
                            </DraggableAgent>
                          </div>
                        ))}
                      </div>
                    )}
                  </DroppableFolder>
                </>
              )}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeAgent ? (
              <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-medium">{activeAgent.name}</span>
              </div>
            ) : null}
          </DragOverlay>

          {/* Create Folder Dialog */}
          <Dialog open={isCreateFolderDialogOpen} onOpenChange={setIsCreateFolderDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Pasta</DialogTitle>
                <DialogDescription>
                  Crie uma pasta para organizar seus agentes de IA.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="folder-name">Nome da Pasta</Label>
                  <Input
                    id="folder-name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Ex: Atendimento, Vendas, Suporte..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor da Pasta</Label>
                  <div className="flex flex-wrap gap-2">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewFolderColor(color)}
                        className={cn(
                          "h-8 w-8 rounded-full border-2 transition-all",
                          newFolderColor === color 
                            ? "border-foreground scale-110" 
                            : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateFolderDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || createFolder.isPending}
                >
                  {createFolder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar Pasta
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Folder Dialog */}
          <Dialog open={!!folderToEdit} onOpenChange={() => setFolderToEdit(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar Pasta</DialogTitle>
                <DialogDescription>
                  Altere o nome ou a cor da pasta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-folder-name">Nome da Pasta</Label>
                  <Input
                    id="edit-folder-name"
                    value={editFolderName}
                    onChange={(e) => setEditFolderName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor da Pasta</Label>
                  <div className="flex flex-wrap gap-2">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditFolderColor(color)}
                        className={cn(
                          "h-8 w-8 rounded-full border-2 transition-all",
                          editFolderColor === color 
                            ? "border-foreground scale-110" 
                            : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFolderToEdit(null)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleEditFolder}
                  disabled={!editFolderName.trim() || updateFolder.isPending}
                >
                  {updateFolder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Agent Info Dialog */}
          <Dialog open={!!agentToEditInfo} onOpenChange={() => setAgentToEditInfo(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar Agente</DialogTitle>
                <DialogDescription>
                  Altere o nome e descrição do agente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-agent-name">Nome do Agente</Label>
                  <Input
                    id="edit-agent-name"
                    value={editAgentName}
                    onChange={(e) => setEditAgentName(e.target.value)}
                    placeholder="Ex: Laura, Davi..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-agent-description">Descrição</Label>
                  <Textarea
                    id="edit-agent-description"
                    value={editAgentDescription}
                    onChange={(e) => setEditAgentDescription(e.target.value)}
                    placeholder="Ex: Secretaria, Atendimento inicial..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAgentToEditInfo(null)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleEditAgentInfo}
                  disabled={!editAgentName.trim() || updateAutomation.isPending}
                >
                  {updateAutomation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Folder Confirmation */}
          <AlertDialog open={!!folderToDelete} onOpenChange={() => setFolderToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Pasta</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir a pasta "{folderToDelete?.name}"? 
                  Os agentes dentro dela serão movidos para fora da pasta, não serão excluídos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteFolder}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Create Agent Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Agente</DialogTitle>
                <DialogDescription>
                  Crie um novo agente de IA para automatizar seus atendimentos.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Agente</Label>
                  <Input
                    id="name"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    placeholder="Ex: Laura, Davi, Atendimento Inicial..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={newAgentDescription}
                    onChange={(e) => setNewAgentDescription(e.target.value)}
                    placeholder="Descreva o que este agente faz..."
                    rows={3}
                  />
                </div>
                {folders.length > 0 && (
                  <div className="space-y-2">
                    <Label>Pasta (opcional)</Label>
                    <Select 
                      value={newAgentFolderId || "none"} 
                      onValueChange={(value) => setNewAgentFolderId(value === "none" ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma pasta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem pasta</SelectItem>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            <div className="flex items-center gap-2">
                              <Folder className="h-4 w-4" style={{ color: folder.color }} />
                              {folder.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateAgent}
                  disabled={!newAgentName.trim() || createAutomation.isPending}
                >
                  {createAutomation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar Agente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Agent Confirmation */}
          <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Agente</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir "{agentToDelete?.name}"? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAgent}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DndContext>
    );
  }

  // Render Editor View
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToList}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold text-lg">{selectedAgent?.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {selectedAgent?.description || "Configure o comportamento da IA"}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {hasChanges && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                <AlertCircle className="h-3 w-3 mr-1" />
                Não salvo
              </Badge>
            )}
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar Edição
            </Button>
          </div>
        </div>
        
        {/* Version & Last Updated */}
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Versão do prompt:</span>
            <Badge variant="secondary">Versão {promptVersion} - v{promptVersion}</Badge>
          </div>
          {lastUpdated && (
            <span className="text-muted-foreground">
              Última vez salvo em {format(lastUpdated, "dd MMM, HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 p-6 flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardContent className="p-0 flex-1">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Digite aqui o prompt principal da IA...

Exemplo:
Você é um assistente virtual do escritório [Nome do Escritório]. Seu papel é:

1. Fazer a triagem inicial dos clientes
2. Coletar informações básicas sobre o caso
3. Agendar consultas quando solicitado
4. Responder dúvidas frequentes

Regras:
- Seja sempre cordial e profissional
- Nunca dê aconselhamento jurídico específico
- Encaminhe casos complexos para um advogado humano
- Mantenha a confidencialidade das informações"
                className="h-full resize-none border-0 focus-visible:ring-0 rounded-lg text-base font-mono min-h-[400px]"
                maxLength={MAX_PROMPT_LENGTH}
              />
            </CardContent>
          </Card>
          
          {/* Character Counter */}
          <div className="flex items-center justify-between mt-3">
            <span className={cn(
              "text-sm font-medium",
              prompt.length > MAX_PROMPT_LENGTH * 0.9 ? "text-destructive" : "text-primary"
            )}>
              {prompt.length}/{MAX_PROMPT_LENGTH}
            </span>
            <span className={cn(
              "text-sm",
              prompt.length > MAX_PROMPT_LENGTH * 0.9 ? "text-destructive" : "text-muted-foreground"
            )}>
              ({Math.round((prompt.length / MAX_PROMPT_LENGTH) * 100)}%)
            </span>
          </div>
        </div>

        {/* Settings Panel */}
        <div className="w-80 border-l border-border bg-card overflow-hidden flex flex-col shrink-0">
          <div className="p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Configurações do Agente</h2>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Knowledge Base */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Base de Conhecimento
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        {selectedKnowledge.length > 0 
                          ? `${selectedKnowledge.length} base(s) selecionada(s)`
                          : "Selecionar bases"
                        }
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-2">
                      {knowledgeItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          Nenhuma base de conhecimento cadastrada
                        </p>
                      ) : (
                        knowledgeItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <Checkbox
                              id={item.id}
                              checked={selectedKnowledge.includes(item.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedKnowledge([...selectedKnowledge, item.id]);
                                } else {
                                  setSelectedKnowledge(selectedKnowledge.filter(id => id !== item.id));
                                }
                                setHasChanges(true);
                              }}
                            />
                            <label htmlFor={item.id} className="text-sm cursor-pointer flex-1">
                              {item.title}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Response Delay */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Ativação e delay do agente
                </Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={responseDelay}
                    onChange={(e) => {
                      setResponseDelay(Number(e.target.value));
                      setHasChanges(true);
                    }}
                    min={1}
                    max={120}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">segundos</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tempo de espera antes de responder (simula atendimento humano)
                </p>
              </div>

              {/* Keywords */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Palavras-chave
                </Label>
                <Input
                  value={keywords}
                  onChange={(e) => {
                    setKeywords(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="revisão, aposentadoria, contrato"
                />
                <p className="text-xs text-muted-foreground">
                  Separe por vírgula. Se vazio, responde a todos.
                </p>
              </div>

              {/* Channel Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Canal de Atendimento
                </Label>
                <Select 
                  value={channelType} 
                  onValueChange={(value: ChannelType) => {
                    setChannelType(value);
                    setHasChanges(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Geral (todos os contatos)</SelectItem>
                    <SelectItem value="instance">Número específico</SelectItem>
                    <SelectItem value="department">Por departamento</SelectItem>
                  </SelectContent>
                </Select>

                {channelType === "instance" && (
                  <Select 
                    value={selectedInstance} 
                    onValueChange={(value) => {
                      setSelectedInstance(value);
                      setHasChanges(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o número" />
                    </SelectTrigger>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.instance_name} {instance.phone_number ? `(${instance.phone_number})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {channelType === "department" && (
                  <Select 
                    value={selectedDepartment} 
                    onValueChange={(value) => {
                      setSelectedDepartment(value);
                      setHasChanges(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Agent Status */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Power className="h-4 w-4" />
                  Status do Agente
                </Label>
                <Card className={cn(
                  "border-2 transition-colors",
                  isActive ? "border-green-500/30 bg-green-500/5" : "border-border"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-3 w-3 rounded-full",
                          isActive ? "bg-green-500" : "bg-muted-foreground"
                        )} />
                        <div>
                          <p className="font-medium">
                            {isActive ? "Ativo" : "Inativo"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isActive ? "Respondendo mensagens" : "IA desligada"}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => {
                          setIsActive(checked);
                          setHasChanges(true);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Primary Agent Indicator */}
              {selectedAgent && isPrimaryAgent(selectedAgent) && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">
                      Este é o agente primário
                    </span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
