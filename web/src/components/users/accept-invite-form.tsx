"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { acceptInvitation } from "@/api";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const COMMON_PASSWORDS = ["password", "12345678", "qwertyui"];
const MAX_TOKEN_LENGTH = 256;

// Mirrors the API's AcceptInvitationRequest validation.
const acceptSchema = z
  .object({
    fullName: z.string().trim().min(2, "At least 2 characters").max(255),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .max(128, "At most 128 characters")
      .refine((v) => !COMMON_PASSWORDS.includes(v.toLowerCase()), "Password is too common"),
    confirmPassword: z.string().min(1, "Repeat your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type AcceptValues = z.infer<typeof acceptSchema>;

/** API field name → form field name, for mapping server-side validation errors. */
const API_FIELDS: Record<string, keyof AcceptValues> = {
  full_name: "fullName",
  password: "password",
};

/** `#token=abc` → `abc`; null when it is missing, empty or implausibly long. */
export function parseInviteToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token")?.trim();
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

// The hash is read through useSyncExternalStore: `null` on the server and during hydration (so
// the first paint is the same everywhere), the real hash afterwards.
const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash;
const readHashOnServer = () => null;

/**
 * Accept-invite page (public). The invitation token travels in the URL fragment
 * (`/accept-invite#token=…`), which browsers never send to a server or in a Referer header; it
 * goes to the API in the request body. Once read, the fragment is removed from the address bar.
 *
 * There is no endpoint to check a token up front, so a link that is expired, already used or
 * replaced by a newer invitation only shows itself as such when the form is submitted (the API
 * answers all of those with the same 400). A missing or malformed token is caught immediately.
 * Either way the person lands on the same "expired" page, with no form to fill in for nothing.
 */
export function AcceptInviteForm() {
  const hash = React.useSyncExternalStore(subscribeToHash, readHash, readHashOnServer);

  // undefined = hash not read yet, null = no usable token. Kept in state so it survives the
  // fragment being stripped from the address bar.
  const [token, setToken] = React.useState<string | null | undefined>(undefined);
  if (token === undefined && hash !== null) setToken(parseInviteToken(hash));

  const [outcome, setOutcome] = React.useState<"form" | "invalid" | "success">("form");

  React.useEffect(() => {
    // Keep the secret out of history, bookmarks and over-the-shoulder glances.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  if (token === undefined) return <CheckingInvite />;
  if (token === null || outcome === "invalid") return <InvalidInvite />;
  if (outcome === "success") return <InviteAccepted />;
  return (
    <AcceptForm
      token={token}
      onAccepted={() => setOutcome("success")}
      onInvalid={() => setOutcome("invalid")}
    />
  );
}

function CheckingInvite() {
  return (
    <div className="w-full max-w-md space-y-4" role="status" aria-label="Checking your invitation">
      <Skeleton className="mx-auto size-14 rounded-[22%]" />
      <Skeleton className="mx-auto h-7 w-56" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

function InvalidInvite() {
  return (
    <AuthCard
      title="This invitation link has expired"
      description="It is no longer valid, so no account can be created with it."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-link font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4 text-center text-sm">
        <p className="text-muted-foreground">
          Invitation links expire after 48 hours and work only once. A link also stops working when
          a newer invitation is sent to the same email address.
        </p>
        <p className="text-foreground font-medium">
          Ask your workspace admin to send you a new invitation.
        </p>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          Go to sign in
        </Link>
      </div>
    </AuthCard>
  );
}

function InviteAccepted() {
  return (
    <AuthCard
      title="Account created"
      description="You've joined the workspace. Sign in with the email you were invited at and your new password."
      footer="You will be asked for your email and password."
    >
      <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        Sign in
      </Link>
    </AuthCard>
  );
}

function AcceptForm({
  token,
  onAccepted,
  onInvalid,
}: {
  token: string;
  onAccepted: () => void;
  onInvalid: () => void;
}) {
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<AcceptValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { fullName: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: AcceptValues) => {
    setFormError(null);
    try {
      const { data, error, response } = await acceptInvitation({
        token,
        full_name: values.fullName,
        password: values.password,
      });
      if (data) {
        onAccepted();
        return;
      }
      // Unknown, expired, used and replaced tokens are indistinguishable by design.
      if (response.status === 400) {
        onInvalid();
        return;
      }
      if (response.status === 409) {
        setFormError("An account with this email already exists. Sign in instead.");
        return;
      }
      // A 422 does not consume the token, so the form stays and can be corrected.
      const failure = parseApiFailure(error, response.status);
      let mapped = false;
      for (const [apiField, message] of Object.entries(failure.fields)) {
        const name = API_FIELDS[apiField];
        if (name) {
          form.setError(name, { message });
          mapped = true;
        }
      }
      setFormError(mapped ? null : failure.message);
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    }
  };

  const busy = form.formState.isSubmitting;

  return (
    <AuthCard
      title="Accept your invitation"
      description="Choose your name and a password to join the workspace."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-link font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Sarah Jenkins"
                    autoComplete="name"
                    error={!!form.formState.errors.fullName}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    error={!!form.formState.errors.password}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    error={!!form.formState.errors.confirmPassword}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormError message={formError} />

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
