"use client";

import * as React from "react";
import type { Action } from "@/lib/permissions";
import { useSession } from "@/providers/session-provider";

/**
 * Renders `children` only if the signed-in user's role allows `action`.
 * This hides write controls from viewers; the API still rejects forbidden calls with 403.
 */
export function Can({
  action,
  children,
  fallback = null,
}: {
  action: Action;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useSession();
  return <>{can(action) ? children : fallback}</>;
}
