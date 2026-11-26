"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, MapPin, Phone, UserX } from "lucide-react";

import { getCandidate } from "@/api";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Badge, StatusDot } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, getInitials } from "@/lib/format";
import { CandidateApplications } from "./candidate-applications";
import { CandidateCvs } from "./candidate-cvs";
import { profileStatus } from "./candidates-table";
import { readParsedSummary } from "./parsed-cv";
import { ParsedSummary } from "./parsed-summary";
import { PossibleDuplicates, type PossibleDuplicate } from "./possible-duplicates";
import { ProfileSection } from "./profile-section";
import { unwrap, useResource } from "./use-resource";
import type { CandidateResponse } from "./use-candidates";

export function CandidateProfileSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading candidate">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-12">
        <Skeleton className="h-72 w-full rounded-xl lg:col-span-8" />
        <Skeleton className="h-56 w-full rounded-xl lg:col-span-4" />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground text-[12px]">{label}</dt>
      <dd className="text-foreground mt-0.5 text-[13.5px] break-words">{children}</dd>
    </div>
  );
}

const none = <span className="text-muted-foreground">—</span>;

function ContactCard({ candidate }: { candidate: CandidateResponse }) {
  const link =
    "focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md hover:underline focus-visible:ring-2 focus-visible:outline-none";
  return (
    <ProfileSection id="contact" title="Contact">
      <dl className="divide-border divide-y">
        <Fact label="Email">
          <a href={`mailto:${candidate.email}`} className={`${link} break-all`}>
            <Mail className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            {candidate.email}
          </a>
        </Fact>
        <Fact label="Phone">
          {candidate.phone ? (
            <a href={`tel:${candidate.phone.replace(/[^\d+]/g, "")}`} className={link}>
              <Phone className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              {candidate.phone}
            </a>
          ) : (
            none
          )}
        </Fact>
        <Fact label="Location">
          {candidate.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              {candidate.location}
            </span>
          ) : (
            none
          )}
        </Fact>
        <Fact label="Consent given">
          {candidate.consent_given_at ? formatDate(candidate.consent_given_at) : none}
        </Fact>
        <Fact label="Added">{formatDate(candidate.created_at)}</Fact>
      </dl>
    </ProfileSection>
  );
}

/** Header and contact load first; applications, CVs and the parsed summary follow on their own. */
export function CandidateProfile({ id }: { id: string }) {
  const load = React.useCallback(async () => unwrap(await getCandidate(id)), [id]);
  const { state, refetch } = useResource(load);
  const [latest, setLatest] = React.useState<{ id: string; matches: PossibleDuplicate[] }>();
  const onParsedMatches = React.useCallback(
    (matches: PossibleDuplicate[]) => setLatest({ id, matches }),
    [id]
  );

  if (state.phase === "loading") return <CandidateProfileSkeleton />;

  if (state.phase === "error") {
    return state.notFound ? (
      <EmptyState
        icon={UserX}
        title="Candidate not found"
        description="They may have been removed, or the link is wrong."
        action={
          <Link href="/candidates" className={buttonVariants({ variant: "outline" })}>
            Back to candidates
          </Link>
        }
      />
    ) : (
      <ErrorState
        title="Couldn't load this candidate"
        description="Something went wrong while fetching the profile."
        error={state.error}
        onRetry={refetch}
        action={
          <Link href="/candidates" className={buttonVariants({ variant: "ghost" })}>
            Back to candidates
          </Link>
        }
      />
    );
  }

  const candidate = state.data;
  const parsed = readParsedSummary(candidate.parsed_data);
  const status = profileStatus(candidate);
  return (
    <div className="space-y-8">
      <BackLink href="/candidates" label="Back to candidates" text="Candidates" className="-mb-3" />
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="bg-ink-950 text-canvas dark:bg-ink-700 flex size-14 shrink-0 items-center justify-center rounded-lg text-lg font-semibold tracking-tight"
        >
          {getInitials(candidate.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={candidate.full_name}
            description={parsed?.headline ?? undefined}
            meta={
              <>
                <Badge variant={status.variant}>
                  <StatusDot />
                  {status.label}
                </Badge>
                <span className="text-muted-foreground text-[13px] break-all">
                  {[candidate.email, candidate.location].filter(Boolean).join(" · ")}
                </span>
              </>
            }
          />
        </div>
      </div>

      <PossibleDuplicates
        matches={latest?.id === id ? latest.matches : candidate.possible_duplicates}
      />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-8 lg:col-span-8">
          <CandidateApplications candidateId={candidate.id} />
          <ParsedSummary data={candidate.parsed_data} />
        </div>
        <div className="min-w-0 space-y-8 lg:col-span-4">
          <ContactCard candidate={candidate} />
          <CandidateCvs candidateId={candidate.id} onParsedMatches={onParsedMatches} />
        </div>
      </div>
    </div>
  );
}
