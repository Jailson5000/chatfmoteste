import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Building2, 
  Tag, 
  Users, 
  Clock, 
  MessageSquare, 
  ArrowLeft,
  Globe,
  Wrench,
  Calendar,
  ChevronRight,
  CheckCircle2,
  Volume2,
  VolumeX,
  Calculator,
  BookOpen,
  FileText,
} from "lucide-react";

// Types
interface MentionCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  items: MentionItem[];
}

interface MentionItem {
  key: string;
  label: string;
  description?: string;
}

interface MentionPickerProps {
  departments: { id: string; name: string; color: string }[];
  statuses: { id: string; name: string; color: string }[];
  tags: { id: string; name: string; color: string }[];
  templates: { id: string; name: string }[];
  teamMembers?: { id: string; full_name: string }[];
  lawFirm?: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    facebook?: string;
    website?: string;
    business_hours?: unknown;
  };
  onSelect: (mention: string) => void;
  filter: string;
}

export function MentionPicker({
  departments,
  statuses,
  tags,
  templates,
  teamMembers,
  lawFirm,
  onSelect,
  filter,
}: MentionPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Build categories with items
  const categories = useMemo((): MentionCategory[] => {
    const cats: MentionCategory[] = [];

    // Departamento - always show
    cats.push({
      id: "departamento",
      label: "Departamento",
      icon: Building2,
      items: departments.map(d => ({
        key: `@departamento:${d.name}`,
        label: d.name,
        description: `Departamento: ${d.name}`,
      })),
    });

    // Status - always show
    cats.push({
      id: "status",
      label: "Status",
      icon: CheckCircle2,
      items: statuses.map(s => ({
        key: `@status:${s.name}`,
        label: s.name,
        description: `Status: ${s.name}`,
      })),
    });

    // Etiquetas - always show
    cats.push({
      id: "etiquetas",
      label: "Etiquetas",
      icon: Tag,
      items: tags.map(t => ({
        key: `@etiqueta:${t.name}`,
        label: t.name,
        description: `Etiqueta: ${t.name}`,
      })),
    });

    // Responsáveis - always show
    cats.push({
      id: "responsaveis",
      label: "Responsáveis",
      icon: Users,
      items: (teamMembers || []).map(m => ({
        key: `@responsavel:${m.full_name}`,
        label: m.full_name,
        description: `Responsável: ${m.full_name}`,
      })),
    });

    // Dados gerais (Informações Gerais)
    const generalDataItems: MentionItem[] = [
      { key: "@Nome da empresa", label: "Nome da empresa", description: lawFirm?.name || "Nome da empresa" },
      { key: "@Endereço", label: "Endereço", description: lawFirm?.address || "Endereço da empresa" },
      { key: "@Telefone", label: "Telefone", description: lawFirm?.phone || "Telefone de contato" },
      { key: "@Email", label: "Email", description: lawFirm?.email || "Email de contato" },
      { key: "@Instagram", label: "Instagram", description: lawFirm?.instagram || "Instagram da empresa" },
      { key: "@Facebook", label: "Facebook", description: lawFirm?.facebook || "Facebook da empresa" },
      { key: "@Website", label: "Website", description: lawFirm?.website || "Website da empresa" },
      { key: "@Horário comercial", label: "Horário comercial", description: "Horário de funcionamento" },
    ];
    cats.push({
      id: "dados_gerais",
      label: "Dados gerais",
      icon: Globe,
      items: generalDataItems,
    });

    // Ferramentas
    const toolItems: MentionItem[] = [
      { key: "@Ativar áudio", label: "Ativar áudio", description: "Ativa resposta por áudio" },
      { key: "@Desativar áudio", label: "Desativar áudio", description: "Desativa resposta por áudio" },
      { key: "@Base de conhecimento", label: "Base de conhecimento", description: "Acessa a base de conhecimento" },
      { key: "@Calculadora", label: "Calculadora", description: "Usa calculadora para cálculos" },
      { key: "@Data atual", label: "Data atual", description: "Data atual formatada" },
      { key: "@Hora atual", label: "Hora atual", description: "Hora atual formatada" },
      { key: "@Nome do cliente", label: "Nome do cliente", description: "Nome do cliente na conversa" },
      { key: "@Responsável", label: "Responsável atual", description: "Nome do responsável pelo atendimento" },
    ];
    cats.push({
      id: "ferramentas",
      label: "Ferramentas",
      icon: Wrench,
      items: toolItems,
    });

    // Google Calendar
    const calendarItems: MentionItem[] = [
      { key: "@Criar evento", label: "Criar evento", description: "Criar evento no calendário" },
      { key: "@Listar eventos", label: "Listar eventos", description: "Listar próximos eventos" },
      { key: "@Verificar disponibilidade", label: "Verificar disponibilidade", description: "Verificar disponibilidade de horário" },
      { key: "@Cancelar evento", label: "Cancelar evento", description: "Cancelar evento existente" },
    ];
    cats.push({
      id: "google_calendar",
      label: "Google Calendar",
      icon: Calendar,
      items: calendarItems,
    });

    // Templates/Mensagens - always show
    cats.push({
      id: "mensagens",
      label: "Mensagens",
      icon: MessageSquare,
      items: templates.map(t => ({
        key: `@template:${t.name}`,
        label: t.name,
        description: `Template: ${t.name}`,
      })),
    });

    return cats;
  }, [departments, statuses, tags, templates, teamMembers, lawFirm]);

  // Filter categories and items based on search
  const filteredCategories = useMemo(() => {
    if (!filter) return categories;
    
    const lowerFilter = filter.toLowerCase();
    return categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => 
          item.label.toLowerCase().includes(lowerFilter) ||
          item.key.toLowerCase().includes(lowerFilter) ||
          (item.description && item.description.toLowerCase().includes(lowerFilter))
        ),
      }))
      .filter(cat => 
        cat.items.length > 0 || 
        cat.label.toLowerCase().includes(lowerFilter)
      );
  }, [categories, filter]);

  // Get active category data
  const activeCategoryData = activeCategory 
    ? categories.find(c => c.id === activeCategory) 
    : null;

  // If filtering, show flat list of matching items
  if (filter) {
    const allFilteredItems = filteredCategories.flatMap(cat => 
      cat.items.map(item => ({ ...item, categoryLabel: cat.label, categoryIcon: cat.icon }))
    );

    return (
      <div className="w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
        <ScrollArea className="max-h-80">
          <div className="p-1">
            {allFilteredItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum resultado encontrado
              </div>
            ) : (
              allFilteredItems.slice(0, 15).map((item) => {
                const Icon = item.categoryIcon;
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelect(item.key)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors flex items-center gap-3"
                  >
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.categoryLabel}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
        <div className="px-3 py-2 border-t text-xs text-muted-foreground bg-muted/50">
          Use as setas ↑ ↓ para navegar, Enter para selecionar e Esc para fechar
        </div>
      </div>
    );
  }

  // Show category items if a category is selected
  if (activeCategoryData) {
    return (
      <div className="w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
        {/* Header with back button */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/50">
          <button
            onClick={() => setActiveCategory(null)}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{activeCategoryData.label}</span>
        </div>
        
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {activeCategoryData.items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum item cadastrado
              </div>
            ) : (
              activeCategoryData.items.map((item, idx) => (
                <button
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors flex items-center gap-3"
                >
                  <span className="text-sm flex-1">{item.label}</span>
                  {idx === 0 && (
                    <span className="text-xs text-muted-foreground">↵</span>
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        
        <div className="px-3 py-2 border-t text-xs text-muted-foreground bg-muted/50">
          Use as setas ↑ ↓ para navegar, Enter para selecionar e Esc para fechar
        </div>
      </div>
    );
  }

  // Show categories list
  return (
    <div className="w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
      <ScrollArea className="max-h-80">
        <div className="p-1">
          {filteredCategories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted transition-colors flex items-center gap-3"
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium flex-1">{category.label}</span>
                <span className="text-xs text-muted-foreground">({category.items.length})</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </ScrollArea>
      
      <div className="px-3 py-2 border-t text-xs text-muted-foreground bg-muted/50">
        Use as setas ↑ ↓ para navegar, Enter para selecionar e Esc para fechar
      </div>
    </div>
  );
}
