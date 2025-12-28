import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useKnowledgeItems, KnowledgeItem } from "@/hooks/useKnowledgeItems";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Edit, BookOpen, FileText, Search, Database, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";

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
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);

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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
        </Card>
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
    if (selectedItem?.id === editItem.id) {
      setSelectedItem({ ...selectedItem, title: editItem.title, content: editItem.content, category: editItem.category });
    }
  };

  const handleDeleteItem = async (id: string) => {
    await deleteItem.mutateAsync(id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
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
    setEditItem({
      id: item.id,
      title: item.title,
      content: item.content || '',
      category: item.category,
    });
    setIsEditDialogOpen(true);
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  const filteredItems = knowledgeItems.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.content?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Base de Conhecimento</h1>
          <p className="text-muted-foreground">
            Gerencie o conhecimento que a IA utiliza para responder perguntas
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
                Novo Conhecimento
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
                    placeholder="Ex: Prazo para Recurso"
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
          placeholder="Buscar na base de conhecimento..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Conhecimentos */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Itens ({filteredItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum conhecimento cadastrado'}
                </p>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedItem?.id === item.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {item.item_type === 'document' ? (
                          <Upload className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-medium text-sm block truncate">{item.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {getCategoryLabel(item.category)}
                            </span>
                            {item.item_type === 'document' && (
                              <Badge variant="outline" className="text-[10px]">
                                Documento
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(item);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir Conhecimento</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir "{item.title}"? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteItem(item.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Visualização do Conteúdo */}
        <div className="lg:col-span-2">
          {selectedItem ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedItem.item_type === 'document' ? (
                        <Upload className="h-5 w-5" />
                      ) : (
                        <BookOpen className="h-5 w-5" />
                      )}
                      {selectedItem.title}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-2">
                      {getCategoryLabel(selectedItem.category)}
                      {selectedItem.item_type === 'document' && (
                        <Badge variant="secondary">Documento</Badge>
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(selectedItem)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {selectedItem.item_type === 'document' && selectedItem.file_url ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm">
                        <strong>Arquivo:</strong> {selectedItem.file_name}
                      </p>
                      {selectedItem.file_size && (
                        <p className="text-sm text-muted-foreground">
                          Tamanho: {(selectedItem.file_size / 1024).toFixed(2)} KB
                        </p>
                      )}
                    </div>
                    <Button asChild>
                      <a href={selectedItem.file_url} target="_blank" rel="noopener noreferrer">
                        Abrir Documento
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p className="whitespace-pre-wrap">{selectedItem.content}</p>
                  </div>
                )}
                <div className="mt-6 pt-4 border-t text-xs text-muted-foreground">
                  <p>Criado em: {new Date(selectedItem.created_at).toLocaleDateString('pt-BR')}</p>
                  <p>Atualizado em: {new Date(selectedItem.updated_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-[400px] text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Selecione um Item</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Escolha um item na lista à esquerda para visualizar seu conteúdo
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
    </div>
  );
}
