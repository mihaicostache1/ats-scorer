"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useSession } from "@/providers/session-provider";

/** Only same-origin paths are allowed, so `?next=` cannot be used as an open redirect. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}

/** Sends already-signed-in users (and users who just signed in) on to the app. */
export function useRedirectWhenAuthenticated() {
  const { status } = useSession();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));

  React.useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  return status;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl text-sm font-bold shadow-xs">
          ATS
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      <div className="border-border bg-card rounded-xl border p-6 shadow-xs">{children}</div>
      <p className="text-muted-foreground text-center text-sm">{footer}</p>
    </div>
  );
}

/** Form-level error shown above the submit button. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
