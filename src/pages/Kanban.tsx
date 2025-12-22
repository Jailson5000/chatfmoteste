import { useState } from "react";
import { 
  Plus, 
  MoreHorizontal, 
  User, 
  Clock, 
  Tag,
  GripVertical,
  Scale,
  Briefcase,
  FileText,
  AlertCircle,
  CheckCircle2,
  Bot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CaseStatus = 
  | "novo_contato" 
  | "triagem_ia" 
  | "aguardando_documentos" 
  | "em_analise" 
  | "em_andamento" 
  | "encerrado";

interface KanbanCard {
  id: string;
  title: string;
  client: string;
  legalArea: string;
  assignedTo: string | null;
  priority: number;
  tags: string[];
  createdAt: string;
  status: CaseStatus;
}

const columns: { id: CaseStatus; title: string; icon: React.ElementType; color: string }[] = [
  { id: "novo_contato", title: "Novo Contato", icon: User, color: "bg-muted" },
  { id: "triagem_ia", title: "Triagem IA", icon: Bot, color: "bg-status-ai/10" },
  { id: "aguardando_documentos", title: "Aguardando Docs", icon: FileText, color: "bg-warning/10" },
  { id: "em_analise", title: "Em Análise", icon: Scale, color: "bg-primary/10" },
  { id: "em_andamento", title: "Em Andamento", icon: Briefcase, color: "bg-accent/10" },
  { id: "encerrado", title: "Encerrado", icon: CheckCircle2, color: "bg-success/10" },
];

const mockCards: KanbanCard[] = [
  {
    id: "1",
    title: "Divórcio Consensual",
    client: "Maria Silva",
    legalArea: "Família",
    assignedTo: null,
    priority: 2,
    tags: ["urgente", "documentação"],
    createdAt: "2024-01-15",
    status: "triagem_ia",
  },
  {
    id: "2",
    title: "Rescisão Trabalhista",
    client: "João Santos",
    legalArea: "Trabalhista",
    assignedTo: "Dr. Carlos",
    priority: 1,
    tags: ["trabalhista"],
    createdAt: "2024-01-14",
    status: "em_andamento",
  },
  {
    id: "3",
    title: "Contrato de Locação",
    client: "Ana Costa",
    legalArea: "Civil",
    assignedTo: "Dra. Fernanda",
    priority: 0,
    tags: ["contrato"],
    createdAt: "2024-01-13",
    status: "aguardando_documentos",
  },
  {
    id: "4",
    title: "Defesa do Consumidor",
    client: "Pedro Oliveira",
    legalArea: "Consumidor",
    assignedTo: null,
    priority: 1,
    tags: ["consumidor"],
    createdAt: "2024-01-12",
    status: "novo_contato",
  },
  {
    id: "5",
    title: "Inventário",
    client: "Família Rodrigues",
    legalArea: "Família",
    assignedTo: "Dr. Roberto",
    priority: 2,
    tags: ["inventário", "urgente"],
    createdAt: "2024-01-10",
    status: "em_analise",
  },
  {
    id: "6",
    title: "Revisão Contratual",
    client: "Empresa XYZ",
    legalArea: "Empresarial",
    assignedTo: "Dra. Fernanda",
    priority: 0,
    tags: ["empresarial"],
    createdAt: "2024-01-08",
    status: "encerrado",
  },
];

const priorityColors = {
  0: "bg-muted text-muted-foreground",
  1: "bg-warning/20 text-warning",
  2: "bg-destructive/20 text-destructive",
};

const legalAreaColors: Record<string, string> = {
  "Família": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "Trabalhista": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Civil": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Consumidor": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Empresarial": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function Kanban() {
  const [cards, setCards] = useState<KanbanCard[]>(mockCards);
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null);

  const handleDragStart = (card: KanbanCard) => {
    setDraggedCard(card);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (status: CaseStatus) => {
    if (draggedCard) {
      setCards((prev) =>
        prev.map((card) =>
          card.id === draggedCard.id ? { ...card, status } : card
        )
      );
      setDraggedCard(null);
    }
  };

  const getCardsByStatus = (status: CaseStatus) =>
    cards.filter((card) => card.status === status);

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Kanban Jurídico</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie seus casos de forma visual
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Caso
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <ScrollArea className="flex-1 p-6">
        <div className="flex gap-4 min-w-max pb-4">
          {columns.map((column) => {
            const columnCards = getCardsByStatus(column.id);
            return (
              <div
                key={column.id}
                className="w-80 flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column.id)}
              >
                <div className={cn("rounded-xl p-4", column.color)}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <column.icon className="h-5 w-5 text-foreground/70" />
                      <h3 className="font-semibold">{column.title}</h3>
                      <Badge variant="secondary" className="ml-1">
                        {columnCards.length}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {columnCards.map((card) => (
                      <Card
                        key={card.id}
                        className={cn(
                          "cursor-grab active:cursor-grabbing transition-all duration-200",
                          "hover:shadow-lg hover:-translate-y-0.5",
                          draggedCard?.id === card.id && "opacity-50 scale-95"
                        )}
                        draggable
                        onDragStart={() => handleDragStart(card)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  legalAreaColors[card.legalArea] || "bg-muted"
                                )}
                              >
                                {card.legalArea}
                              </Badge>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>Editar</DropdownMenuItem>
                                <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">
                                  Arquivar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <h4 className="font-medium mt-3">{card.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {card.client}
                          </p>

                          <div className="flex flex-wrap gap-1 mt-3">
                            {card.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-xs"
                              >
                                <Tag className="h-3 w-3 mr-1" />
                                {tag}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                            <div className="flex items-center gap-2">
                              {card.assignedTo ? (
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-xs font-medium text-primary">
                                    {card.assignedTo.charAt(0)}
                                  </span>
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                </div>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {card.assignedTo || "Não atribuído"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {card.priority > 0 && (
                                <Badge
                                  className={cn(
                                    "h-5 text-xs",
                                    priorityColors[card.priority as keyof typeof priorityColors]
                                  )}
                                >
                                  {card.priority === 2 ? (
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                  ) : null}
                                  P{card.priority}
                                </Badge>
                              )}
                              <div className="flex items-center text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 mr-1" />
                                {new Date(card.createdAt).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
