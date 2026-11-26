"use client";

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/providers/session-provider";

/**
 * Keeps roles without `user:manage` (everyone but admins) out of user management. The children are
 * not rendered at all, so nothing is fetched. This only decides what the UI shows; the API stays
 * the source of truth and answers 403 to anyone else.
 */
export function UserAccess({ children }: { children: React.ReactNode }) {
  const { can } = useSession();
  if (can("user:manage")) return <>{children}</>;

  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to user management"
      description="Inviting people, changing roles and deactivating accounts is limited to admins."
      action={
        <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
          Back to jobs
        </Link>
      }
    />
  );
}
