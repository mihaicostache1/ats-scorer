"use client";

import * as React from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  FileSearch,
  FileX,
  Loader2,
  Lock,
  TriangleAlert,
} from "lucide-react";

import {
  getCandidate,
  getCandidateCvDocument,
  listCandidateCvDocuments,
  updateCandidateParsedProfile,
} from "@/api";
import { CV_STATUS_BADGE, describeCvStatus, isReviewable } from "@/components/candidates/cv-status";
import type { CandidateResponse } from "@/components/candidates/use-candidates";
import { unwrap, useResource } from "@/components/candidates/use-resource";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { NETWORK_ERROR_MESSAGE, parseApiFailure, type ApiFailure } from "@/lib/api-error";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";
import { describePointer, formatConfidence, lowConfidenceFields } from "./confidence";
import { ReviewProvider } from "./low-confidence";
import {
  checkPatch,
  parsedCvSchema,
  reviewFormSchema,
  toFormValues,
  type ParsedCV,
  type ReviewFormValues,
} from "./parsed-cv-schema";
import { PdfPane } from "./pdf-pane";
import { ReviewForm } from "./review-form";
import { UnsavedChangesDialog } from "./unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "./use-unsaved-changes";

type Path = FieldPath<ReviewFormValues>;
type CvDocument = Parameters<typeof describeCvStatus>[0];

const backLink =
  "text-muted-foreground hover:text-foreground focus-visible:ring-primary/25 inline-flex items-center gap-1.5 rounded-md text-sm focus-visible:ring-4 focus-visible:outline-none";

/** Keeps roles without `cv-review:read` out. Every role has it today; the API is the source of truth. */
export function CvReviewAccess({ children }: { children: React.ReactNode }) {
  const { can } = useSession();
  if (can("cv-review:read")) return <>{children}</>;

  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to CV review"
      description="Ask an admin to give your account access."
      action={
        <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
          Back to jobs
        </Link>
      }
    />
  );
}

// ─── Focus helpers ────────────────────────────────────────────────────────────

/**
 * Focuses the control for a saved value. Falls back to its row and then its section when the exact
 * control is gone (the row was removed, or the parser scored a whole section).
 */
function focusPointer(pointer: string): boolean {
  let current = pointer;
  while (current) {
    const target = document.querySelector<HTMLElement>(`[data-pointer="${current}"]`);
    if (target && !(target as HTMLInputElement).disabled) {
      target.focus();
      target.scrollIntoView?.({ block: "center" });
      return true;
    }
    current = current.slice(0, current.lastIndexOf("/"));
  }
  return false;
}

interface FlatError {
  path: string;
  message: string;
}

function flattenErrors(errors: unknown, prefix = ""): FlatError[] {
  if (!errors || typeof errors !== "object") return [];
  const record = errors as Record<string, unknown>;
  if (typeof record.message === "string" && typeof record.type === "string" && prefix) {
    return [{ path: prefix, message: record.message }];
  }
  return Object.entries(record)
    .filter(([key]) => key !== "ref")
    .flatMap(([key, value]) => flattenErrors(value, prefix ? `${prefix}.${key}` : key));
}

const FORM_ROOTS = [
  "contact",
  "headline",
  "summary",
  "experience_years",
  "skills",
  "experiences",
  "education",
  "languages",
  "certifications",
];

/** Puts the API's field errors (a 422, or the 409 for a duplicate email) next to their fields. */
function showServerErrors(form: UseFormReturn<ReviewFormValues>, failure: ApiFailure) {
  let first = true;
  for (const [path, message] of Object.entries(failure.paths ?? {})) {
    if (!FORM_ROOTS.includes(path.split(".")[0])) continue;
    form.setError(path as Path, { type: "server", message }, { shouldFocus: first });
    first = false;
  }
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4" role="status" aria-label="Loading CV review">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-12 w-96 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[70dvh] w-full" />
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

/** The candidate's newest CV: the one their parsed profile comes from. */
function newestCvId(cvs: { id: string; created_at: string }[]): string | null {
  const sorted = [...cvs].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  );
  return sorted[0]?.id ?? null;
}

/** Loads the candidate and the CV, then hands them to the editor. */
export function CvReview({ candidateId, cvId }: { candidateId: string; cvId: string }) {
  const load = React.useCallback(async () => {
    const [candidate, cv, all] = await Promise.all([
      getCandidate(candidateId).then(unwrap),
      getCandidateCvDocument(candidateId, cvId).then(unwrap),
      // Only used to warn about an older CV; the screen works without it.
      listCandidateCvDocuments(candidateId)
        .then((r) => r.data ?? null)
        .catch(() => null),
    ]);
    return { candidate, cv, latestCvId: all ? newestCvId(all) : null };
  }, [candidateId, cvId]);
  const { state, refetch } = useResource(load);

  if (state.phase === "loading") return <ReviewSkeleton />;

  if (state.phase === "error") {
    return state.notFound ? (
      <EmptyState
        icon={FileX}
        title="CV not found"
        description="The candidate or the CV may have been removed, or the link is wrong."
        action={
          <Link
            href={`/candidates/${candidateId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Back to candidate
          </Link>
        }
      />
    ) : (
      <ErrorState
        title="Couldn't load this CV"
        description="Something went wrong while fetching the CV and its parsed fields."
        error={state.error}
        onRetry={refetch}
        action={
          <Link
            href={`/candidates/${candidateId}`}
            className={buttonVariants({ variant: "ghost" })}
          >
            Back to candidate
          </Link>
        }
      />
    );
  }

  const { candidate, cv, latestCvId } = state.data;
  const back = (
    <Link href={`/candidates/${candidate.id}`} className={buttonVariants({ variant: "outline" })}>
      Back to candidate
    </Link>
  );

  if (!isReviewable(cv.status)) {
    return (
      <EmptyState
        icon={FileSearch}
        title="This CV isn't ready for review"
        description={describeCvStatus(cv)}
        action={back}
      />
    );
  }

  // Only a profile that is valid L-10 can be corrected: the server merges corrections into it.
  if (!parsedCvSchema.safeParse(candidate.parsed_data).success) {
    return (
      <EmptyState
        icon={FileSearch}
        title="This profile can't be reviewed yet"
        description="The parsed data is missing or is not in the current format. Upload the CV again to parse it."
        action={back}
      />
    );
  }

  return (
    <ReviewEditor
      candidate={candidate}
      cv={cv}
      initial={candidate.parsed_data as unknown as ParsedCV}
      isLatestCv={latestCvId === null || latestCvId === cv.id}
    />
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "info" | "warning";
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-sm",
        tone === "warning"
          ? "border-warning/30 bg-warning/10 text-foreground"
          : "border-border bg-secondary/60 text-foreground"
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "warning" && "text-warning")}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

function ReviewEditor({
  candidate,
  cv,
  initial,
  isLatestCv,
}: {
  candidate: CandidateResponse;
  cv: CvDocument & { id: string; candidate_id: string; original_filename: string };
  initial: ParsedCV;
  isLatestCv: boolean;
}) {
  const { can } = useSession();
  const canEdit = can("candidate:write");

  // What the server holds. It becomes the response of each save, so the next patch is built from it.
  const [saved, setSaved] = React.useState<ParsedCV>(initial);
  const [reviewedAt, setReviewedAt] = React.useState(candidate.parsed_profile_reviewed_at ?? null);
  const [name, setName] = React.useState(candidate.full_name);

  const resolver = React.useMemo(() => zodResolver(reviewFormSchema(saved)), [saved]);
  const form = useForm<ReviewFormValues>({
    resolver,
    defaultValues: toFormValues(initial),
    reValidateMode: "onChange",
  });
  const { isDirty, isSubmitting, submitCount, errors } = form.formState;
  // True only while a valid save is in flight (see `save`), unlike `isSubmitting`, which also covers
  // the moment the form is being validated.
  const [saving, setSaving] = React.useState(false);

  const guard = useUnsavedChangesGuard(canEdit && isDirty);
  const flagged = React.useMemo(() => lowConfidenceFields(saved), [saved]);
  const problems = submitCount > 0 ? flattenErrors(errors) : [];

  const save = async (values: ReviewFormValues) => {
    // The last gate: what the server would store must be valid L-10, whatever the form allowed.
    const check = checkPatch(values, saved);
    if (!check.ok) {
      check.issues.forEach(({ path, message }, i) =>
        form.setError(path as Path, { type: "schema", message }, { shouldFocus: i === 0 })
      );
      toast.error(
        "These corrections don't match the CV format, so nothing was saved.",
        "Not saved"
      );
      return;
    }

    // Lock the fields only now that a request is really going out, not while the form is still being
    // validated: a disabled input ignores `.focus()`, so locking earlier would stop the form library
    // from moving focus to the first invalid field.
    setSaving(true);
    try {
      const { data, error, response } = await updateCandidateParsedProfile(
        candidate.id,
        check.patch
      );
      if (!data) {
        const failure = parseApiFailure(error, response.status);
        // Unlock first, in this same tick, so the field the server complains about can take focus.
        flushSync(() => setSaving(false));
        showServerErrors(form, failure);
        toast.error(failure.message, "Couldn't save corrections");
        return;
      }
      const changed = Object.keys(check.patch).length > 0;
      setSaved(data.parsed_data);
      setReviewedAt(data.reviewed_at);
      if (check.patch.contact?.name) setName(check.patch.contact.name);
      form.reset(toFormValues(data.parsed_data));
      toast.success(
        changed ? "Your corrections were saved." : "The profile was marked as reviewed.",
        changed ? "Corrections saved" : "Review recorded"
      );
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE, "Couldn't save corrections");
    } finally {
      setSaving(false);
    }
  };

  const submit = form.handleSubmit(save);
  const status = CV_STATUS_BADGE[cv.status];

  return (
    <ReviewProvider value={{ confidence: saved.confidence, readOnly: !canEdit }}>
      <div className="mx-auto max-w-[1600px] space-y-4">
        <nav
          aria-label="Skip links"
          className="sr-only focus-within:not-sr-only focus-within:flex focus-within:gap-2"
        >
          {[
            ["#cv-corrections", "Skip to corrections"],
            ["#cv-original", "Skip to the original CV"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {label}
            </a>
          ))}
        </nav>

        <header>
          <Link href={`/candidates/${candidate.id}`} className={backLink}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to candidate
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-foreground text-large-title">Review parsed CV</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm break-words">
            {name} · {cv.original_filename}
          </p>
        </header>

        {!canEdit && (
          <Banner tone="info" icon={Lock}>
            You can look at this CV and its parsed fields, but your role can&apos;t change them.
          </Banner>
        )}
        {!isLatestCv && (
          <Banner tone="warning" icon={TriangleAlert}>
            This isn&apos;t the candidate&apos;s latest CV. The fields on the right come from their
            latest upload, so they may not match this PDF.
          </Banner>
        )}

        {flagged.length > 0 && (
          <details open className="glass rounded-2xl p-4">
            <summary className="text-foreground focus-visible:ring-primary/25 cursor-pointer rounded-md text-sm font-medium focus-visible:ring-4 focus-visible:outline-none">
              {flagged.length} {flagged.length === 1 ? "field" : "fields"} to check
            </summary>
            <p className="text-muted-foreground text-footnote mt-2">
              The parser was unsure about these. Choose one to jump to it.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {flagged.map((field) => (
                <li key={field.pointer}>
                  <button
                    type="button"
                    onClick={() => focusPointer(field.pointer)}
                    className="border-warning/40 bg-warning/10 text-foreground hover:bg-warning/15 focus-visible:ring-primary/25 rounded-full border px-3 py-1 text-xs font-medium focus-visible:ring-4 focus-visible:outline-none"
                  >
                    {field.label} · {formatConfidence(field.confidence)}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section
            id="cv-original"
            tabIndex={-1}
            aria-label="Original CV"
            className="h-[70dvh] outline-none lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]"
          >
            <PdfPane candidateId={candidate.id} cvId={cv.id} filename={cv.original_filename} />
          </section>

          <div id="cv-corrections" tabIndex={-1} className="min-w-0 outline-none">
            <Form {...form}>
              <form
                aria-label="Parsed fields"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canEdit && !isSubmitting) void submit();
                }}
                onKeyDown={(event) => {
                  if (
                    canEdit &&
                    (event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === "s"
                  ) {
                    event.preventDefault();
                    if (!isSubmitting) void submit();
                  }
                }}
                className="space-y-4"
              >
                {problems.length > 0 && (
                  <div
                    role="alert"
                    className="border-destructive/30 bg-destructive/5 rounded-2xl border p-4"
                  >
                    <p className="text-destructive flex items-center gap-2 text-sm font-medium">
                      <CircleAlert className="size-4" aria-hidden="true" />
                      Fix {problems.length} {problems.length === 1 ? "problem" : "problems"} to save
                    </p>
                    <ul className="mt-2 space-y-1">
                      {problems.map((problem) => (
                        <li key={problem.path}>
                          <button
                            type="button"
                            onClick={() => form.setFocus(problem.path as Path)}
                            className="text-foreground focus-visible:ring-primary/25 rounded text-left text-sm underline underline-offset-2 focus-visible:ring-4 focus-visible:outline-none"
                          >
                            {describePointer(`/${problem.path.replaceAll(".", "/")}`)}:{" "}
                            {problem.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* A disabled fieldset disables every control inside it, so viewers can read but not edit. */}
                <fieldset disabled={!canEdit || saving} className="min-w-0 border-0 p-0">
                  <legend className="sr-only">Parsed CV fields</legend>
                  <ReviewForm />
                </fieldset>

                {canEdit && (
                  <div className="glass-strong sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
                    <p
                      role="status"
                      aria-live="polite"
                      className="text-muted-foreground text-footnote"
                    >
                      {isDirty
                        ? "You have unsaved changes."
                        : reviewedAt
                          ? `Last reviewed ${formatDate(reviewedAt)}.`
                          : "Not reviewed yet."}{" "}
                      <span className="hidden sm:inline">Ctrl+S saves.</span>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!isDirty || isSubmitting}
                        onClick={() => form.reset(toFormValues(saved))}
                      >
                        Reset
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          !isDirty && <CircleCheck aria-hidden="true" />
                        )}
                        {isSubmitting
                          ? "Saving…"
                          : isDirty
                            ? "Save corrections"
                            : "Confirm as correct"}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </Form>
          </div>
        </div>

        <UnsavedChangesDialog
          open={guard.pendingHref !== null}
          onStay={guard.stay}
          onLeave={guard.leave}
        />
      </div>
    </ReviewProvider>
  );
}
