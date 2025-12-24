import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Bot, User, Clock, MessageSquare, Phone, Mail, 
  Tag, Wifi, Send, Mic, Paperclip, FileSignature,
  Edit2, Check, X, RefreshCw, Folder, Zap, MicOff
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  content: string;
  isFromMe: boolean;
  createdAt: Date;
  senderType: 'ai' | 'human' | 'client';
  senderName: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'image' | 'file';
}

interface ClientDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    created_at: string;
  } | null;
  status?: { name: string; color: string };
  tags?: Array<{ id: string; name: string; color: string }>;
  departments?: Array<{ id: string; name: string; color: string }>;
  currentDepartmentId?: string | null;
  mockData?: {
    lastMessage: string;
    connection: string;
    handler: 'ai' | 'human';
    handlerName: string;
    arrivedAt: Date;
  };
  onUpdateName?: (clientId: string, newName: string) => void;
  onTransferHandler?: (clientId: string, handlerType: 'ai' | 'human', handlerName: string) => void;
  onTransferDepartment?: (clientId: string, departmentId: string | null) => void;
}

// Mock handlers for transfer
const availableHandlers = {
  ai: [
    { id: 'ai-1', name: 'Assistente Jurídico', description: 'IA para triagem inicial' },
    { id: 'ai-2', name: 'IA Triagem', description: 'IA para classificação' },
    { id: 'ai-3', name: 'IA Documentos', description: 'IA para análise de docs' },
  ],
  human: [
    { id: 'human-1', name: 'Dr. Carlos Silva', role: 'Advogado' },
    { id: 'human-2', name: 'Dra. Ana Costa', role: 'Advogada' },
    { id: 'human-3', name: 'João Atendente', role: 'Atendente' },
    { id: 'human-4', name: 'Maria Santos', role: 'Estagiária' },
  ]
};

// Generate WhatsApp profile picture URL (mock using UI Avatars)
const getWhatsAppProfilePic = (name: string, phone: string) => {
  // In a real implementation, this would fetch from WhatsApp API
  // Using a deterministic avatar based on phone number
  const colors = ['0D8ABC', '7E57C2', '43A047', 'E53935', 'FB8C00', '00897B'];
  const colorIndex = parseInt(phone.slice(-2), 10) % colors.length;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIndex]}&color=fff&size=128`;
};

// Mock conversation messages
const generateMockMessages = (clientName: string): Message[] => {
  const now = new Date();
  return [
    {
      id: '1',
      content: 'Olá! Bem-vindo ao nosso escritório. Como posso ajudá-lo hoje?',
      isFromMe: true,
      createdAt: new Date(now.getTime() - 3600000 * 5),
      senderType: 'ai',
      senderName: 'Assistente IA'
    },
    {
      id: '2',
      content: 'Olá, preciso de ajuda com um processo trabalhista. Fui demitido sem justa causa.',
      isFromMe: false,
      createdAt: new Date(now.getTime() - 3600000 * 4.5),
      senderType: 'client',
      senderName: clientName
    },
    {
      id: '3',
      content: 'Entendo sua situação. Para analisarmos seu caso, precisamos de alguns documentos. Você tem a carteira de trabalho e o termo de rescisão?',
      isFromMe: true,
      createdAt: new Date(now.getTime() - 3600000 * 4),
      senderType: 'ai',
      senderName: 'Assistente IA'
    },
    {
      id: '4',
      content: 'Tenho sim, posso enviar agora?',
      isFromMe: false,
      createdAt: new Date(now.getTime() - 3600000 * 3.5),
      senderType: 'client',
      senderName: clientName
    },
    {
      id: '5',
      content: 'Vou transferir você para um de nossos advogados especialistas para dar continuidade ao atendimento.',
      isFromMe: true,
      createdAt: new Date(now.getTime() - 3600000 * 3),
      senderType: 'ai',
      senderName: 'Assistente IA'
    },
    {
      id: '6',
      content: 'Olá! Sou o Dr. Carlos, vou analisar seu caso. Por favor, envie os documentos mencionados.',
      isFromMe: true,
      createdAt: new Date(now.getTime() - 3600000 * 2),
      senderType: 'human',
      senderName: 'Dr. Carlos'
    },
  ];
};

export function ClientDetailSheet({ 
  open, 
  onOpenChange, 
  client, 
  status,
  tags = [],
  departments = [],
  currentDepartmentId,
  mockData,
  onUpdateName,
  onTransferHandler,
  onTransferDepartment
}: ClientDetailSheetProps) {
  const [newMessage, setNewMessage] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [transferPopoverOpen, setTransferPopoverOpen] = useState(false);
  const [deptPopoverOpen, setDeptPopoverOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPunctualIntervention, setIsPunctualIntervention] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  if (!client) return null;
  
  const messages = generateMockMessages(client.name);
  const lastFourDigits = client.phone.slice(-4);
  const profilePicUrl = getWhatsAppProfilePic(client.name, client.phone);
  
  const handleStartEditName = () => {
    setEditedName(client.name);
    setIsEditingName(true);
  };
  
  const handleSaveName = () => {
    if (editedName.trim() && onUpdateName) {
      onUpdateName(client.id, editedName.trim());
      toast.success('Nome atualizado com sucesso');
    }
    setIsEditingName(false);
  };
  
  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName('');
  };
  
  const handleTransfer = (type: 'ai' | 'human', handler: { id: string; name: string }) => {
    if (onTransferHandler) {
      onTransferHandler(client.id, type, handler.name);
    }
    toast.success(`Transferido para ${handler.name}`);
    setTransferPopoverOpen(false);
  };

  const handleTransferDept = (deptId: string | null) => {
    if (onTransferDepartment) {
      onTransferDepartment(client.id, deptId);
    }
    const deptName = deptId ? departments.find(d => d.id === deptId)?.name : 'Sem departamento';
    toast.success(`Movido para ${deptName}`);
    setDeptPopoverOpen(false);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    
    setIsSending(true);
    try {
      // If not punctual intervention and current handler is AI, transfer to human
      if (!isPunctualIntervention && mockData?.handler === 'ai' && onTransferHandler) {
        onTransferHandler(client.id, 'human', 'Você');
        toast.info('Atendimento transferido para você');
      }
      
      // In real implementation, send message via WhatsApp API
      toast.success(isPunctualIntervention ? 'Intervenção pontual enviada' : 'Mensagem enviada');
      setNewMessage('');
    } catch (error) {
      toast.error('Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleSendAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      toast.info('Gravando áudio...');
    } catch (error) {
      toast.error('Erro ao acessar microfone');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSendAudio = async (audioBlob: Blob) => {
    setIsSending(true);
    try {
      const fileName = `audio_${Date.now()}.webm`;
      const { error } = await supabase.storage
        .from('chat-media')
        .upload(`${client.id}/${fileName}`, audioBlob);
      
      if (error) throw error;
      
      if (!isPunctualIntervention && mockData?.handler === 'ai' && onTransferHandler) {
        onTransferHandler(client.id, 'human', 'Você');
      }
      
      toast.success('Áudio enviado');
    } catch (error) {
      toast.error('Erro ao enviar áudio');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsSending(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('chat-media')
        .upload(`${client.id}/${fileName}`, file);
      
      if (error) throw error;
      
      if (!isPunctualIntervention && mockData?.handler === 'ai' && onTransferHandler) {
        onTransferHandler(client.id, 'human', 'Você');
      }
      
      toast.success('Arquivo enviado');
    } catch (error) {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setIsSending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInsertSignature = () => {
    setNewMessage(prev => prev + '\n\n---\nAtenciosamente,\nEquipe Jurídica');
    toast.info('Assinatura inserida');
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-start gap-3">
            {/* WhatsApp Profile Picture */}
            <Avatar className="h-14 w-14 border-2 border-primary/20">
              <AvatarImage src={profilePicUrl} alt={client.name} />
              <AvatarFallback className="text-lg">{client.name.charAt(0)}</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 text-lg font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') handleCancelEditName();
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEditName}>
                    <X className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-xl truncate">{client.name}</SheetTitle>
                  <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={handleStartEditName}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                <Phone className="h-3.5 w-3.5" />
                <span>•••• {lastFourDigits}</span>
                {client.email && (
                  <>
                    <span className="mx-1">•</span>
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{client.email}</span>
                  </>
                )}
              </div>
            </div>
            
            {status && (
              <Badge style={{ backgroundColor: status.color, color: '#fff' }}>
                {status.name}
              </Badge>
            )}
          </div>
          
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map(tag => (
                <Badge 
                  key={tag.id} 
                  variant="outline" 
                  className="text-xs"
                  style={{ borderColor: tag.color, color: tag.color }}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
          
          {/* Info cards */}
          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <Clock className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-1">Chegou</p>
              <p className="text-xs font-medium">
                {mockData ? formatDistanceToNow(mockData.arrivedAt, { locale: ptBR }) : '—'}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <Wifi className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-1">Conexão</p>
              <p className="text-xs font-medium truncate">
                {mockData?.connection.replace('WhatsApp ', '') || '—'}
              </p>
            </div>
            
            {/* Handler Transfer */}
            <Popover open={transferPopoverOpen} onOpenChange={setTransferPopoverOpen}>
              <PopoverTrigger asChild>
                <div className="bg-muted/50 rounded-lg p-2 text-center cursor-pointer hover:bg-muted transition-colors">
                  {mockData?.handler === 'ai' ? (
                    <Bot className="h-4 w-4 mx-auto text-purple-500" />
                  ) : (
                    <User className="h-4 w-4 mx-auto text-green-500" />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Atendente</p>
                  <p className="text-xs font-medium truncate">
                    {mockData?.handlerName?.split(' ')[0] || '—'}
                  </p>
                  <RefreshCw className="h-3 w-3 mx-auto mt-1 text-muted-foreground" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Buscar atendente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum atendente encontrado.</CommandEmpty>
                    <CommandGroup heading="Transferir para IA">
                      {availableHandlers.ai.map((handler) => (
                        <CommandItem
                          key={handler.id}
                          onSelect={() => handleTransfer('ai', handler)}
                          className="flex items-center gap-2"
                        >
                          <Bot className="h-4 w-4 text-purple-500" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{handler.name}</p>
                            <p className="text-xs text-muted-foreground">{handler.description}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup heading="Transferir para Humano">
                      {availableHandlers.human.map((handler) => (
                        <CommandItem
                          key={handler.id}
                          onSelect={() => handleTransfer('human', handler)}
                          className="flex items-center gap-2"
                        >
                          <User className="h-4 w-4 text-green-500" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{handler.name}</p>
                            <p className="text-xs text-muted-foreground">{handler.role}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Department Transfer */}
            <Popover open={deptPopoverOpen} onOpenChange={setDeptPopoverOpen}>
              <PopoverTrigger asChild>
                <div className="bg-muted/50 rounded-lg p-2 text-center cursor-pointer hover:bg-muted transition-colors">
                  <Folder className="h-4 w-4 mx-auto text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mt-1">Depto</p>
                  <p className="text-xs font-medium truncate">
                    {departments.find(d => d.id === currentDepartmentId)?.name?.slice(0, 8) || 'Nenhum'}
                  </p>
                  <RefreshCw className="h-3 w-3 mx-auto mt-1 text-muted-foreground" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Buscar departamento..." />
                  <CommandList>
                    <CommandEmpty>Nenhum departamento.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => handleTransferDept(null)}
                        className="flex items-center gap-2"
                      >
                        <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                        <span>Sem departamento</span>
                      </CommandItem>
                      {departments.map((dept) => (
                        <CommandItem
                          key={dept.id}
                          onSelect={() => handleTransferDept(dept.id)}
                          className="flex items-center gap-2"
                        >
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: dept.color }}
                          />
                          <span>{dept.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </SheetHeader>
        
        {/* Conversation */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Histórico de Conversa
            </h4>
            
            {/* Punctual Intervention Toggle */}
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <Label htmlFor="punctual" className="text-xs cursor-pointer">
                Intervenção pontual
              </Label>
              <Switch
                id="punctual"
                checked={isPunctualIntervention}
                onCheckedChange={setIsPunctualIntervention}
              />
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      msg.isFromMe 
                        ? msg.senderType === 'ai'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100'
                          : 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {msg.senderType === 'ai' && <Bot className="h-3 w-3" />}
                      {msg.senderType === 'human' && msg.isFromMe && <User className="h-3 w-3" />}
                      <span className="text-xs font-medium">{msg.senderName}</span>
                      <span className="text-xs opacity-60">
                        {format(msg.createdAt, 'HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          {/* Punctual intervention notice */}
          {isPunctualIntervention && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-y border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Modo intervenção: A IA continuará atendendo após sua mensagem
              </p>
            </div>
          )}
          
          {/* Message input with media buttons */}
          <div className="p-4 border-t space-y-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            />
            <div className="flex gap-2 items-center">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-9 w-9 flex-shrink-0"
                onClick={handleInsertSignature}
                title="Inserir assinatura"
                disabled={isSending}
              >
                <FileSignature className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-9 w-9 flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                title="Enviar arquivo"
                disabled={isSending}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant={isRecording ? "destructive" : "ghost"}
                className="h-9 w-9 flex-shrink-0"
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                title={isRecording ? "Parar gravação" : "Gravar áudio"}
                disabled={isSending}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Input 
                placeholder={isPunctualIntervention ? "Intervenção pontual..." : "Digite uma mensagem..."}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1"
                disabled={isSending || isRecording}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button size="icon" onClick={handleSendMessage} disabled={isSending || isRecording || !newMessage.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}