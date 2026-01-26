import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Clock, HelpCircle, Lightbulb, Loader2, MessageSquare, Plus, Send, Ticket, Bug } from "lucide-react";
import { toast } from "sonner";

type TicketStatus = "aberto" | "em_andamento" | "aguardando_cliente" | "resolvido" | "fechado";
type TicketType = "bug" | "duvida" | "sugestao" | "outro";

const statusLabels: Record<TicketStatus, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", aguardando_cliente: "Aguardando", resolvido: "Resolvido", fechado: "Fechado"
};

const typeLabels: Record<TicketType, { label: string; icon: React.ReactNode }> = {
  bug: { label: "Bug", icon: <Bug className="h-4 w-4" /> },
  duvida: { label: "Dúvida", icon: <HelpCircle className="h-4 w-4" /> },
  sugestao: { label: "Sugestão", icon: <Lightbulb className="h-4 w-4" /> },
  outro: { label: "Outro", icon: <MessageSquare className="h-4 w-4" /> },
};

export default function Support() {
  const { tenant } = useTenant();
  const lawFirmId = tenant?.id;
  const queryClient = useQueryClient();
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("duvida");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", lawFirmId],
    queryFn: async () => {
      if (!lawFirmId) return [];
      const { data, error } = await supabase.from("support_tickets").select("*").eq("law_firm_id", lawFirmId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!lawFirmId,
  });

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const { data: messages = [] } = useQuery({
    queryKey: ["ticket-messages", selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return [];
      const { data, error } = await supabase.from("ticket_messages").select("*").eq("ticket_id", selectedTicketId).eq("is_internal", false).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTicketId,
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_tickets").insert({ law_firm_id: lawFirmId!, created_by: user?.id, title, content: description, type });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setIsNewTicketOpen(false);
      setTitle(""); setDescription(""); setType("duvida");
      toast.success("Ticket criado!");
    },
    onError: () => toast.error("Erro ao criar ticket"),
  });

  const sendMessage = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("ticket_messages").insert({ ticket_id: ticketId, sender_id: user?.id, content: message, is_internal: false, sender_type: "client" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-messages"] }); setNewMessage(""); toast.success("Mensagem enviada!"); },
    onError: () => toast.error("Erro ao enviar"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><HelpCircle className="h-6 w-6 text-primary" />Suporte</h1>
          <p className="text-muted-foreground text-sm mt-1">Abra tickets para reportar problemas</p>
        </div>
        <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Ticket</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Abrir Novo Ticket</DialogTitle><DialogDescription>Descreva seu problema</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div><Label>Tipo</Label><Select value={type} onValueChange={(v) => setType(v as TicketType)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}><span className="flex items-center gap-2">{v.icon}{v.label}</span></SelectItem>)}</SelectContent></Select></div>
              <div><Label>Título</Label><Input placeholder="Resumo" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" /></div>
              <div><Label>Descrição</Label><Textarea placeholder="Detalhes..." value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={5} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsNewTicketOpen(false)}>Cancelar</Button><Button onClick={() => createTicket.mutate()} disabled={!title.trim() || !description.trim() || createTicket.isPending}>{createTicket.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ticket className="h-4 w-4 mr-2" />}Abrir</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-lg"><Ticket className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{tickets.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-yellow-500/10 p-2 rounded-lg"><Clock className="h-5 w-5 text-yellow-500" /></div><div><p className="text-2xl font-bold">{tickets.filter(t => !["resolvido","fechado"].includes(t.status)).length}</p><p className="text-sm text-muted-foreground">Em Aberto</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-green-500/10 p-2 rounded-lg"><CheckCircle2 className="h-5 w-5 text-green-500" /></div><div><p className="text-2xl font-bold">{tickets.filter(t => ["resolvido","fechado"].includes(t.status)).length}</p><p className="text-sm text-muted-foreground">Resolvidos</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-orange-500/10 p-2 rounded-lg"><AlertCircle className="h-5 w-5 text-orange-500" /></div><div><p className="text-2xl font-bold">{tickets.filter(t => t.status === "aguardando_cliente").length}</p><p className="text-sm text-muted-foreground">Aguardando</p></div></div></CardContent></Card>
      </div>

      {isLoading ? <div className="flex justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : tickets.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12"><Ticket className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-lg font-medium">Nenhum ticket</h3><Button className="mt-4" onClick={() => setIsNewTicketOpen(true)}><Plus className="h-4 w-4 mr-2" />Abrir Primeiro</Button></CardContent></Card>
      ) : (
        <div className="space-y-4">{tickets.map(ticket => (
          <Card key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTicketId(ticket.id)}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4"><div className="bg-primary/10 p-2 rounded-lg text-primary">{typeLabels[ticket.type as TicketType]?.icon}</div><div><h3 className="font-medium">{ticket.title}</h3><p className="text-sm text-muted-foreground">{format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p></div></div>
              <Badge variant={ticket.status === "resolvido" ? "default" : "secondary"}>{statusLabels[ticket.status as TicketStatus]}</Badge>
            </CardContent>
          </Card>
        ))}</div>
      )}

      <Sheet open={!!selectedTicketId} onOpenChange={() => setSelectedTicketId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedTicket && (<>
            <SheetHeader><SheetTitle className="flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" />{selectedTicket.title}</SheetTitle></SheetHeader>
            <div className="space-y-6 mt-6">
              <div className="flex gap-3"><Badge variant="outline">{typeLabels[selectedTicket.type as TicketType]?.label}</Badge><Badge>{statusLabels[selectedTicket.status as TicketStatus]}</Badge></div>
              <div><Label className="text-muted-foreground">Descrição</Label><p className="mt-1 bg-muted p-3 rounded-lg whitespace-pre-wrap">{selectedTicket.content}</p></div>
              {selectedTicket.resolution && <div><Label className="text-muted-foreground">Resolução</Label><p className="mt-1 bg-green-500/10 p-3 rounded-lg border border-green-500/30">{selectedTicket.resolution}</p></div>}
              <Separator />
              <div><Label className="text-muted-foreground flex items-center gap-2"><MessageSquare className="h-4 w-4" />Mensagens</Label>
                <ScrollArea className="h-64 mt-2 bg-muted rounded-lg p-3">{messages.length === 0 ? <p className="text-muted-foreground text-center">Sem mensagens</p> : messages.map(m => <div key={m.id} className="p-3 rounded-lg bg-background mb-2"><p className="text-sm">{m.content}</p><span className="text-xs text-muted-foreground">{format(new Date(m.created_at), "dd/MM HH:mm")}</span></div>)}</ScrollArea>
                {!["resolvido","fechado"].includes(selectedTicket.status) && <div className="mt-3 flex gap-2"><Input placeholder="Mensagem..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newMessage.trim()) sendMessage.mutate({ ticketId: selectedTicket.id, message: newMessage }); }} /><Button onClick={() => sendMessage.mutate({ ticketId: selectedTicket.id, message: newMessage })} disabled={!newMessage.trim() || sendMessage.isPending}>{sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div>}
              </div>
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}