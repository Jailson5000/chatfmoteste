import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Template } from '@/hooks/useTemplates';
import { FileText, Image, Video, Music, FileIcon } from 'lucide-react';

// Helper to get a friendly preview of template content
function getTemplatePreview(content: string): { icon: React.ReactNode; preview: string } {
  // Match media pattern anywhere in the content (not just at start)
  const mediaMatch = content.match(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/i);
  
  if (mediaMatch) {
    const mediaType = mediaMatch[1].toUpperCase();
    // Get text after the URL (caption)
    const afterUrl = content.substring(content.indexOf(mediaMatch[0]) + mediaMatch[0].length).trim();
    const caption = afterUrl.split('\n')[0]?.trim() || '';
    
    switch (mediaType) {
      case 'IMAGE':
        return { 
          icon: <Image className="h-4 w-4 text-green-500" />, 
          preview: caption || '📷 Imagem' 
        };
      case 'VIDEO':
        return { 
          icon: <Video className="h-4 w-4 text-blue-500" />, 
          preview: caption || '🎬 Vídeo' 
        };
      case 'AUDIO':
        return { 
          icon: <Music className="h-4 w-4 text-purple-500" />, 
          preview: caption || '🎵 Áudio' 
        };
      case 'DOCUMENT':
        return { 
          icon: <FileIcon className="h-4 w-4 text-orange-500" />, 
          preview: caption || '📄 Documento' 
        };
    }
  }
  
  // For regular text, just truncate
  return { 
    icon: <FileText className="h-4 w-4" />, 
    preview: content.length > 80 ? content.substring(0, 80) + '...' : content 
  };
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
          Templates rápidos • Use ↑↓ para navegar, Enter para selecionar
        </span>
      </div>
      <ScrollArea className="max-h-[320px]">
        <div className="p-1">
          {filteredTemplates.map((template, index) => {
            const { icon, preview } = getTemplatePreview(template.content);
            return (
              <div
                key={template.id}
                onClick={() => onSelect(template)}
                className={cn(
                  "flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                  index === selectedIndex
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                )}
              >
                <div className="mt-0.5 flex-shrink-0">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{template.name}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                      /{template.shortcut}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {preview}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
