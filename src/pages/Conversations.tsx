import { useState, useMemo, useEffect, useRef } from "react";
import {
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
  MessageSquare,
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
import { ConversationFilters } from "@/components/conversations/ConversationFilters";
import { useConversations } from "@/hooks/useConversations";
import { useDepartments } from "@/hooks/useDepartments";
import { useTags } from "@/hooks/useTags";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

type ConversationTab = "chat" | "ai" | "queue";

interface Message {
  id: string;
  content: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_type: string;
  ai_generated: boolean;
}

export default function Conversations() {
  const { conversations, isLoading, transferHandler, updateConversation } = useConversations();
  const { departments } = useDepartments();
  const { tags } = useTags();
  const { statuses } = useCustomStatuses();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [activeTab, setActiveTab] = useState<ConversationTab>("queue");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationFilters, setConversationFilters] = useState<{
    statuses: string[];
    handlers: Array<'ai' | 'human'>;
    tags: string[];
    searchName: string;
    searchPhone: string;
  }>({ statuses: [], handlers: [], tags: [], searchName: '', searchPhone: '' });

  // File input refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const selectedConversation = useMemo(() => 
    conversations.find((c) => c.id === selectedConversationId),
    [conversations, selectedConversationId]
  );

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, created_at, is_from_me, sender_type, ai_generated")
        .eq("conversation_id", selectedConversationId)
        .order("created_at", { ascending: true });
      
      if (!error && data) {
        setMessages(data);
      }
      setMessagesLoading(false);
    };

    loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages-${selectedConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversationId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId]);

  // Map conversations for display
  const mappedConversations = useMemo(() => {
    return conversations.map(conv => ({
      id: conv.id,
      name: conv.contact_name || conv.contact_phone || "Sem nome",
      phone: conv.contact_phone || "",
      lastMessage: conv.last_message?.content || "Sem mensagens",
      time: conv.last_message_at 
        ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: ptBR })
        : "---",
      unread: 0, // TODO: Implement unread count
      handler: conv.current_handler as 'ai' | 'human',
      status: conv.status,
      tags: conv.tags || [],
      assignedTo: conv.assigned_profile?.full_name || null,
      whatsappInstance: conv.whatsapp_instance?.instance_name || null,
    }));
  }, [conversations]);

  // Filter conversations by tab and filters
  const filteredConversations = useMemo(() => {
    return mappedConversations.filter((conv) => {
      // Search filter (name or phone)
      const matchesSearch = searchQuery === '' || 
        conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.phone.includes(searchQuery);
      
      if (!matchesSearch) return false;

      // Handler filter
      if (conversationFilters.handlers.length > 0) {
        if (!conversationFilters.handlers.includes(conv.handler)) {
          return false;
        }
      }

      // Tags filter
      if (conversationFilters.tags.length > 0) {
        const hasMatchingTag = conv.tags.some(t => conversationFilters.tags.includes(t));
        if (!hasMatchingTag) return false;
      }

      // Tab filter
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
  }, [mappedConversations, conversationFilters, searchQuery, activeTab]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversationId || !selectedConversation || isSending) return;
    
    const messageToSend = messageInput.trim();
    setMessageInput(""); // Clear input immediately for better UX
    setIsSending(true);
    
    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_message",
          conversationId: selectedConversationId,
          message: messageToSend,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar mensagem");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar mensagem");
      }

      // Optimistically add message to local state
      const newMessage: Message = {
        id: response.data.messageId || crypto.randomUUID(),
        content: messageToSend,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
      };
      
      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setMessageInput(messageToSend); // Restore message on error
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMedia = async (file: File, mediaType: "image" | "audio" | "video" | "document") => {
    if (!selectedConversationId || !selectedConversation || isSending) return;
    
    setIsSending(true);
    
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      
      const mediaBase64 = await base64Promise;

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId: selectedConversationId,
          mediaType,
          mediaBase64,
          fileName: file.name,
          caption: "",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar mídia");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar mídia");
      }

      // Optimistically add message to local state
      const newMessage: Message = {
        id: response.data.messageId || crypto.randomUUID(),
        content: `[${mediaType === "image" ? "Imagem" : mediaType === "audio" ? "Áudio" : mediaType === "video" ? "Vídeo" : "Documento"}: ${file.name}]`,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      toast({
        title: "Mídia enviada",
        description: `${file.name} enviado com sucesso!`,
      });
    } catch (error) {
      console.error("Erro ao enviar mídia:", error);
      toast({
        title: "Erro ao enviar mídia",
        description: error instanceof Error ? error.message : "Falha ao enviar mídia",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, mediaType: "image" | "audio" | "document") => {
    const file = event.target.files?.[0];
    if (file) {
      handleSendMedia(file, mediaType);
    }
    // Reset input so the same file can be selected again
    event.target.value = "";
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setShowMobileChat(true);
  };

  const handleUpdateName = async () => {
    if (selectedConversation && editingName.trim()) {
      updateConversation.mutate({
        id: selectedConversation.id,
        contact_name: editingName,
      });
      setEditNameDialogOpen(false);
    }
  };

  const handleTransferHandler = (handler: "ai" | "human") => {
    if (selectedConversation) {
      transferHandler.mutate({
        conversationId: selectedConversation.id,
        handlerType: handler,
      });
    }
  };

  const getTabCount = (tab: ConversationTab) => {
    switch (tab) {
      case "chat":
        return mappedConversations.filter(c => c.handler === "human" && c.assignedTo).length;
      case "ai":
        return mappedConversations.filter(c => c.handler === "ai").length;
      case "queue":
        return mappedConversations.length;
    }
  };

  const openEditName = () => {
    if (selectedConversation) {
      setEditingName(selectedConversation.contact_name || "");
      setEditNameDialogOpen(true);
    }
  };

  // Get available statuses for filters
  const availableStatuses = useMemo(() => {
    return statuses.map(s => ({ id: s.id, name: s.name, color: s.color }));
  }, [statuses]);

  // Get available tags for filters
  const availableTags = useMemo(() => {
    return tags.map(t => ({ id: t.id, name: t.name, color: t.color }));
  }, [tags]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

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

          <ConversationFilters
            filters={conversationFilters}
            onFiltersChange={setConversationFilters}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            availableStatuses={availableStatuses}
            availableTags={availableTags}
          />
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {conversations.length === 0 
                    ? "Nenhuma conversa ainda" 
                    : "Nenhuma conversa encontrada"
                  }
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-all duration-200",
                    "hover:bg-muted",
                    selectedConversationId === conv.id && "bg-muted ring-1 ring-primary/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {conv.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
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
                              ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                              : "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20"
                          )}
                        >
                          {conv.handler === "ai" ? (
                            <Bot className="h-3 w-3 mr-1" />
                          ) : (
                            <UserCheck className="h-3 w-3 mr-1" />
                          )}
                          {conv.handler === "ai" ? "IA" : conv.assignedTo || "Humano"}
                        </Badge>
                        {conv.status && (
                          <Badge variant="outline" className="text-xs">
                            {conv.status.replace('_', ' ')}
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
        {selectedConversation ? (
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
                    {(selectedConversation.contact_name || selectedConversation.contact_phone || "?")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {selectedConversation.contact_name || selectedConversation.contact_phone || "Sem nome"}
                    </p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openEditName}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedConversation.contact_phone || "---"}
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
                          variant={selectedConversation.current_handler === "ai" ? "default" : "outline"}
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => handleTransferHandler("ai")}
                        >
                          <Bot className="h-4 w-4 mr-2" />
                          IA
                        </Button>
                        <Button 
                          variant={selectedConversation.current_handler === "human" ? "default" : "outline"}
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => handleTransferHandler("human")}
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Humano
                        </Button>
                      </div>
                      {departments.length > 0 && (
                        <div className="pt-2 border-t">
                          <h5 className="text-xs text-muted-foreground mb-2">Departamento</h5>
                          {departments.map(dept => (
                            <Button
                              key={dept.id}
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start mb-1"
                            >
                              <Folder className="h-4 w-4 mr-2" style={{ color: dept.color }} />
                              {dept.name}
                            </Button>
                          ))}
                        </div>
                      )}
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
                    selectedConversation.current_handler === "ai"
                      ? "border-purple-500 text-purple-600"
                      : "border-green-500 text-green-600"
                  )}
                >
                  {selectedConversation.current_handler === "ai" ? "🤖 IA" : "⚖️ Advogado"}
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
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.is_from_me ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-2.5",
                          msg.is_from_me
                            ? msg.ai_generated
                              ? "bg-purple-100 text-foreground rounded-br-md dark:bg-purple-900/30"
                              : "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        )}
                      >
                        {msg.ai_generated && msg.is_from_me && (
                          <div className="flex items-center gap-1 text-xs text-purple-600 mb-1 dark:text-purple-400">
                            <Bot className="h-3 w-3" />
                            Assistente IA
                          </div>
                        )}
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            msg.is_from_me ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}
                        >
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card">
              {/* Hidden file inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e, "image")}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                className="hidden"
                onChange={(e) => handleFileSelect(e, "document")}
              />
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e, "audio")}
              />
              
              <div className="max-w-3xl mx-auto flex items-end gap-2">
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground"
                    onClick={() => documentInputRef.current?.click()}
                    disabled={isSending}
                    title="Enviar documento"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isSending}
                    title="Enviar imagem"
                  >
                    <Image className="h-5 w-5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={isSending}
                    title="Enviar áudio"
                  >
                    <FileText className="h-5 w-5" />
                  </Button>
                </div>
                <Textarea
                  placeholder={isSending ? "Enviando..." : "Digite sua mensagem..."}
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  disabled={isSending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={isSending}
                    title="Gravar áudio"
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                  <Button 
                    size="icon" 
                    onClick={handleSendMessage}
                    disabled={isSending || !messageInput.trim()}
                  >
                    {isSending ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
