import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Phone, 
  Mail, 
  MapPin, 
  Tag, 
  Folder, 
  User, 
  Bot,
  Clock,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  Pencil,
  ArrowRightLeft,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ContactDetailsPanelProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    current_handler: 'ai' | 'human';
    department_id: string | null;
    tags: string[] | null;
    created_at: string;
    last_message_at: string | null;
    client?: {
      email?: string | null;
      address?: string | null;
      document?: string | null;
      notes?: string | null;
    } | null;
    assigned_profile?: { full_name: string } | null;
    whatsapp_instance?: { instance_name: string; phone_number?: string | null } | null;
  } | null;
  departments: Array<{ id: string; name: string; color: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: string; full_name: string }>;
  onClose: () => void;
  onEditName: () => void;
  onTransferHandler: (handler: 'ai' | 'human') => void;
  onChangeDepartment: (deptId: string | null) => void;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ContactDetailsPanel({
  conversation,
  departments,
  tags,
  members,
  onClose,
  onEditName,
  onTransferHandler,
  onChangeDepartment,
}: ContactDetailsPanelProps) {
  const [infoOpen, setInfoOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Selecione uma conversa</p>
      </div>
    );
  }

  const currentDepartment = departments.find(d => d.id === conversation.department_id);
  const conversationTags = (conversation.tags || [])
    .map(tagName => tags.find(t => t.name === tagName || t.id === tagName))
    .filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">Detalhes do Contato</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Contact Card */}
          <div className="text-center space-y-3">
            <Avatar className="h-16 w-16 mx-auto">
              <AvatarImage 
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${conversation.contact_name || conversation.contact_phone}`} 
              />
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                {getInitials(conversation.contact_name)}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <div className="flex items-center justify-center gap-1">
                <h4 className="font-semibold">
                  {conversation.contact_name || conversation.contact_phone || "Sem nome"}
                </h4>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={onEditName}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                {conversation.contact_phone || "---"}
              </p>
            </div>

            {/* Handler Badge */}
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                conversation.current_handler === "ai"
                  ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                  : "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20"
              )}
            >
              {conversation.current_handler === "ai" ? (
                <Bot className="h-3 w-3 mr-1" />
              ) : (
                <User className="h-3 w-3 mr-1" />
              )}
              {conversation.current_handler === "ai" 
                ? "Atendimento IA" 
                : `${conversation.assigned_profile?.full_name || 'Humano'}`
              }
            </Badge>
          </div>

          <Separator />

          {/* Info Section */}
          <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between h-9 px-2"
              >
                <span className="text-sm font-medium">Informações</span>
                {infoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {conversation.client?.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{conversation.client.email}</span>
                </div>
              )}
              
              {conversation.client?.address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{conversation.client.address}</span>
                </div>
              )}
              
              {conversation.client?.document && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{conversation.client.document}</span>
                </div>
              )}
              
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  Criado {formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
              
              {conversation.last_message_at && (
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Última msg {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              )}

              {conversation.whatsapp_instance && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {conversation.whatsapp_instance.instance_name}
                    {conversation.whatsapp_instance.phone_number && (
                      <span className="text-muted-foreground ml-1">
                        ({conversation.whatsapp_instance.phone_number.slice(-4)})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Actions Section */}
          <Collapsible open={actionsOpen} onOpenChange={setActionsOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between h-9 px-2"
              >
                <span className="text-sm font-medium">Ações</span>
                {actionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {/* Department */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Folder className="h-3 w-3" />
                  Departamento
                </label>
                <Select 
                  value={conversation.department_id || "none"} 
                  onValueChange={(v) => onChangeDepartment(v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem departamento</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: dept.color }} 
                          />
                          {dept.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transfer Handler */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowRightLeft className="h-3 w-3" />
                  Transferir atendimento
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={conversation.current_handler === "ai" ? "secondary" : "outline"}
                    size="sm"
                    className="flex-1 h-9"
                    onClick={() => onTransferHandler("ai")}
                    disabled={conversation.current_handler === "ai"}
                  >
                    <Bot className="h-4 w-4 mr-1" />
                    IA
                  </Button>
                  <Button
                    variant={conversation.current_handler === "human" ? "secondary" : "outline"}
                    size="sm"
                    className="flex-1 h-9"
                    onClick={() => onTransferHandler("human")}
                    disabled={conversation.current_handler === "human"}
                  >
                    <User className="h-4 w-4 mr-1" />
                    Humano
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Tags Section */}
          <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between h-9 px-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Etiquetas</span>
                  {conversationTags.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {conversationTags.length}
                    </Badge>
                  )}
                </div>
                {tagsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {conversationTags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {conversationTags.map((tag, i) => (
                    <Badge 
                      key={i}
                      variant="outline"
                      className="text-xs"
                      style={{ 
                        borderColor: tag!.color, 
                        backgroundColor: `${tag!.color}20`,
                        color: tag!.color 
                      }}
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {tag!.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma etiqueta</p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Notes */}
          {conversation.client?.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Observações</h4>
                <p className="text-sm text-muted-foreground">{conversation.client.notes}</p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
