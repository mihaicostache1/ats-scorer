import * as React from "react";
import { ErrorState } from "@/components/common/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResourceState } from "./use-resource";

/** A titled card on the profile; each section loads and fails on its own. */
export function ProfileSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="glass space-y-4 rounded-2xl p-6">
      <div>
        <h2 id={`${id}-heading`} className="text-foreground text-headline">
          {title}
        </h2>
        {description && <p className="text-muted-foreground text-footnote mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Loading and error states shared by the sections that fetch their own data. */
export function SectionBody<T>({
  state,
  label,
  onRetry,
  children,
}: {
  state: ResourceState<T>;
  /** What is being loaded, e.g. "applications". */
  label: string;
  onRetry: () => void;
  children: (data: T) => React.ReactNode;
}) {
  if (state.phase === "loading") {
    return (
      <div className="space-y-2" role="status" aria-label={`Loading ${label}`}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <ErrorState
        title={`Couldn't load ${label}`}
        description="Something went wrong while fetching this section."
        error={state.error}
        onRetry={onRetry}
        className="min-h-0 p-6"
      />
    );
  }
  return <>{children(state.data)}</>;
}

/** Shown inside a section when there is nothing to list. */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {children}
    </p>
  );
}
