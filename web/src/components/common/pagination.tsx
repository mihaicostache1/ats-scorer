import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  /** Singular/plural noun for the summary, e.g. "jobs". */
  noun: string;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}

/** "Showing 1 – 10 of 24 jobs" with Prev/Next, as in the wireframe footer. */
export function Pagination({
  page,
  perPage,
  totalItems,
  totalPages,
  noun,
  onPageChange,
  disabled = false,
  className,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, totalItems);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "border-border/60 bg-foreground/[0.02] flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row",
        className
      )}
    >
      <p className="text-muted-foreground text-xs">
        Showing {first} – {last} of {totalItems} {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>
        <span className="text-muted-foreground px-1 text-xs" aria-current="page">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}
