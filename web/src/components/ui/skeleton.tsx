import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-muted/70 dark:bg-muted/40 animate-pulse rounded-md", className)}
      role="status"
      aria-label="Loading..."
      {...props}
    />
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-xs",
        className
      )}
    >
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
}

function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-border/40 border-b">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-4">
          <Skeleton className={cn("h-4", i === 0 ? "w-32" : i === 1 ? "w-24" : "w-16")} />
        </td>
      ))}
    </tr>
  );
}

export { Skeleton, SkeletonCard, SkeletonTableRow };
