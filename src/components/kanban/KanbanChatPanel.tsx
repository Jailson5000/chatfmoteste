import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useConversations } from "@/hooks/useConversations";

import { cn } from "@/lib/utils";
import { 
  Send, 
  X, 
  Loader2, 
  CheckCheck, 
  Check, 
  Bot, 
  User,
  Archive,
  Maximize2,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
  Plus,
  Zap,
  Lock,
  Sparkles,
  Paperclip
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { AudioRecorder } from "@/components/conversations/AudioRecorder";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Message {
  id: string;
  content: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_type: string;
  ai_generated: boolean;
  status?: string;
  is_internal?: boolean;
  message_type?: string;
  media_url?: string | null;
}

interface KanbanChatPanelProps {
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  currentHandler: 'ai' | 'human';
  assignedProfile?: { full_name: string } | null;
  onClose: () => void;
}

export function KanbanChatPanel({
  conversationId,
  contactName,
  contactPhone,
  currentHandler,
  assignedProfile,
  onClose,
}: KanbanChatPanelProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { transferHandler, updateConversation } = useConversations();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPontualMode, setIsPontualMode] = useState(false);
  const [isInternalMode, setIsInternalMode] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        toast({
          title: "Erro ao carregar mensagens",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setMessages(data || []);
      }
      setIsLoading(false);
    };

    fetchMessages();

    // Real-time subscription
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new as Message]);
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, toast]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read
  useEffect(() => {
    const markAsRead = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        await supabase.rpc("mark_messages_as_read", {
          _conversation_id: conversationId,
          _user_id: userData.user.id,
        });
      }
    };
    markAsRead();
  }, [conversationId]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || isSending) return;

    const wasPontualMode = isPontualMode;
    const wasInternalMode = isInternalMode;
    const messageToSend = messageInput.trim();
    setMessageInput("");
    setIsSending(true);
    setIsPontualMode(false);

    // Optimistic update
    const tempId = crypto.randomUUID();
    const newMessage: Message = {
      id: tempId,
      content: messageToSend,
      created_at: new Date().toISOString(),
      is_from_me: true,
      sender_type: "human",
      ai_generated: false,
      status: wasInternalMode ? "sent" : "sending",
      is_internal: wasInternalMode,
    };
    setMessages((prev) => [...prev, newMessage]);

    try {
      if (wasInternalMode) {
        // Internal message - save directly to database
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: messageToSend,
          is_from_me: true,
          sender_type: "human",
          ai_generated: false,
          is_internal: true,
          status: "sent",
          message_type: "text",
          sender_id: userData.user?.id,
        });
        
        if (error) throw error;
        
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
      } else {
        // External message - send via WhatsApp
        if (!wasPontualMode && currentHandler === "ai") {
          await transferHandler.mutateAsync({
            conversationId,
            handlerType: "human",
          });
        }

        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_message_async",
            conversationId,
            message: messageToSend,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || "Falha ao enviar mensagem");
        }

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Falha ao enviar mensagem");
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, id: response.data.messageId || tempId, status: "sent" }
              : m
          )
        );
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
      );
      setMessageInput(messageToSend);
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAudio = async (audioBlob: Blob) => {
    setIsSending(true);
    try {
      const fileName = `audio_${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(`${conversationId}/${fileName}`, audioBlob);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(`${conversationId}/${fileName}`);
      
      // Transfer to human if AI is handling and not pontual mode
      if (!isPontualMode && currentHandler === "ai") {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
        });
      }
      
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId,
          mediaUrl: urlData.publicUrl,
          mediaType: "audio",
        },
      });
      
      if (response.error) throw response.error;
      
      toast({ title: "Áudio enviado" });
      setIsRecordingAudio(false);
    } catch (error) {
      console.error("Erro ao enviar áudio:", error);
      toast({
        title: "Erro ao enviar áudio",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mediaType: "image" | "document"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(`${conversationId}/${fileName}`, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(`${conversationId}/${fileName}`);
      
      // Transfer to human if AI is handling and not pontual mode
      if (!isPontualMode && currentHandler === "ai") {
        await transferHandler.mutateAsync({
          conversationId,
          handlerType: "human",
        });
      }
      
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId,
          mediaUrl: urlData.publicUrl,
          mediaType: mediaType === "image" ? "image" : "document",
          fileName: file.name,
        },
      });
      
      if (response.error) throw response.error;
      
      toast({ title: `${mediaType === "image" ? "Imagem" : "Documento"} enviado` });
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);
      toast({
        title: "Erro ao enviar arquivo",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      if (event.target) event.target.value = "";
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const response = await supabase.functions.invoke("generate-summary", {
        body: { conversationId },
      });
      
      if (response.error) throw response.error;
      
      toast({ title: "Resumo gerado com sucesso" });
    } catch (error) {
      console.error("Erro ao gerar resumo:", error);
      toast({
        title: "Erro ao gerar resumo",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleArchive = async () => {
    try {
      await updateConversation.mutateAsync({
        id: conversationId,
        status: "archived" as any,
      });
      toast({ title: "Conversa arquivada" });
      onClose();
    } catch (error) {
      toast({
        title: "Erro ao arquivar",
        variant: "destructive",
      });
    }
  };

  const handleExpand = () => {
    // Navigate to Conversations page with this specific conversation ID
    navigate(`/conversations?id=${conversationId}`);
    onClose();
  };

  const getMessageIcon = (type?: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      case "audio":
        return <Mic className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "document":
        return <FileText className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const formatTime = (dateStr: string) => {
    return format(new Date(dateStr), "HH:mm dd/MM", { locale: ptBR });
  };

  const renderStatusIcon = (status?: string, isFromMe?: boolean) => {
    if (!isFromMe) return null;
    switch (status) {
      case "sending":
        return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
      case "sent":
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case "read":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case "error":
        return <X className="h-3 w-3 text-destructive" />;
      default:
        return <Check className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - Single header with close button */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${contactName || contactPhone}`}
            />
            <AvatarFallback>
              {contactName?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">{contactName || contactPhone}</h3>
            <p className="text-xs text-muted-foreground">{contactPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleArchive}
            title="Arquivar"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleExpand}
            title="Expandir conversa"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isFromMe = msg.is_from_me;
              const isInternal = msg.is_internal;
              const isAI = msg.ai_generated;
              const msgIcon = getMessageIcon(msg.message_type);

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    isFromMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      isInternal
                        ? "bg-warning/20 text-warning-foreground border border-warning/30"
                        : isFromMe
                        ? isAI
                          ? "bg-purple-500/20 text-foreground"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {/* Sender indicator */}
                    {isFromMe && (
                      <div className="flex items-center gap-1 text-xs opacity-70 mb-1">
                        {isInternal ? (
                          <>
                            <Lock className="h-3 w-3" />
                            <span>Interno</span>
                          </>
                        ) : isAI ? (
                          <>
                            <Bot className="h-3 w-3" />
                            <span>IA</span>
                          </>
                        ) : (
                          <>
                            <User className="h-3 w-3" />
                            <span>{assignedProfile?.full_name?.split(" ")[0] || "Você"}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Media icon */}
                    {msgIcon && (
                      <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                        {msgIcon}
                        <span className="text-xs capitalize">{msg.message_type}</span>
                      </div>
                    )}

                    {/* Content */}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                    {/* Time and status */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-xs opacity-70">{formatTime(msg.created_at)}</span>
                      {renderStatusIcon(msg.status, isFromMe)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

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

      {/* Input Area */}
      <div className={cn(
        "p-4 border-t border-border space-y-3",
        isPontualMode && "border-t-2 border-t-amber-500",
        isInternalMode && "border-t-2 border-t-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10"
      )}>
        {/* Pontual Mode Indicator */}
        {isPontualMode && (
          <div className="w-full flex items-center justify-between bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-md text-sm">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Intervenção pontual ativa
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setIsPontualMode(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* Internal Mode Indicator */}
        {isInternalMode && (
          <div className="w-full flex items-center justify-between bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-md text-sm">
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Mensagem interna (não vai para o cliente)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setIsInternalMode(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* Audio Recorder */}
        {isRecordingAudio ? (
          <AudioRecorder
            onSend={handleSendAudio}
            onCancel={() => setIsRecordingAudio(false)}
            disabled={isSending}
          />
        ) : (
          <>
            {/* Action buttons row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* Plus menu */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="start">
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => imageInputRef.current?.click()}
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Enviar imagem
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => documentInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4 mr-2" />
                        Enviar documento
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary}
                      >
                        {isGeneratingSummary ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Gerar resumo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start",
                          isInternalMode && "bg-yellow-100 dark:bg-yellow-900/30"
                        )}
                        onClick={() => setIsInternalMode(!isInternalMode)}
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Mensagem interna
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Audio button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsRecordingAudio(true)}
                  disabled={isInternalMode}
                >
                  <Mic className="h-4 w-4" />
                </Button>

                {/* Pontual intervention button - only when AI is handling */}
                {currentHandler === "ai" && !isInternalMode && (
                  <Button
                    variant={isPontualMode ? "default" : "ghost"}
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      isPontualMode 
                        ? "bg-amber-500 hover:bg-amber-600 text-white" 
                        : "text-muted-foreground hover:text-amber-500"
                    )}
                    onClick={() => setIsPontualMode(!isPontualMode)}
                    title="Intervenção pontual"
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {contactPhone?.slice(-4) || "----"}
              </div>
            </div>

            {/* Message input */}
            <div className="flex gap-2">
              <Textarea
                placeholder={isInternalMode ? "Mensagem interna..." : "Digite sua mensagem..."}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className={cn(
                  "min-h-[60px] resize-none",
                  isInternalMode && "border-yellow-400"
                )}
                disabled={isSending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!messageInput.trim() || isSending}
                className="h-auto"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}

        {/* Handler info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            {currentHandler === "ai" ? (
              <>
                <Bot className="h-3 w-3 text-purple-500" />
                <span>Atendimento com IA</span>
              </>
            ) : (
              <>
                <User className="h-3 w-3 text-success" />
                <span>{assignedProfile?.full_name || "Atendimento humano"}</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              transferHandler.mutate({
                conversationId,
                handlerType: currentHandler === "ai" ? "human" : "ai",
              });
            }}
          >
            {currentHandler === "ai" ? "Assumir atendimento" : "Devolver para IA"}
          </Button>
        </div>
      </div>
    </div>
  );
}
