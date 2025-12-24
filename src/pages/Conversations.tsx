import { useState } from "react";
import {
  Search,
  Filter,
  Bot,
  UserCheck,
  Phone,
  Send,
  Paperclip,
  Mic,
  MoreVertical,
  ArrowLeft,
  Image,
  FileText,
  Tag,
  Clock,
  Users,
  Inbox,
  Pencil,
  ArrowRightLeft,
  Folder,
  FileSignature,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mock data with status and tags
const conversations = [
  {
    id: "1",
    name: "Maria Silva",
    phone: "+55 11 99999-1234",
    lastMessage: "Preciso de orientação sobre divórcio consensual...",
    time: "2 min",
    unread: 3,
    handler: "ai" as const,
    status: { id: "1", name: "Qualificado", color: "#22c55e" },
    tags: [{ id: "1", name: "VIP", color: "#8b5cf6" }],
    avatar: null,
    assignedTo: null,
    departmentId: null,
  },
  {
    id: "2",
    name: "João Santos",
    phone: "+55 11 98888-5678",
    lastMessage: "Obrigado pela ajuda com o contrato!",
    time: "15 min",
    unread: 0,
    handler: "human" as const,
    status: { id: "2", name: "Em Análise", color: "#f59e0b" },
    tags: [],
    avatar: null,
    assignedTo: "Dr. Carlos",
    departmentId: "1",
  },
  {
    id: "3",
    name: "Ana Costa",
    phone: "+55 21 97777-9012",
    lastMessage: "Quando posso enviar os documentos?",
    time: "32 min",
    unread: 1,
    handler: "human" as const,
    status: { id: "3", name: "Aguardando Docs", color: "#3b82f6" },
    tags: [{ id: "2", name: "Urgente", color: "#ef4444" }],
    avatar: null,
    assignedTo: "Dra. Fernanda",
    departmentId: "2",
  },
  {
    id: "4",
    name: "Pedro Oliveira",
    phone: "+55 31 96666-3456",
    lastMessage: "Tenho uma dúvida sobre rescisão trabalhista...",
    time: "1h",
    unread: 2,
    handler: "ai" as const,
    status: null,
    tags: [],
    avatar: null,
    assignedTo: null,
    departmentId: null,
  },
  {
    id: "5",
    name: "Carla Mendes",
    phone: "+55 21 95555-7890",
    lastMessage: "Aguardando retorno...",
    time: "2h",
    unread: 0,
    handler: "human" as const,
    status: { id: "1", name: "Qualificado", color: "#22c55e" },
    tags: [{ id: "1", name: "VIP", color: "#8b5cf6" }],
    avatar: null,
    assignedTo: "Dr. Carlos",
    departmentId: "1",
  },
];

const messages = [
  {
    id: "1",
    content: "Olá, boa tarde! Preciso de orientação sobre divórcio consensual.",
    time: "14:30",
    isFromMe: false,
    senderType: "client",
  },
  {
    id: "2",
    content: "Olá! Sou a assistente virtual do escritório. Ficarei feliz em ajudar com a triagem inicial do seu caso. Poderia me informar há quanto tempo vocês estão casados?",
    time: "14:31",
    isFromMe: true,
    senderType: "ai",
  },
  {
    id: "3",
    content: "Estamos casados há 8 anos. Temos 2 filhos menores.",
    time: "14:33",
    isFromMe: false,
    senderType: "client",
  },
  {
    id: "4",
    content: "Entendo. Por haver filhos menores, o divórcio precisará ser homologado judicialmente. Vocês já conversaram sobre a guarda e pensão alimentícia?",
    time: "14:34",
    isFromMe: true,
    senderType: "ai",
  },
  {
    id: "5",
    content: "Sim, queremos guarda compartilhada. Sobre a pensão, ainda não definimos valores.",
    time: "14:36",
    isFromMe: false,
    senderType: "client",
  },
];

const mockDepartments = [
  { id: "1", name: "Comercial", color: "#6366f1" },
  { id: "2", name: "Trabalhista", color: "#22c55e" },
  { id: "3", name: "Civil", color: "#f59e0b" },
];

type ConversationTab = "chat" | "ai" | "queue";

export default function Conversations() {
  const [conversationsList, setConversationsList] = useState(conversations);
  const [selectedConversation, setSelectedConversation] = useState<string | null>("1");
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [activeTab, setActiveTab] = useState<ConversationTab>("chat");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");

  const selected = conversationsList.find((c) => c.id === selectedConversation);

  // Filter conversations by tab
  const filteredConversations = conversationsList.filter((conv) => {
    const matchesSearch = conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.phone.includes(searchQuery);
    
    if (!matchesSearch) return false;

    switch (activeTab) {
      case "chat":
        return conv.handler === "human" && conv.assignedTo;
      case "ai":
        return conv.handler === "ai";
      case "queue":
        return true;
      default:
        return true;
    }
  });

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      // TODO: Send message
      setMessageInput("");
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversation(id);
    setShowMobileChat(true);
  };

  const handleUpdateName = () => {
    if (selected && editingName.trim()) {
      setConversationsList(conversationsList.map(c => 
        c.id === selected.id ? { ...c, name: editingName } : c
      ));
      setEditNameDialogOpen(false);
    }
  };

  const handleTransferHandler = (handler: "ai" | "human") => {
    if (selected) {
      setConversationsList(conversationsList.map(c => 
        c.id === selected.id ? { ...c, handler, assignedTo: handler === "human" ? "Você" : null } : c
      ));
    }
  };

  const handleTransferDepartment = (deptId: string) => {
    if (selected) {
      setConversationsList(conversationsList.map(c => 
        c.id === selected.id ? { ...c, departmentId: deptId } : c
      ));
    }
  };

  const getTabCount = (tab: ConversationTab) => {
    switch (tab) {
      case "chat":
        return conversationsList.filter(c => c.handler === "human" && c.assignedTo).length;
      case "ai":
        return conversationsList.filter(c => c.handler === "ai").length;
      case "queue":
        return conversationsList.length;
    }
  };

  const openEditName = () => {
    if (selected) {
      setEditingName(selected.name);
      setEditNameDialogOpen(true);
    }
  };

  return (
    <div className="h-screen flex animate-fade-in">
      {/* Conversations List */}
      <div
        className={cn(
          "w-full md:w-96 border-r border-border bg-card flex flex-col",
          showMobileChat && "hidden md:flex"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border space-y-4">
          <h1 className="font-display text-xl font-bold">Atendimentos</h1>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="chat" className="gap-2">
                <Users className="h-4 w-4" />
                Chat
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {getTabCount("chat")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Bot className="h-4 w-4" />
                IA
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {getTabCount("ai")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="queue" className="gap-2">
                <Inbox className="h-4 w-4" />
                Fila
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {getTabCount("queue")}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-all duration-200",
                    "hover:bg-muted",
                    selectedConversation === conv.id && "bg-muted ring-1 ring-primary/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {conv.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{conv.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {conv.time}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            conv.handler === "ai"
                              ? "border-status-ai/50 text-status-ai bg-status-ai/10"
                              : "border-status-human/50 text-status-human bg-status-human/10"
                          )}
                        >
                          {conv.handler === "ai" ? (
                            <Bot className="h-3 w-3 mr-1" />
                          ) : (
                            <UserCheck className="h-3 w-3 mr-1" />
                          )}
                          {conv.handler === "ai" ? "IA" : conv.assignedTo || "Advogado"}
                        </Badge>
                        {/* Show status in queue */}
                        {activeTab === "queue" && conv.status && (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ 
                              borderColor: conv.status.color, 
                              color: conv.status.color,
                              backgroundColor: `${conv.status.color}10`
                            }}
                          >
                            {conv.status.name}
                          </Badge>
                        )}
                        {/* Show first tag in queue */}
                        {activeTab === "queue" && conv.tags.length > 0 && (
                          <Badge
                            className="text-xs text-white"
                            style={{ backgroundColor: conv.tags[0].color }}
                          >
                            {conv.tags[0].name}
                          </Badge>
                        )}
                        {conv.unread > 0 && (
                          <Badge className="bg-primary text-primary-foreground h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                            {conv.unread}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-background",
          !showMobileChat && "hidden md:flex"
        )}
      >
        {selected ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setShowMobileChat(false)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary">
                    {selected.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{selected.name}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openEditName}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selected.phone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Transfer Handler */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transferir
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Transferir para</h4>
                      <div className="space-y-2">
                        <Button 
                          variant={selected.handler === "ai" ? "default" : "outline"}
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => handleTransferHandler("ai")}
                        >
                          <Bot className="h-4 w-4 mr-2" />
                          IA
                        </Button>
                        <Button 
                          variant={selected.handler === "human" ? "default" : "outline"}
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => handleTransferHandler("human")}
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Humano
                        </Button>
                      </div>
                      <div className="pt-2 border-t">
                        <h5 className="text-xs text-muted-foreground mb-2">Departamento</h5>
                        {mockDepartments.map(dept => (
                          <Button
                            key={dept.id}
                            variant={selected.departmentId === dept.id ? "default" : "ghost"}
                            size="sm"
                            className="w-full justify-start mb-1"
                            onClick={() => handleTransferDepartment(dept.id)}
                          >
                            <Folder className="h-4 w-4 mr-2" style={{ color: dept.color }} />
                            {dept.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Signature Toggle */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/50">
                  <FileSignature className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="signature" className="text-xs cursor-pointer">Assinatura</Label>
                  <Switch
                    id="signature"
                    checked={signatureEnabled}
                    onCheckedChange={setSignatureEnabled}
                  />
                </div>

                <Badge
                  variant="outline"
                  className={cn(
                    selected.handler === "ai"
                      ? "border-status-ai text-status-ai"
                      : "border-status-human text-status-human"
                  )}
                >
                  {selected.handler === "ai" ? "🤖 IA" : "⚖️ Advogado"}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={openEditName}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar nome
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Tag className="h-4 w-4 mr-2" />
                      Adicionar tag
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Clock className="h-4 w-4 mr-2" />
                      Ver histórico
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.isFromMe ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                        msg.isFromMe
                          ? msg.senderType === "ai"
                            ? "bg-status-ai/10 text-foreground rounded-br-md"
                            : "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      )}
                    >
                      {msg.senderType === "ai" && msg.isFromMe && (
                        <div className="flex items-center gap-1 text-xs text-status-ai mb-1">
                          <Bot className="h-3 w-3" />
                          Assistente IA
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          msg.isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}
                      >
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card">
              <div className="max-w-3xl mx-auto flex items-end gap-2">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Image className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <FileText className="h-5 w-5" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Digite sua mensagem..."
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Mic className="h-5 w-5" />
                  </Button>
                  <Button size="icon" onClick={handleSendMessage}>
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquareIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Name Dialog */}
      <Dialog open={editNameDialogOpen} onOpenChange={setEditNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nome</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Nome do contato"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditNameDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateName}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
