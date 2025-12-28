import { useState } from 'react';
import { useKnowledgeItems, useAgentKnowledge } from '@/hooks/useKnowledgeItems';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  FileText,
  Plus,
  Trash2,
  Upload,
  Search,
  Link2,
  Unlink,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useLawFirm } from '@/hooks/useLawFirm';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  { value: 'legal', label: 'Informações Legais' },
  { value: 'procedures', label: 'Procedimentos' },
  { value: 'faq', label: 'Perguntas Frequentes' },
  { value: 'policies', label: 'Políticas' },
  { value: 'templates', label: 'Modelos' },
  { value: 'other', label: 'Outros' },
];

interface AgentKnowledgeSectionProps {
  automationId: string;
}

export function AgentKnowledgeSection({ automationId }: AgentKnowledgeSectionProps) {
  const { knowledgeItems, isLoading: itemsLoading, createItem } = useKnowledgeItems();
  const { agentKnowledge, isLoading: linkLoading, linkKnowledge, unlinkKnowledge } = useAgentKnowledge(automationId);
  const { lawFirm } = useLawFirm();
  const lawFirmId = lawFirm?.id;
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const [newItem, setNewItem] = useState({
    title: '',
    content: '',
    category: 'other',
    item_type: 'text' as 'text' | 'document',
  });

  const linkedItemIds = new Set(agentKnowledge.map(ak => ak.knowledge_item_id));

  const filteredItems = knowledgeItems.filter(
    item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.content?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const handleCreateItem = async () => {
    await createItem.mutateAsync({
      title: newItem.title,
      content: newItem.content,
      category: newItem.category,
      item_type: newItem.item_type,
      file_url: null,
      file_name: null,
      file_type: null,
      file_size: null,
    });
    setIsAddDialogOpen(false);
    setNewItem({ title: '', content: '', category: 'other', item_type: 'text' });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lawFirmId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${lawFirmId}/${Date.now()}.${fileExt}`;

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

  const handleToggleLink = async (itemId: string) => {
    if (linkedItemIds.has(itemId)) {
      await unlinkKnowledge.mutateAsync(itemId);
    } else {
      await linkKnowledge.mutateAsync(itemId);
    }
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h3 className="font-semibold">Base de Conhecimento</h3>
        </div>
        <Badge variant="secondary">
          {agentKnowledge.length} vinculado{agentKnowledge.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <Separator />

      {/* Linked Items */}
      <ScrollArea className="h-48">
        {linkLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : agentKnowledge.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum conhecimento vinculado
            </p>
          </div>
        ) : (
          <div className="space-y-2 pr-2">
            {agentKnowledge.map((ak) => (
              <div
                key={ak.id}
                className="flex items-center justify-between p-2 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {ak.knowledge_items?.item_type === 'document' ? (
                    <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm truncate">
                    {ak.knowledge_items?.title}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => handleToggleLink(ak.knowledge_item_id)}
                >
                  <Unlink className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Actions */}
      <div className="flex gap-2">
        <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 gap-2">
              <Link2 className="h-4 w-4" />
              Vincular
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Vincular Conhecimento</DialogTitle>
              <DialogDescription>
                Selecione os itens que este agente deve usar.
              </DialogDescription>
            </DialogHeader>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="h-64">
              {itemsLoading ? (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum item encontrado
                </p>
              ) : (
                <div className="space-y-2 pr-2">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        linkedItemIds.has(item.id)
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                      onClick={() => handleToggleLink(item.id)}
                    >
                      <Checkbox
                        checked={linkedItemIds.has(item.id)}
                        onCheckedChange={() => handleToggleLink(item.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.item_type === 'document' ? (
                            <Upload className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm truncate">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {getCategoryLabel(item.category)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 gap-2">
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Conhecimento</DialogTitle>
              <DialogDescription>
                Adicione um texto ou documento à base.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Título</Label>
                <Input
                  value={newItem.title}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  placeholder="Ex: Prazo para Recurso"
                />
              </div>

              <div className="grid gap-2">
                <Label>Categoria</Label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label>Conteúdo</Label>
                <Textarea
                  value={newItem.content}
                  onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                  placeholder="Digite o conteúdo..."
                  className="min-h-[120px]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCreateItem}
                  disabled={!newItem.title || !newItem.content || createItem.isPending}
                  className="flex-1"
                >
                  {createItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adicionar Texto
                </Button>
              </div>

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                  ou
                </span>
              </div>

              <div>
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg hover:border-primary/50 transition-colors">
                    {isUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {isUploading ? 'Enviando...' : 'Enviar documento'}
                    </span>
                  </div>
                </Label>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
