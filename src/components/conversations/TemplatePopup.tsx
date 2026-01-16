import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Template } from '@/hooks/useTemplates';
import { FileText, Image, Video, Music, FileIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Helper to extract media info from template content
function getTemplateMediaInfo(content: string): { 
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string | null;
  caption: string;
  icon: React.ReactNode;
  typeBadge: string;
} {
  // Match media pattern anywhere in the content
  const mediaMatch = content.match(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/i);
  
  if (mediaMatch) {
    const mediaType = mediaMatch[1].toUpperCase() as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
    const mediaUrl = mediaMatch[2];
    // Get text after the URL (caption)
    const afterUrl = content.substring(content.indexOf(mediaMatch[0]) + mediaMatch[0].length).trim();
    const caption = afterUrl.split('\n')[0]?.trim() || '';
    
    switch (mediaType) {
      case 'IMAGE':
        return { 
          type: 'image',
          mediaUrl,
          caption: caption || 'Imagem',
          icon: <Image className="h-4 w-4" />,
          typeBadge: 'Imagem'
        };
      case 'VIDEO':
        return { 
          type: 'video',
          mediaUrl,
          caption: caption || 'Vídeo',
          icon: <Video className="h-4 w-4" />,
          typeBadge: 'Vídeo'
        };
      case 'AUDIO':
        return { 
          type: 'audio',
          mediaUrl,
          caption: caption || 'Mensagem de áudio',
          icon: <Music className="h-4 w-4" />,
          typeBadge: 'Áudio'
        };
      case 'DOCUMENT':
        return { 
          type: 'document',
          mediaUrl,
          caption: caption || 'Documento',
          icon: <FileIcon className="h-4 w-4" />,
          typeBadge: 'Arquivo'
        };
    }
  }
  
  // Regular text
  return { 
    type: 'text',
    mediaUrl: null,
    caption: content.length > 100 ? content.substring(0, 100) + '...' : content,
    icon: <FileText className="h-4 w-4" />,
    typeBadge: 'Texto'
  };
}

// Badge color based on media type
function getTypeBadgeClass(type: string): string {
  switch (type) {
    case 'image': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'video': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'audio': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'document': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

interface TemplatePopupProps {
  isOpen: boolean;
  templates: Template[];
  searchTerm: string;
  onSelect: (template: Template) => void;
  onClose: () => void;
}

export function TemplatePopup({
  isOpen,
  templates,
  searchTerm,
  onSelect,
  onClose,
}: TemplatePopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter templates by search term
  const filteredTemplates = templates.filter(t => {
    const search = searchTerm.toLowerCase();
    return (
      t.shortcut.toLowerCase().includes(search) ||
      t.name.toLowerCase().includes(search) ||
      t.content.toLowerCase().includes(search)
    );
  });

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredTemplates.length - 1
          );
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredTemplates.length - 1 ? prev + 1 : 0
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredTemplates[selectedIndex]) {
            onSelect(filteredTemplates[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredTemplates, selectedIndex, onSelect, onClose]);

  if (!isOpen || filteredTemplates.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
    >
      <div className="px-3 py-2 border-b border-border bg-muted/50">
        <span className="text-xs font-medium text-muted-foreground">
          Digite para buscar mensagens rápidas ({filteredTemplates.length} mensagens)
        </span>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        <div className="p-1 pb-2">
          {filteredTemplates.map((template, index) => {
            const mediaInfo = getTemplateMediaInfo(template.content);
            const isSelected = index === selectedIndex;
            
            return (
              <div
                key={template.id}
                onClick={() => onSelect(template)}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors",
                  isSelected
                    ? "bg-primary/10 ring-1 ring-primary/30"
                    : "hover:bg-muted/70"
                )}
              >
                {/* Thumbnail for media templates */}
                <div className="flex-shrink-0 w-10 h-10 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden">
                  {mediaInfo.type === 'image' && mediaInfo.mediaUrl ? (
                    <img 
                      src={mediaInfo.mediaUrl} 
                      alt="" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('fallback-icon');
                      }}
                    />
                  ) : mediaInfo.type === 'video' && mediaInfo.mediaUrl ? (
                    <div className="relative w-full h-full bg-blue-500/20 flex items-center justify-center">
                      <Video className="h-5 w-5 text-blue-400" />
                    </div>
                  ) : mediaInfo.type === 'audio' ? (
                    <div className="relative w-full h-full bg-purple-500/20 flex items-center justify-center">
                      <Music className="h-5 w-5 text-purple-400" />
                    </div>
                  ) : mediaInfo.type === 'document' ? (
                    <div className="relative w-full h-full bg-orange-500/20 flex items-center justify-center">
                      <FileIcon className="h-5 w-5 text-orange-400" />
                    </div>
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                
                {/* Template info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm text-primary">/{template.shortcut}</span>
                    <Badge 
                      variant="outline" 
                      className={cn("text-[10px] px-1.5 py-0 h-4", getTypeBadgeClass(mediaInfo.type))}
                    >
                      {mediaInfo.typeBadge}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/80 line-clamp-2">
                    {mediaInfo.caption}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        Use ↑↓ para navegar, Enter para selecionar
      </div>
    </div>
  );
}
