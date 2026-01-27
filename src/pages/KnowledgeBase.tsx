import { useState, useMemo } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useKnowledgeItems, KnowledgeItem } from "@/hooks/useKnowledgeItems";
import { useAutomations } from "@/hooks/useAutomations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Edit, Search, Upload, MoreVertical, GripVertical, Bot, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const CATEGORIES = [
  { value: 'legal', label: 'Informações Legais' },
  { value: 'procedures', label: 'Procedimentos' },
  { value: 'faq', label: 'Perguntas Frequentes' },
  { value: 'policies', label: 'Políticas' },
  { value: 'templates', label: 'Modelos' },
  { value: 'other', label: 'Outros' },
];

export default function KnowledgeBase() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { knowledgeItems, isLoading, createItem, updateItem, deleteItem } = useKnowledgeItems();
  const { automations } = useAutomations();
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [newItem, setNewItem] = useState({
    title: '',
    content: '',
    category: 'other',
  });

  const [editItem, setEditItem] = useState({
    id: '',
    title: '',
    content: '',
    category: 'other',
  });

  // Fetch all agent links for all items
  const { data: allAgentLinks = {} } = useQuery({
    queryKey: ['all-agent-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_knowledge')
        .select('knowledge_item_id, automation_id, automations(id, name)');
      if (error) throw error;
      
      const linksMap: Record<string, Array<{ id: string; name: string }>> = {};
      data?.forEach((link: any) => {
        if (!linksMap[link.knowledge_item_id]) {
          linksMap[link.knowledge_item_id] = [];
        }
        if (link.automations) {
          linksMap[link.knowledge_item_id].push({
            id: link.automations.id,
            name: link.automations.name,
          });
        }
      });
      return linksMap;
    },
  });

  // Fetch which agents this item is linked to (for link dialog)
  const { data: itemAgentLinks = [] } = useQuery({
    queryKey: ['item-agent-links', selectedItem?.id],
    queryFn: async () => {
      if (!selectedItem?.id) return [];
      const { data, error } = await supabase
        .from('agent_knowledge')
        .select('automation_id')
        .eq('knowledge_item_id', selectedItem.id);
      if (error) throw error;
      return data.map(d => d.automation_id);
    },
    enabled: !!selectedItem?.id && isLinkDialogOpen,
  });

  const linkToAgent = useMutation({
    mutationFn: async ({ automationId, knowledgeItemId, lawFirmId }: { automationId: string; knowledgeItemId: string; lawFirmId: string }) => {
      const { error } = await supabase
        .from('agent_knowledge')
        .insert({ automation_id: automationId, knowledge_item_id: knowledgeItemId, law_firm_id: lawFirmId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-agent-links'] });
      queryClient.invalidateQueries({ queryKey: ['all-agent-links'] });
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge'] });
    },
  });

  const unlinkFromAgent = useMutation({
    mutationFn: async ({ automationId, knowledgeItemId }: { automationId: string; knowledgeItemId: string }) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");
      
      // SECURITY: Include law_firm_id for defense in depth
      const { error } = await supabase
        .from('agent_knowledge')
        .delete()
        .eq('automation_id', automationId)
        .eq('knowledge_item_id', knowledgeItemId)
        .eq('law_firm_id', lawFirm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-agent-links'] });
      queryClient.invalidateQueries({ queryKey: ['all-agent-links'] });
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge'] });
    },
  });

  const handleToggleAgentLink = (automationId: string) => {
    if (!selectedItem || !lawFirm?.id) return;
    if (itemAgentLinks.includes(automationId)) {
      unlinkFromAgent.mutate({ automationId, knowledgeItemId: selectedItem.id });
    } else {
      linkToAgent.mutate({ automationId, knowledgeItemId: selectedItem.id, lawFirmId: lawFirm.id });
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Acesso Restrito</h2>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  if (roleLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCreateItem = async () => {
    await createItem.mutateAsync({
      title: newItem.title,
      content: newItem.content,
      category: newItem.category,
      item_type: 'text',
      file_url: null,
      file_name: null,
      file_type: null,
      file_size: null,
    });
    setIsCreateDialogOpen(false);
    setNewItem({ title: '', content: '', category: 'other' });
  };

  const handleEditItem = async () => {
    await updateItem.mutateAsync({
      id: editItem.id,
      title: editItem.title,
      content: editItem.content,
      category: editItem.category,
    });
    setIsEditDialogOpen(false);
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    await deleteItem.mutateAsync(selectedItem.id);
    setIsDeleteDialogOpen(false);
    setSelectedItem(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lawFirm?.id) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${lawFirm.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('internal-chat-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('internal-chat-files')
        .getPublicUrl(fileName);

      await createItem.mutateAsync({
        title: file.name,
        content: null,
        category: 'other',
        item_type: 'document',
        file_url: publicUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
      });

      toast({
        title: 'Documento enviado',
        description: 'O arquivo foi adicionado à base de conhecimento.',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro no upload',
        description: 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const openEditDialog = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setEditItem({
      id: item.id,
      title: item.title,
      content: item.content || '',
      category: item.category,
    });
    setIsEditDialogOpen(true);
  };

  const openLinkDialog = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setIsLinkDialogOpen(true);
  };

  const openDeleteDialog = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  const filteredItems = knowledgeItems.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.content?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const getAgentInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const getAgentColor = (name: string) => {
    const colors = [
      'bg-emerald-500',
      'bg-blue-500',
      'bg-purple-500',
      'bg-amber-500',
      'bg-rose-500',
      'bg-cyan-500',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Base de Conhecimento</h1>
          <p className="text-muted-foreground">
            Centralize e gerencie todo o conhecimento da sua organização
          </p>
        </div>
        
        <div className="flex gap-2">
          <Label htmlFor="kb-file-upload" className="cursor-pointer">
            <Button variant="outline" asChild disabled={isUploading}>
              <span>
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Enviar Documento
              </span>
            </Button>
          </Label>
          <input
            id="kb-file-upload"
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading}
          />

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Base
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle>Adicionar Conhecimento</DialogTitle>
                <DialogDescription>
                  Adicione informações que a IA poderá usar para responder perguntas.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    value={newItem.title}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                    placeholder="Ex: Lista de doenças IRRF"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Categoria</Label>
                  <select
                    id="category"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="content">Conteúdo</Label>
                  <Textarea
                    id="content"
                    value={newItem.content}
                    onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                    placeholder="Digite o conteúdo completo..."
                    className="min-h-[200px]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateItem}
                  disabled={!newItem.title || !newItem.content || createItem.isPending}
                >
                  {createItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Busque por nome, conteúdo, tipo ou ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="text-center w-48">Agentes</TableHead>
              <TableHead className="text-center w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum conhecimento cadastrado'}
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const linkedAgents = allAgentLinks[item.id] || [];
                const timeAgo = formatDistanceToNow(new Date(item.created_at), { 
                  addSuffix: false, 
                  locale: ptBR 
                });
                
                return (
                  <TableRow key={item.id} className="group">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                    </TableCell>
                    <TableCell>
                            <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          {item.item_type === 'document' && item.file_type && (
                            <Badge variant="outline" className="text-xs uppercase">
                              {item.file_type.split('/').pop() || 'doc'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>há {timeAgo}</span>
                          {item.item_type === 'document' && item.file_size && (
                            <span className="text-xs">
                              • {(item.file_size / 1024).toFixed(0)}KB
                            </span>
                          )}
                          {item.item_type === 'text' && item.content && (
                            <span className="text-xs">
                              • {item.content.length} chars
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {linkedAgents.length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          linkedAgents.slice(0, 3).map((agent) => (
                            <Badge
                              key={agent.id}
                              variant="secondary"
                              className="flex items-center gap-1.5 px-2 py-1"
                            >
                              <Avatar className={`h-5 w-5 ${getAgentColor(agent.name)}`}>
                                <AvatarFallback className="text-[10px] text-white bg-transparent">
                                  {getAgentInitial(agent.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs">{agent.name}</span>
                            </Badge>
                          ))
                        )}
                        {linkedAgents.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{linkedAgents.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(item)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLinkDialog(item)}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Vincular Agentes
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => openDeleteDialog(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Link Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular a Agentes de IA</DialogTitle>
            <DialogDescription>
              Selecione os agentes que terão acesso a "{selectedItem?.title}".
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-64">
            {automations && automations.length > 0 ? (
              <div className="space-y-2 pr-2">
                {automations.map((automation) => (
                  <div
                    key={automation.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      itemAgentLinks.includes(automation.id)
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleToggleAgentLink(automation.id)}
                  >
                    <Checkbox
                      checked={itemAgentLinks.includes(automation.id)}
                      onCheckedChange={() => handleToggleAgentLink(automation.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm truncate">
                          {automation.name}
                        </span>
                        {automation.is_active && (
                          <Badge variant="outline" className="text-xs">Ativo</Badge>
                        )}
                      </div>
                      {automation.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {automation.description}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum agente de IA configurado
              </p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Editar Conhecimento</DialogTitle>
            <DialogDescription>
              Atualize as informações deste item.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Título</Label>
              <Input
                id="edit-title"
                value={editItem.title}
                onChange={(e) => setEditItem({ ...editItem, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-category">Categoria</Label>
              <select
                id="edit-category"
                value={editItem.category}
                onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-content">Conteúdo</Label>
              <Textarea
                id="edit-content"
                value={editItem.content}
                onChange={(e) => setEditItem({ ...editItem, content: e.target.value })}
                className="min-h-[200px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleEditItem}
              disabled={!editItem.title || updateItem.isPending}
            >
              {updateItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conhecimento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{selectedItem?.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
