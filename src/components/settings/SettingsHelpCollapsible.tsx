import { useState } from "react";
import { ChevronDown, Info, Lightbulb } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface HelpItem {
  text: string;
}

interface SettingsHelpCollapsibleProps {
  title: string;
  items: HelpItem[];
  tip?: string;
  className?: string;
  defaultOpen?: boolean;
}

export function SettingsHelpCollapsible({
  title,
  items,
  tip,
  className,
  defaultOpen = false,
}: SettingsHelpCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("mb-6", className)}
    >
      <CollapsibleTrigger className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors text-sm text-primary w-fit">
        <Info className="h-4 w-4" />
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-3">
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-foreground">{title}</h4>
            </div>
          </div>
          
          <ol className="space-y-2 ml-8 list-decimal text-sm text-muted-foreground">
            {items.map((item, index) => (
              <li key={index}>{item.text}</li>
            ))}
          </ol>
          
          {tip && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 ml-8">
              <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <p className="text-sm">
                <span className="font-medium text-yellow-500">Dica:</span>{" "}
                <span className="text-muted-foreground">{tip}</span>
              </p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
