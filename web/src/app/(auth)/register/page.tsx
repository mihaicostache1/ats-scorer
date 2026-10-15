"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { AuthCard, FormError, useRedirectWhenAuthenticated } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSession } from "@/providers/session-provider";

// Mirrors the API's OrgRegisterRequest validation.
const registerSchema = z
  .object({
    orgName: z.string().trim().min(2, "At least 2 characters").max(255),
    orgSlug: z
      .string()
      .min(2, "At least 2 characters")
      .max(100)
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
    fullName: z.string().trim().min(2, "At least 2 characters").max(255),
    email: z.string().min(1, "Enter your email").email("Enter a valid email address"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Repeat your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type RegisterValues = z.infer<typeof registerSchema>;

/** API field name → form field name, for mapping server-side validation errors. */
const API_FIELDS: Record<string, keyof RegisterValues> = {
  org_name: "orgName",
  org_slug: "orgSlug",
  admin_full_name: "fullName",
  admin_email: "email",
  admin_password: "password",
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function RegisterPage() {
  const status = useRedirectWhenAuthenticated();
  const { signUp } = useSession();
  const [formError, setFormError] = React.useState<string | null>(null);
  // Stop auto-filling the slug once the user has typed their own.
  const slugEdited = React.useRef(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      orgName: "",
      orgSlug: "",
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null);
    const result = await signUp({
      org_name: values.orgName,
      org_slug: values.orgSlug,
      admin_full_name: values.fullName,
      admin_email: values.email,
      admin_password: values.password,
    });
    if (result.ok) return; // useRedirectWhenAuthenticated navigates away.

    let mapped = false;
    for (const [apiField, message] of Object.entries(result.failure.fields)) {
      const name = API_FIELDS[apiField];
      if (name) {
        form.setError(name, { message });
        mapped = true;
      }
    }
    setFormError(mapped ? null : result.failure.message);
  };

  const busy = form.formState.isSubmitting || status === "authenticated";

  return (
    <AuthCard
      title="Create your organization"
      description="Set up a workspace. You become its first admin."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="orgName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organization name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Acme Corp"
                    autoComplete="organization"
                    error={!!form.formState.errors.orgName}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!slugEdited.current) {
                        form.setValue("orgSlug", slugify(e.target.value), {
                          shouldValidate: form.formState.isSubmitted,
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="orgSlug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace URL name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="acme-corp"
                    autoComplete="off"
                    error={!!form.formState.errors.orgSlug}
                    {...field}
                    onChange={(e) => {
                      slugEdited.current = true;
                      field.onChange(e);
                    }}
                  />
                </FormControl>
                <FormDescription>Lowercase letters, numbers and hyphens.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    error={!!form.formState.errors.email}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>

          <FormError message={formError} />

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Creating workspace…" : "Create organization"}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
