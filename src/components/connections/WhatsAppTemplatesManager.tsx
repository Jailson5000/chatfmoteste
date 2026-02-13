import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, RefreshCw, Loader2, FileText } from "lucide-react";

interface Template {
  name: string;
  status: string;
  category: string;
  language: string;
  components?: any[];
}

interface WhatsAppTemplatesManagerProps {
  connectionId: string;
}

export function WhatsAppTemplatesManager({ connectionId }: WhatsAppTemplatesManagerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("UTILITY");
  const [newLanguage, setNewLanguage] = useState("pt_BR");
  const [newBody, setNewBody] = useState("");

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke("meta-api", {
        body: { action: "list_templates", connectionId },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) {
        throw new Error(res.data.error.message || JSON.stringify(res.data.error));
      }
      setTemplates(res.data?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao listar templates", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [connectionId, toast]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!newName || !newBody) {
      toast({ title: "Preencha nome e corpo da mensagem", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await supabase.functions.invoke("meta-api", {
        body: {
          action: "create_template",
          connectionId,
          name: newName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
          category: newCategory,
          language: newLanguage,
          components: [{ type: "BODY", text: newBody }],
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error.message || JSON.stringify(res.data.error));

      toast({ title: "Template criado com sucesso" });
      setDialogOpen(false);
      setNewName(""); setNewBody("");
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Erro ao criar template", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (templateName: string) => {
    if (!window.confirm(`Excluir template "${templateName}"?`)) return;
    setDeleting(templateName);
    try {
      const res = await supabase.functions.invoke("meta-api", {
        body: { action: "delete_template", connectionId, templateName },
      });
      if (res.error) throw new Error(res.error.message);
      toast({ title: "Template excluído" });
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Erro ao excluir template", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      APPROVED: { variant: "default", label: "Aprovado" },
      PENDING: { variant: "secondary", label: "Pendente" },
      REJECTED: { variant: "destructive", label: "Rejeitado" },
    };
    const s = map[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <div className="border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Templates de Mensagem
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum template encontrado.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={`${t.name}-${t.language}`}>
                  <TableCell className="font-mono text-xs">{t.name}</TableCell>
                  <TableCell>{statusBadge(t.status)}</TableCell>
                  <TableCell className="text-xs">{t.category}</TableCell>
                  <TableCell className="text-xs">{t.language}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(t.name)}
                      disabled={deleting === t.name}
                    >
                      {deleting === t.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Template de Mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome (snake_case)</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: boas_vindas"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoria</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Idioma</label>
                <Select value={newLanguage} onValueChange={setNewLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (BR)</SelectItem>
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Corpo da mensagem</label>
              <Textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Olá! Obrigado por entrar em contato..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
