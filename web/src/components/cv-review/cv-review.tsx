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
import { PossibleDuplicates } from "@/components/candidates/possible-duplicates";
import type { CandidateResponse } from "@/components/candidates/use-candidates";
import { unwrap, useResource } from "@/components/candidates/use-resource";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Badge, StatusDot } from "@/components/ui/badge";
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
    <div className="space-y-4" role="status" aria-label="Loading CV review">
      <Skeleton className="h-12 w-96 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-[57fr_43fr]">
        <Skeleton className="h-[70dvh] w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
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

// ─── Split view ───────────────────────────────────────────────────────────────

const SPLIT_KEY = "ats-review-split";
const SPLIT_DEFAULT = 57;
const SPLIT_MIN = 35;
const SPLIT_MAX = 72;

/** In-page navigation for the fields panel. */
const SECTION_LINKS = [
  ["#cv-contact-heading", "Contact"],
  ["#cv-profile-heading", "Profile"],
  ["#cv-skills-heading", "Skills"],
  ["#cv-experience-heading", "Experience"],
  ["#cv-education-heading", "Education"],
  ["#cv-languages-heading", "Languages"],
  ["#cv-certifications-heading", "Certifications"],
] as const;

/** The split lives in localStorage; a same-tab event tells the editor it changed. */
const SPLIT_EVENT = "ats-review-split";
let memorySplit = SPLIT_DEFAULT;

function readSplit(): number {
  try {
    const stored = Number(localStorage.getItem(SPLIT_KEY));
    return stored >= SPLIT_MIN && stored <= SPLIT_MAX ? stored : memorySplit;
  } catch {
    return memorySplit;
  }
}

function writeSplit(value: number) {
  memorySplit = Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value)) * 10) / 10;
  try {
    localStorage.setItem(SPLIT_KEY, String(memorySplit));
  } catch {
    // Storage blocked: kept in memory for this page.
  }
  window.dispatchEvent(new Event(SPLIT_EVENT));
}

function subscribeSplit(onChange: () => void) {
  window.addEventListener(SPLIT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SPLIT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
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
        "flex items-start gap-2 rounded-lg border p-3 text-[13px] leading-relaxed",
        tone === "warning"
          ? "border-warning/30 bg-warning-soft text-foreground"
          : "border-border bg-background-secondary text-foreground"
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
  const [matches, setMatches] = React.useState(
    cv.possible_duplicates ?? candidate.possible_duplicates
  );

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
      setMatches(data.possible_duplicates ?? []);
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

  // The split between document and fields, as a percentage of the width; remembered per browser.
  const splitRef = React.useRef<HTMLDivElement>(null);
  const split = React.useSyncExternalStore(subscribeSplit, readSplit, () => SPLIT_DEFAULT);
  const setSplit = React.useCallback((value: number) => writeSplit(value), []);
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const onMove = (move: PointerEvent) =>
      setSplit(((move.clientX - rect.left) / rect.width) * 100);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("user-select");
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const onSplitKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") setSplit(split - step);
    else if (event.key === "ArrowRight") setSplit(split + step);
    else if (event.key === "Home") setSplit(SPLIT_MIN);
    else if (event.key === "End") setSplit(SPLIT_MAX);
    else return;
    event.preventDefault();
  };

  const submit = form.handleSubmit(save);
  const status = CV_STATUS_BADGE[cv.status];

  return (
    <ReviewProvider value={{ confidence: saved.confidence, readOnly: !canEdit }}>
      {/* Full-bleed workspace under the app header: the document and the fields each scroll alone. */}
      <div className="-mx-4 -mt-6 -mb-6 flex flex-col sm:-mx-6 sm:-mt-8 sm:-mb-8 lg:-mx-8 lg:h-[calc(100dvh-3.5rem)]">
        <nav
          aria-label="Skip links"
          className="sr-only focus-within:not-sr-only focus-within:flex focus-within:gap-2 focus-within:p-2"
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

        {/* Compact header: who, which file, where it stands, and the way back. */}
        <header className="border-border bg-background flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/candidates/${candidate.id}`}
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              aria-label="Back to candidate"
              title="Back to candidate"
            >
              <ArrowLeft aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-[12.5px]">
                <span className="text-foreground font-medium">{name}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono text-[11.5px]">{cv.original_filename}</span>
              </p>
              <h1 className="text-foreground text-[17px] leading-tight font-semibold tracking-[-0.015em]">
                Review parsed CV
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>
              <StatusDot />
              {status.label}
            </Badge>
            {flagged.length > 0 && <Badge variant="warning">{flagged.length} to check</Badge>}
            <span className="text-muted-foreground hidden text-xs md:inline">
              {reviewedAt ? `Reviewed ${formatDate(reviewedAt)}` : "Awaiting review"}
            </span>
          </div>
        </header>

        <div
          ref={splitRef}
          className="flex min-h-0 flex-1 flex-col lg:flex-row"
          style={{ "--split": `${split}%` } as React.CSSProperties}
        >
          {/* Left: the original document on a calm reading well. */}
          <section
            id="cv-original"
            tabIndex={-1}
            aria-label="Original CV"
            className="flex h-[70dvh] min-h-0 flex-col bg-(--document-well) outline-none lg:h-auto lg:w-(--split) lg:shrink-0"
          >
            <PdfPane candidateId={candidate.id} cvId={cv.id} filename={cv.original_filename} />
          </section>

          {/* Resize handle: drag, or focus it and use the arrow keys. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the document and fields panels"
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            onPointerDown={startDrag}
            onKeyDown={onSplitKey}
            onDoubleClick={() => setSplit(SPLIT_DEFAULT)}
            className="group bg-border focus-visible:bg-electric hover:bg-electric/60 relative hidden w-px shrink-0 cursor-col-resize outline-none lg:block"
          >
            <span
              aria-hidden="true"
              className="bg-background border-border-strong group-hover:border-electric group-focus-visible:border-electric absolute top-1/2 left-1/2 flex h-8 w-2.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border"
            >
              <span className="bg-muted-foreground/60 h-3 w-px" />
            </span>
          </div>

          {/* Right: the extracted fields. */}
          <div
            id="cv-corrections"
            tabIndex={-1}
            className="bg-background flex min-h-0 min-w-0 flex-1 flex-col outline-none"
          >
            <nav
              aria-label="Sections"
              className="glass-bar sticky top-14 z-10 flex gap-1 overflow-x-auto border-b border-(--glass-border) px-4 py-2 sm:px-6 lg:static lg:top-auto"
            >
              {SECTION_LINKS.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md px-2.5 py-1.5 text-[12.5px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-5 px-4 pt-5 sm:px-6 lg:px-8">
                <PossibleDuplicates matches={matches} />
                {!canEdit && (
                  <Banner tone="info" icon={Lock}>
                    You can look at this CV and its parsed fields, but your role can&apos;t change
                    them.
                  </Banner>
                )}
                {!isLatestCv && (
                  <Banner tone="warning" icon={TriangleAlert}>
                    This isn&apos;t the candidate&apos;s latest CV. The fields on the right come
                    from their latest upload, so they may not match this PDF.
                  </Banner>
                )}

                {flagged.length > 0 && (
                  <details
                    open
                    className="border-warning/30 bg-warning-soft/60 rounded-lg border p-4"
                  >
                    <summary className="text-foreground focus-visible:ring-ring cursor-pointer rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
                      {flagged.length} {flagged.length === 1 ? "field" : "fields"} to check
                    </summary>
                    <p className="text-muted-foreground mt-1.5 text-[13px]">
                      The parser was unsure about these. Choose one to jump to it.
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {flagged.map((field) => (
                        <li key={field.pointer}>
                          <button
                            type="button"
                            onClick={() => focusPointer(field.pointer)}
                            className="border-warning/40 bg-background text-foreground hover:border-warning focus-visible:ring-ring inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {field.label} · {formatConfidence(field.confidence)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

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
                >
                  <div className="space-y-5 px-4 pt-5 sm:px-6 lg:px-8">
                    {problems.length > 0 && (
                      <div
                        role="alert"
                        className="border-destructive/30 bg-destructive-soft/60 rounded-lg border p-4"
                      >
                        <p className="text-destructive flex items-center gap-2 text-sm font-medium">
                          <CircleAlert className="size-4" aria-hidden="true" />
                          Fix {problems.length} {problems.length === 1 ? "problem" : "problems"} to
                          save
                        </p>
                        <ul className="mt-2 space-y-1">
                          {problems.map((problem) => (
                            <li key={problem.path}>
                              <button
                                type="button"
                                onClick={() => form.setFocus(problem.path as Path)}
                                className="text-foreground focus-visible:ring-ring rounded-sm text-left text-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
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
                  </div>

                  {canEdit && (
                    <div className="glass-bar sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-(--glass-border) px-4 py-3 sm:px-6 lg:px-8">
                      <p
                        role="status"
                        aria-live="polite"
                        className="text-muted-foreground text-[13px]"
                      >
                        {isDirty
                          ? "You have unsaved changes."
                          : reviewedAt
                            ? `Last reviewed ${formatDate(reviewedAt)}.`
                            : "Not reviewed yet."}{" "}
                        <span className="hidden font-mono text-[11.5px] 2xl:inline">
                          Ctrl+S saves.
                        </span>
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
