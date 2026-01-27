import { useState, useEffect } from "react";
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
import { AlertCircle, CheckCircle2, Clock, HelpCircle, Lightbulb, Loader2, MessageSquare, Plus, Send, Ticket, Bug, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", lawFirmId],
    queryFn: async () => {
      if (!lawFirmId) return [];
      const { data, error } = await supabase
        .from("support_tickets")
        .select(`
          *,
          ticket_messages(created_at, sender_type, is_internal)
        `)
        .eq("law_firm_id", lawFirmId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Calculate hasUnreadReply for each ticket
      return data.map(t => ({
        ...t,
        hasUnreadReply: t.ticket_messages?.some((m: { sender_type: string; is_internal: boolean; created_at: string }) => 
          m.sender_type === "admin" && 
          !m.is_internal && 
          new Date(m.created_at) > new Date(t.client_last_read_at || t.created_at)
        ) ?? false
      }));
    },
    enabled: !!lawFirmId,
  });

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // Filter tickets based on search and status
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Mark ticket as read when opened
  useEffect(() => {
    if (selectedTicketId) {
      supabase
        .from("support_tickets")
        .update({ client_last_read_at: new Date().toISOString() })
        .eq("id", selectedTicketId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
        });
    }
  }, [selectedTicketId, queryClient]);

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
    <div className="p-6 space-y-6 bg-background min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suporte</h1>
          <p className="text-sm text-muted-foreground">Abra tickets para reportar problemas</p>
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

      {/* Busca e Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por título..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="em_andamento">Em Andamento</SelectItem>
            <SelectItem value="aguardando_cliente">Aguardando</SelectItem>
            <SelectItem value="resolvido">Resolvido</SelectItem>
            <SelectItem value="fechado">Fechado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-lg"><Ticket className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{tickets.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-yellow-500/10 p-2 rounded-lg"><Clock className="h-5 w-5 text-yellow-500" /></div><div><p className="text-2xl font-bold">{tickets.filter(t => !["resolvido","fechado"].includes(t.status)).length}</p><p className="text-sm text-muted-foreground">Em Aberto</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-green-500/10 p-2 rounded-lg"><CheckCircle2 className="h-5 w-5 text-green-500" /></div><div><p className="text-2xl font-bold">{tickets.filter(t => ["resolvido","fechado"].includes(t.status)).length}</p><p className="text-sm text-muted-foreground">Resolvidos</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><div className="bg-orange-500/10 p-2 rounded-lg"><AlertCircle className="h-5 w-5 text-orange-500" /></div><div><p className="text-2xl font-bold">{tickets.filter(t => t.status === "aguardando_cliente").length}</p><p className="text-sm text-muted-foreground">Aguardando</p></div></div></CardContent></Card>
      </div>

      {isLoading ? <div className="flex justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : filteredTickets.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12"><Ticket className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-lg font-medium">{tickets.length === 0 ? "Nenhum ticket" : "Nenhum ticket encontrado"}</h3>{tickets.length === 0 && <Button className="mt-4" onClick={() => setIsNewTicketOpen(true)}><Plus className="h-4 w-4 mr-2" />Abrir Primeiro</Button>}</CardContent></Card>
      ) : (
        <div className="space-y-4">{filteredTickets.map(ticket => (
          <Card key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTicketId(ticket.id)}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4"><div className="bg-primary/10 p-2 rounded-lg text-primary">{typeLabels[ticket.type as TicketType]?.icon}</div><div><h3 className="font-medium">{ticket.title}</h3><p className="text-sm text-muted-foreground">{format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p></div></div>
              <div className="flex items-center gap-2">
                {ticket.hasUnreadReply && (
                  <Badge variant="destructive" className="animate-pulse">
                    Nova resposta
                  </Badge>
                )}
                <Badge variant={ticket.status === "resolvido" ? "default" : "secondary"}>{statusLabels[ticket.status as TicketStatus]}</Badge>
              </div>
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
                <ScrollArea className="h-64 mt-2 bg-muted rounded-lg p-3">
                  {messages.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Sem mensagens</p>
                  ) : (
                    messages.map(m => {
                      const isClient = m.sender_type === "client";
                      return (
                        <div 
                          key={m.id} 
                          className={cn(
                            "p-3 rounded-lg mb-2 max-w-[85%]",
                            isClient 
                              ? "bg-primary/10 ml-auto" 
                              : "bg-emerald-500/10 mr-auto"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "text-xs font-medium",
                              isClient ? "text-primary" : "text-emerald-600"
                            )}>
                              {isClient ? "Você" : "Suporte"}
                            </span>
                          </div>
                          <p className="text-sm">{m.content}</p>
                          <span className={cn(
                            "text-xs text-muted-foreground block mt-1",
                            isClient ? "text-right" : "text-left"
                          )}>
                            {format(new Date(m.created_at), "dd/MM HH:mm")}
                          </span>
                        </div>
                      );
                    })
                  )}
                </ScrollArea>
                {!["resolvido","fechado"].includes(selectedTicket.status) && <div className="mt-3 flex gap-2"><Input placeholder="Mensagem..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newMessage.trim()) sendMessage.mutate({ ticketId: selectedTicket.id, message: newMessage }); }} /><Button onClick={() => sendMessage.mutate({ ticketId: selectedTicket.id, message: newMessage })} disabled={!newMessage.trim() || sendMessage.isPending}>{sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div>}
              </div>
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}