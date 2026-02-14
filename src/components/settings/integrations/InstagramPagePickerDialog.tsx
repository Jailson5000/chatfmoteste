import { useState } from "react";
import { Instagram, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface InstagramPage {
  pageId: string;
  pageName: string;
  igAccountId: string;
  igUsername: string | null;
  igName: string | null;
  igProfilePicture: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: InstagramPage[];
  onSelect: (page: InstagramPage) => Promise<void>;
}

export function InstagramPagePickerDialog({ open, onOpenChange, pages, onSelect }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelect = async (page: InstagramPage) => {
    setLoading(page.pageId);
    try {
      await onSelect(page);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
              <Instagram className="h-3.5 w-3.5 text-white" />
            </div>
            Selecionar conta Instagram
          </DialogTitle>
          <DialogDescription>
            Escolha a conta Instagram que deseja conectar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {pages.map((page) => (
            <div
              key={page.pageId}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={page.igProfilePicture || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white text-xs">
                  {(page.igUsername || page.pageName || "IG").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {page.igName || page.pageName}
                </p>
                {page.igUsername && (
                  <p className="text-xs text-muted-foreground truncate">
                    @{page.igUsername}
                  </p>
                )}
                <p className="text-xs text-muted-foreground truncate">
                  Página: {page.pageName}
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => handleSelect(page)}
                disabled={loading !== null}
              >
                {loading === page.pageId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Conectar"
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
