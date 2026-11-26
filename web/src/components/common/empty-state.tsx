import * as React from "react";
import { FolderSearch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon = FolderSearch,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border animate-pop-in flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center",
        className
      )}
      role="status"
      {...props}
    >
      <div className="border-border bg-background-secondary text-muted-foreground mb-4 flex size-11 items-center justify-center rounded-lg border">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="text-foreground text-headline">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-relaxed">{description}</p>
      {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
    </div>
  );
}
