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
        "border-border animate-in fade-in-50 flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center",
        className
      )}
      role="status"
      {...props}
    >
      <div className="bg-muted/60 text-muted-foreground mb-4 flex size-14 items-center justify-center rounded-full">
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <h3 className="text-foreground text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
    </div>
  );
}
