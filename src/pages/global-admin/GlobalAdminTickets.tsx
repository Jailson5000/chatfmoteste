import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertCircle, CheckCircle2, Clock, Eye, Loader2, MessageSquare, Search, Send, Ticket, User } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

type TicketStatus = "aberto" | "em_andamento" | "aguardando_cliente" | "resolvido" | "fechado";

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: "Aberto", color: "bg-blue-500", icon: <AlertCircle className="h-3 w-3" /> },
  em_andamento: { label: "Em Andamento", color: "bg-yellow-500", icon: <Clock className="h-3 w-3" /> },
  aguardando_cliente: { label: "Aguardando", color: "bg-orange-500", icon: <User className="h-3 w-3" /> },
  resolvido: { label: "Resolvido", color: "bg-green-500", icon: <CheckCircle2 className="h-3 w-3" /> },
  fechado: { label: "Fechado", color: "bg-gray-500", icon: <CheckCircle2 className="h-3 w-3" /> },
};

export default function GlobalAdminTickets() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [resolution, setResolution] = useState("");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets", statusFilter],
    queryFn: async () => {
      let query = supabase.from("support_tickets").select("*, law_firm:law_firms(name)").order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const { data: messages = [] } = useQuery({
    queryKey: ["ticket-messages", selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return [];
      const { data, error } = await supabase.from("ticket_messages").select("*").eq("ticket_id", selectedTicketId).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTicketId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const { error } = await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tickets"] }); toast.success("Status atualizado!"); },
  });

  const resolveTicket = useMutation({
    mutationFn: async ({ ticketId, res }: { ticketId: string; res: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_tickets").update({ status: "resolvido", resolution: res, resolved_at: new Date().toISOString(), resolved_by: user?.id }).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tickets"] }); setResolution(""); toast.success("Ticket resolvido!"); },
  });

  const sendMessage = useMutation({
    mutationFn: async ({ ticketId, message, internal }: { ticketId: string; message: string; internal: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("ticket_messages").insert({ ticket_id: ticketId, sender_id: user?.id, content: message, is_internal: internal, sender_type: "admin" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-messages"] }); setNewMessage(""); toast.success("Mensagem enviada!"); },
  });

  const filteredTickets = tickets.filter(t => t.title?.toLowerCase().includes(searchTerm.toLowerCase()) || t.law_firm?.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Ticket className="h-6 w-6 text-red-500" />Tickets de Suporte</h1><p className="text-white/60 text-sm mt-1">Gerencie os tickets abertos pelos clientes</p></div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" /><Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-white/5 border-white/10 text-white" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-48 bg-white/5 border-white/10 text-white"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.keys(statusConfig).map(s => <SelectItem key={s} value={s}>{statusConfig[s as TicketStatus].label}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="grid grid-cols-5 gap-4">{Object.entries(statusConfig).map(([s, c]) => <div key={s} className="bg-white/5 border border-white/10 rounded-lg p-4 cursor-pointer hover:bg-white/10" onClick={() => setStatusFilter(s)}><div className="flex items-center gap-2"><div className={`${c.color} p-1.5 rounded`}>{c.icon}</div><span className="text-white/60 text-sm">{c.label}</span></div><p className="text-2xl font-bold text-white mt-2">{tickets.filter(t => t.status === s).length}</p></div>)}</div>
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        {isLoading ? <div className="flex justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-white/40" /></div> : filteredTickets.length === 0 ? <div className="flex flex-col items-center justify-center h-48 text-white/40"><Ticket className="h-12 w-12 mb-2" /><p>Nenhum ticket</p></div> : (
          <Table><TableHeader><TableRow className="border-white/10"><TableHead className="text-white/60">Título</TableHead><TableHead className="text-white/60">Empresa</TableHead><TableHead className="text-white/60">Status</TableHead><TableHead className="text-white/60">Criado</TableHead><TableHead className="text-white/60 text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{filteredTickets.map(t => <TableRow key={t.id} className="border-white/10 hover:bg-white/5"><TableCell className="text-white font-medium">{t.title}</TableCell><TableCell className="text-white/80">{t.law_firm?.name || "—"}</TableCell><TableCell><Badge className={`${statusConfig[t.status as TicketStatus]?.color} text-white`}>{statusConfig[t.status as TicketStatus]?.label}</Badge></TableCell><TableCell className="text-white/60">{format(new Date(t.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={() => { setSelectedTicketId(t.id); setResolution(t.resolution || ""); }}><Eye className="h-4 w-4 mr-1" />Ver</Button></TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </div>
      <Sheet open={!!selectedTicketId} onOpenChange={() => setSelectedTicketId(null)}>
        <SheetContent className="w-full sm:max-w-2xl bg-[#1a1a1a] border-white/10 text-white overflow-y-auto">
          {selectedTicket && (<><SheetHeader><SheetTitle className="text-white flex items-center gap-2"><Ticket className="h-5 w-5 text-red-500" />{selectedTicket.title}</SheetTitle></SheetHeader>
            <div className="space-y-6 mt-6">
              <div className="grid grid-cols-2 gap-4"><div><Label className="text-white/60">Empresa</Label><p className="text-white">{selectedTicket.law_firm?.name || "—"}</p></div><div><Label className="text-white/60">Status</Label><Select value={selectedTicket.status} onValueChange={v => updateStatus.mutate({ ticketId: selectedTicket.id, status: v })}><SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusConfig).map(([s, c]) => <SelectItem key={s} value={s}>{c.label}</SelectItem>)}</SelectContent></Select></div></div>
              <Separator className="bg-white/10" />
              <div><Label className="text-white/60">Descrição</Label><p className="text-white mt-1 bg-white/5 p-3 rounded-lg whitespace-pre-wrap">{selectedTicket.content}</p></div>
              <Separator className="bg-white/10" />
              <div><Label className="text-white/60">Resolução</Label>{selectedTicket.status === "resolvido" || selectedTicket.status === "fechado" ? <p className="text-white mt-1 bg-green-500/10 p-3 rounded-lg border border-green-500/30">{selectedTicket.resolution || "Sem resolução"}</p> : <div className="mt-1 space-y-2"><Textarea placeholder="Resolução..." value={resolution} onChange={e => setResolution(e.target.value)} className="bg-white/5 border-white/10 text-white" rows={3} /><Button onClick={() => resolveTicket.mutate({ ticketId: selectedTicket.id, res: resolution })} disabled={!resolution.trim()} className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-4 w-4 mr-2" />Resolver</Button></div>}</div>
              <Separator className="bg-white/10" />
              <div><Label className="text-white/60 flex items-center gap-2"><MessageSquare className="h-4 w-4" />Mensagens</Label><ScrollArea className="h-64 mt-2 bg-white/5 rounded-lg p-3">{messages.length === 0 ? <p className="text-white/40 text-center">Sem mensagens</p> : messages.map(m => <div key={m.id} className={`p-3 rounded-lg mb-2 ${m.is_internal ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-white/5"}`}><div className="flex items-center gap-2 mb-1"><Avatar className="h-6 w-6"><AvatarFallback className="bg-red-600/20 text-red-400 text-xs">{m.sender_type === "admin" ? "A" : "C"}</AvatarFallback></Avatar><span className="text-white text-sm font-medium">{m.sender_type === "admin" ? "Suporte" : "Cliente"}</span>{m.is_internal && <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">Interno</Badge>}<span className="text-white/40 text-xs ml-auto">{format(new Date(m.created_at), "dd/MM HH:mm")}</span></div><p className="text-white/80 text-sm">{m.content}</p></div>)}</ScrollArea>
                <div className="mt-3 space-y-2"><div className="flex items-center gap-2"><input type="checkbox" id="internal" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded" /><label htmlFor="internal" className="text-white/60 text-sm">Mensagem interna</label></div><div className="flex gap-2"><Input placeholder="Mensagem..." value={newMessage} onChange={e => setNewMessage(e.target.value)} className="bg-white/5 border-white/10 text-white flex-1" onKeyDown={e => { if (e.key === "Enter" && newMessage.trim()) sendMessage.mutate({ ticketId: selectedTicket.id, message: newMessage, internal: isInternal }); }} /><Button onClick={() => sendMessage.mutate({ ticketId: selectedTicket.id, message: newMessage, internal: isInternal })} disabled={!newMessage.trim()} className="bg-red-600 hover:bg-red-700"><Send className="h-4 w-4" /></Button></div></div>
              </div>
            </div></>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}