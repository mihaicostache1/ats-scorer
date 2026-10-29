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
    <div className="w-full max-w-md space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-primary-foreground flex size-14 items-center justify-center rounded-[22%] bg-gradient-to-b from-[#3395ff] to-[#007aff] text-base font-bold shadow-lg">
          ATS
        </div>
        <div className="space-y-1.5">
          <h1 className="text-title-1">{title}</h1>
          <p className="text-muted-foreground text-callout">{description}</p>
        </div>
      </div>
      <div className="glass rounded-2xl p-8">{children}</div>
      <p className="text-muted-foreground text-footnote text-center">{footer}</p>
    </div>
  );
}

/** Form-level error shown above the submit button. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
