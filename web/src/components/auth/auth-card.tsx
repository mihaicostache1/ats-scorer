"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useSession } from "@/providers/session-provider";

/** Only same-origin paths are allowed, so `?next=` cannot be used as an open redirect. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/overview";
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
    <div className="w-full max-w-[400px]">
      <div className="space-y-2">
        <h1 className="text-foreground text-[2rem] leading-tight font-semibold tracking-[-0.03em]">
          {title}
        </h1>
        <p className="text-muted-foreground text-[15px]">{description}</p>
      </div>
      <div className="mt-8">{children}</div>
      <p className="text-muted-foreground border-border mt-8 border-t pt-6 text-sm">{footer}</p>
    </div>
  );
}

/** Form-level error shown above the submit button. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive-soft text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
