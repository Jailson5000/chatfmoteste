import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  totalItems,
  startIndex,
  endIndex,
  hasNextPage,
  hasPrevPage,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  onNextPage,
  onPrevPage,
}: PaginationControlsProps) {
  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
      {/* Left: Items per page */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Exibir</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(val) => onPageSizeChange(Number(val))}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>por página</span>
      </div>

      {/* Center: Showing X-Y of Z */}
      <div className="text-sm text-muted-foreground">
        Exibindo <span className="font-medium text-foreground">{startIndex}</span>
        {" - "}
        <span className="font-medium text-foreground">{endIndex}</span>
        {" de "}
        <span className="font-medium text-foreground">{totalItems}</span>
      </div>

      {/* Right: Navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(1)}
          disabled={!hasPrevPage}
        >
          <ChevronsLeft className="h-4 w-4" />
          <span className="sr-only">Primeira página</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onPrevPage}
          disabled={!hasPrevPage}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Página anterior</span>
        </Button>
        
        <div className="flex items-center gap-1 px-2">
          <span className="text-sm text-muted-foreground">
            Página{" "}
            <span className="font-medium text-foreground">{page}</span>
            {" de "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onNextPage}
          disabled={!hasNextPage}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Próxima página</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage}
        >
          <ChevronsRight className="h-4 w-4" />
          <span className="sr-only">Última página</span>
        </Button>
      </div>
    </div>
  );
}
