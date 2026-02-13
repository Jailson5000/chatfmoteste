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
import { Plus, Trash2, RefreshCw, Loader2, FileText, Link2, Reply } from "lucide-react";
import { Label } from "@/components/ui/label";

interface Template {
  name: string;
  status: string;
  category: string;
  language: string;
  components?: any[];
}

interface TemplateButton {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
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

  // Basic fields
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("UTILITY");
  const [newLanguage, setNewLanguage] = useState("pt_BR");

  // Components
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [newBody, setNewBody] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  const resetForm = () => {
    setNewName("");
    setNewCategory("UTILITY");
    setNewLanguage("pt_BR");
    setHeaderType("NONE");
    setHeaderText("");
    setNewBody("");
    setFooterText("");
    setButtons([]);
  };

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

  const buildComponents = () => {
    const components: any[] = [];
    if (headerType === "TEXT" && headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    }
    components.push({ type: "BODY", text: newBody.trim() });
    if (footerText.trim()) {
      components.push({ type: "FOOTER", text: footerText.trim() });
    }
    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((b) =>
          b.type === "QUICK_REPLY"
            ? { type: "QUICK_REPLY", text: b.text }
            : { type: "URL", text: b.text, url: b.url }
        ),
      });
    }
    return components;
  };

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
          components: buildComponents(),
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error.message || JSON.stringify(res.data.error));

      toast({ title: "Template criado com sucesso" });
      setDialogOpen(false);
      resetForm();
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

  const addButton = (type: "QUICK_REPLY" | "URL") => {
    if (buttons.length >= 3) {
      toast({ title: "Máximo de 3 botões", variant: "destructive" });
      return;
    }
    setButtons([...buttons, { type, text: "", url: type === "URL" ? "https://" : undefined }]);
  };

  const updateButton = (index: number, field: keyof TemplateButton, value: string) => {
    setButtons(buttons.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
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
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Template de Mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Basic info */}
            <div className="space-y-2">
              <Label>Nome (snake_case)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: boas_vindas"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
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
                <Label>Idioma</Label>
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

            {/* HEADER */}
            <div className="space-y-2 border rounded-md p-3">
              <Label className="text-xs font-semibold text-muted-foreground">HEADER (opcional)</Label>
              <Select value={headerType} onValueChange={(v) => setHeaderType(v as "NONE" | "TEXT")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Nenhum</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                </SelectContent>
              </Select>
              {headerType === "TEXT" && (
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Ex: Confirmação de agendamento"
                  maxLength={60}
                />
              )}
            </div>

            {/* BODY */}
            <div className="space-y-2 border rounded-md p-3">
              <Label className="text-xs font-semibold text-muted-foreground">BODY (obrigatório)</Label>
              <Textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Olá {{1}}! Seu agendamento para {{2}} foi confirmado."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{1}}"}, {"{{2}}"} para variáveis dinâmicas.
              </p>
            </div>

            {/* FOOTER */}
            <div className="space-y-2 border rounded-md p-3">
              <Label className="text-xs font-semibold text-muted-foreground">FOOTER (opcional)</Label>
              <Input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Ex: Responda CANCELAR para desmarcar"
                maxLength={60}
              />
            </div>

            {/* BUTTONS */}
            <div className="space-y-3 border rounded-md p-3">
              <Label className="text-xs font-semibold text-muted-foreground">BOTÕES (opcional, máx. 3)</Label>
              
              {buttons.map((btn, i) => (
                <div key={i} className="flex items-start gap-2 bg-muted/50 rounded p-2">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {btn.type === "QUICK_REPLY" ? (
                        <Badge variant="secondary" className="text-xs"><Reply className="h-3 w-3 mr-1" />Resposta Rápida</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs"><Link2 className="h-3 w-3 mr-1" />URL</Badge>
                      )}
                    </div>
                    <Input
                      value={btn.text}
                      onChange={(e) => updateButton(i, "text", e.target.value)}
                      placeholder="Texto do botão"
                      maxLength={25}
                      className="h-8 text-sm"
                    />
                    {btn.type === "URL" && (
                      <Input
                        value={btn.url || ""}
                        onChange={(e) => updateButton(i, "url", e.target.value)}
                        placeholder="https://seusite.com"
                        className="h-8 text-sm font-mono"
                      />
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeButton(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {buttons.length < 3 && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton("QUICK_REPLY")}>
                    <Reply className="h-3 w-3 mr-1" /> Resposta Rápida
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton("URL")}>
                    <Link2 className="h-3 w-3 mr-1" /> URL
                  </Button>
                </div>
              )}
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
