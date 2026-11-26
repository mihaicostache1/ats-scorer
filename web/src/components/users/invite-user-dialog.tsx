"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";

import { inviteUser } from "@/api";
import type { components } from "@/api/generated/schema";
import { FormError } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import { formatDate } from "@/lib/format";
import { ROLE_FILTERS, ROLE_LABELS } from "./use-users";

type Invitation = components["schemas"]["UserInvitationResponse"];

const inviteSchema = z.object({
  email: z.string().trim().min(1, "Enter an email address").email("Enter a valid email address"),
  role: z.enum(ROLE_FILTERS),
});
type InviteValues = z.infer<typeof inviteSchema>;

const ROLE_HINTS: Record<(typeof ROLE_FILTERS)[number], string> = {
  admin: "Full access, including managing users.",
  recruiter: "Manages jobs, candidates and the pipeline.",
  viewer: "Read-only access.",
};

/**
 * Two steps in one dialog: choose an email and role, then get a link to share. No email is sent;
 * the admin passes the link on. The link is only returned once, so it lives in this component's
 * state alone and is gone when the dialog closes.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The body unmounts after the dialog closes, which resets the form and drops the link. */}
      <DialogContent>
        <InviteBody onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteBody({ onClose }: { onClose: () => void }) {
  const [invitation, setInvitation] = React.useState<Invitation | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "recruiter" },
  });

  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = async (values: InviteValues) => {
    setFormError(null);
    try {
      const { data, error, response } = await inviteUser({
        email: values.email,
        role: values.role,
      });
      if (data) {
        setInvitation(data);
        toast.success(`Invitation link created for ${data.email}.`, "Invitation ready");
        return;
      }
      const failure = parseApiFailure(error, response.status);
      if (response.status === 409) {
        form.setError("email", { message: failure.message });
      } else if (failure.fields.email || failure.fields.role) {
        if (failure.fields.email) form.setError("email", { message: failure.fields.email });
        if (failure.fields.role) form.setError("role", { message: failure.fields.role });
      } else {
        setFormError(failure.message);
      }
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    }
  };

  if (invitation) {
    return (
      <InviteLink
        invitation={invitation}
        onAnother={() => {
          setInvitation(null);
          form.reset();
        }}
        onDone={onClose}
      />
    );
  }

  const busy = form.formState.isSubmitting;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite a colleague</DialogTitle>
        <DialogDescription>
          Choose their email and role. You&apos;ll get a link to send them yourself; no email is
          sent from here.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    autoComplete="off"
                    error={!!form.formState.errors.email}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <FormControl>
                  <Select error={!!form.formState.errors.role} {...field}>
                    {ROLE_FILTERS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <p className="text-muted-foreground text-xs">{ROLE_HINTS[role]}</p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormError message={formError} />

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Creating link…" : "Create invite link"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function InviteLink({
  invitation,
  onAnother,
  onDone,
}: {
  invitation: Invitation;
  onAnother: () => void;
  onDone: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [copy, setCopy] = React.useState<"idle" | "copied" | "failed">("idle");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(invitation.invite_url);
      setCopy("copied");
    } catch {
      // No clipboard access (insecure origin, denied permission): select it so Ctrl+C works.
      inputRef.current?.select();
      setCopy("failed");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invitation link ready</DialogTitle>
        <DialogDescription>
          Send this link to <span className="text-foreground font-medium">{invitation.email}</span>{" "}
          as a {ROLE_LABELS[invitation.role].toLowerCase()}. They choose their own name and
          password.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <label htmlFor="invite-link" className="text-sm leading-none font-medium">
          Invitation link
        </label>
        <div className="flex gap-2">
          <Input
            id="invite-link"
            ref={inputRef}
            readOnly
            value={invitation.invite_url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button type="button" variant="outline" onClick={copyLink} className="shrink-0 gap-2">
            {copy === "copied" ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copy === "copied" ? "Copied" : "Copy link"}
          </Button>
        </div>
        <p
          aria-live="polite"
          className={copy === "failed" ? "text-destructive text-xs" : "text-success text-xs"}
        >
          {copy === "copied" && "Link copied to the clipboard."}
          {copy === "failed" && "Couldn't copy automatically. The link is selected: press Ctrl+C."}
        </p>
      </div>

      <div className="border-warning/30 bg-warning/10 text-foreground flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-sm">
        <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Expires {formatDate(invitation.expires_at)} and works once. This link is only shown now:
          if you close this dialog without copying it, create a new invitation.
        </span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onAnother}>
          Invite another
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
