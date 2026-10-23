"use client";

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/providers/session-provider";

/**
 * Keeps roles without `candidate:read` (viewers) out of the candidate pages. The children are not
 * rendered at all, so nothing is fetched. This only decides what the UI shows; the API stays the
 * source of truth.
 */
export function CandidateAccess({ children }: { children: React.ReactNode }) {
  const { can } = useSession();
  if (can("candidate:read")) return <>{children}</>;

  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to candidates"
      description="Candidate lists and profiles are limited to admins and recruiters."
      action={
        <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
          Back to jobs
        </Link>
      }
    />
  );
}
