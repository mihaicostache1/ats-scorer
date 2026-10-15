"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/providers/session-provider";

/**
 * Keeps signed-out visitors out of the app. While the session is being checked it shows a
 * placeholder, so protected content never flashes; unauthenticated users are sent to
 * `/login`, remembering where they were headed.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") {
    return (
      <div
        className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-6"
        role="status"
        aria-label="Checking your session"
      >
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return <>{children}</>;
}
