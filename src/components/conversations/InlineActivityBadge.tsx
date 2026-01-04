import { 
  ArrowRightLeft, 
  Tag, 
  Folder, 
  CircleDot,
  Bot,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface ActivityItem {
  id: string;
  type: 'transfer' | 'status_change' | 'department_change' | 'tag_add' | 'tag_remove' | 'tag_added' | 'tag_removed';
  performer: string;
  description: string;
  timestamp: Date;
  isAI?: boolean;
}

interface InlineActivityBadgeProps {
  activity: ActivityItem;
}

const iconMap = {
  transfer: ArrowRightLeft,
  status_change: CircleDot,
  department_change: Folder,
  tag_add: Tag,
  tag_remove: Tag,
  tag_added: Tag,
  tag_removed: Tag,
};

const labelMap = {
  transfer: '',
  status_change: 'alterou o status',
  department_change: 'transferiu para departamento',
  tag_add: 'adicionou a tag',
  tag_remove: 'removeu a tag',
  tag_added: 'adicionou a tag',
  tag_removed: 'removeu a tag',
};

export function InlineActivityBadge({ activity }: InlineActivityBadgeProps) {
  const Icon = activity.type === 'transfer' 
    ? (activity.isAI ? Bot : User) 
    : iconMap[activity.type] || ArrowRightLeft;
  
  const label = labelMap[activity.type] || '';

  return (
    <div className="w-full my-3 flex justify-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted/40 border border-border/40 rounded-full text-xs text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        <span>
          <span className="font-medium text-foreground/80">{activity.performer}</span>
          {label && <> {label}</>}
          {activity.description && (
            <span className="font-medium text-foreground/80"> {activity.description}</span>
          )}
        </span>
        <span className="text-muted-foreground/70">
          · {format(activity.timestamp, "HH:mm", { locale: ptBR })}
        </span>
      </div>
    </div>
  );
}
