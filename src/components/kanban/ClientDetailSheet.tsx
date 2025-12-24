import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Bot, User, Clock, MessageSquare, Phone, Mail, MapPin, 
  FileText, Calendar, Tag, Wifi, Send
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface Message {
  id: string;
  content: string;
  isFromMe: boolean;
  createdAt: Date;
  senderType: 'ai' | 'human' | 'client';
  senderName: string;
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
  mockData?: {
    lastMessage: string;
    connection: string;
    handler: 'ai' | 'human';
    handlerName: string;
    arrivedAt: Date;
  };
}

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
  mockData 
}: ClientDetailSheetProps) {
  const [newMessage, setNewMessage] = useState('');
  
  if (!client) return null;
  
  const messages = generateMockMessages(client.name);
  const lastFourDigits = client.phone.slice(-4);
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-xl">{client.name}</SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>•••• {lastFourDigits}</span>
                {client.email && (
                  <>
                    <span className="mx-1">•</span>
                    <Mail className="h-3.5 w-3.5" />
                    <span>{client.email}</span>
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
          <div className="grid grid-cols-3 gap-2 mt-3">
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
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              {mockData?.handler === 'ai' ? (
                <Bot className="h-4 w-4 mx-auto text-purple-500" />
              ) : (
                <User className="h-4 w-4 mx-auto text-green-500" />
              )}
              <p className="text-xs text-muted-foreground mt-1">Atendente</p>
              <p className="text-xs font-medium truncate">
                {mockData?.handlerName || '—'}
              </p>
            </div>
          </div>
        </SheetHeader>
        
        {/* Conversation */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 bg-muted/30 border-b">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Histórico de Conversa
            </h4>
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
          
          {/* Message input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input 
                placeholder="Digite uma mensagem..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1"
              />
              <Button size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
